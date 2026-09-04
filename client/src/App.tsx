import { useEffect, useState } from 'react';
import type { SlidingWindowVisualState, TutorResponse } from '@smart-learning/shared';
import { Chat } from './components/Chat.js';
import { Visualizer } from './components/Visualizer.js';
import { newTopic, chat, resume, endSession, checkResume, health } from './api.js';

interface Message {
  role: 'tutor' | 'learner';
  content: string;
}

export default function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string>('');
  const [goalInput, setGoalInput] = useState('Sliding window algorithms for coding interviews');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [visualState, setVisualState] = useState<SlidingWindowVisualState | null>(null);
  const [mode, setMode] = useState<string>('');
  const [concept, setConcept] = useState<string>('');
  const [hintLevel, setHintLevel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    health().then((h) => {
      setConfigured(h.configured);
    });
    checkResume().then((r) => setResumeAvailable(r.available));
  }, []);

  async function startNew() {
    setLoading(true);
    setNotes('');
    try {
      const res = await newTopic(goalInput);
      applyResponse(res);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(text: string) {
    if (!sessionId) return;
    setMessages((m) => [...m, { role: 'learner', content: text }]);
    setLoading(true);
    try {
      const res = await chat(sessionId, text);
      appendTutor(res);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  async function doResume() {
    setLoading(true);
    setNotes('');
    try {
      const res = await resume();
      if (res.available === false) {
        setResumeAvailable(false);
      } else {
        applyResponse(res);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  async function doEnd() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await endSession(sessionId);
      setNotes(res.note);
      setMode('DONE');
      setMessages((m) => [
        ...m,
        { role: 'tutor', content: 'Session ended. Notes saved below.' }
      ]);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  function applyResponse(res: (TutorResponse & { sessionId: string }) | TutorResponse) {
    if ('needsConfig' in res && res.needsConfig) {
      setConfigured(false);
      setConfigError(res.configError ?? 'Gemini not configured.');
      setMessages((m) => [
        ...m,
        { role: 'tutor', content: res.configError ?? 'Gemini not configured.' }
      ]);
      return;
    }
    const full = res as TutorResponse & { sessionId: string };
    setSessionId(full.sessionId);
    setMode(full.mode);
    setConcept(full.concept);
    setHintLevel(full.hintLevel);
    setVisualState(full.visualState ?? null);
    setMessages((m) => [...m, { role: 'tutor', content: full.message }]);
  }

  function appendTutor(res: TutorResponse) {
    if ('needsConfig' in res && res.needsConfig) {
      setConfigured(false);
      setConfigError(res.configError ?? 'Gemini not configured.');
    }
    setMode(res.mode);
    setConcept(res.concept);
    setHintLevel(res.hintLevel);
    setVisualState(res.visualState ?? null);
    setMessages((m) => [...m, { role: 'tutor', content: res.message }]);
  }

  function handleError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setMessages((m) => [...m, { role: 'tutor', content: `Error: ${msg}` }]);
  }

  if (configured === false) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <h1>Smart Learning</h1>
        <p>Gemini is not configured. Add your API key to continue.</p>
        <ol>
          <li>
            Get a free API key from{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
          </li>
          <li>Create a <code>.env</code> file next to <code>.env.example</code></li>
          <li>
            Add <code>GEMINI_API_KEY=your-key</code>
          </li>
          <li>Restart the dev server</li>
        </ol>
        {configError && <pre style={{ color: 'red' }}>{configError}</pre>}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Smart Learning</h1>
      </header>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          placeholder="What do you want to learn?"
          style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #999' }}
        />
        <button onClick={startNew} disabled={loading || !goalInput.trim()} style={{ padding: '10px 16px' }}>
          New Topic
        </button>
        {resumeAvailable && (
          <button onClick={doResume} disabled={loading} style={{ padding: '10px 16px' }}>
            Resume
          </button>
        )}
        {sessionId && (
          <button onClick={doEnd} disabled={loading} style={{ padding: '10px 16px' }}>
            End & Notes
          </button>
        )}
      </div>

      {sessionId && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 12,
            fontSize: 14,
            color: '#555'
          }}
        >
          <span>
            <strong>Concept:</strong> {concept}
          </span>
          <span>
            <strong>Mode:</strong> {mode}
          </span>
          <span>
            <strong>Hint level:</strong> {hintLevel}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <Chat messages={messages} onSend={sendMessage} disabled={loading || !sessionId} />
        </div>

        {visualState && (
          <div style={{ flex: 1, minWidth: 320 }}>
            <Visualizer visualState={visualState} />
          </div>
        )}
      </div>

      {notes && (
        <div style={{ marginTop: 24, padding: 12, border: '1px solid #ccc', borderRadius: 8 }}>
          <h2>Session Notes</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{notes}</pre>
        </div>
      )}
    </div>
  );
}
