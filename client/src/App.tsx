import { useEffect, useState } from 'react';
import type {
  SessionState,
  SlidingWindowVisualState,
  TutorResponse,
  UsageSummary
} from '@smart-learning/shared';
import { conceptHasVisual } from '@smart-learning/shared';
import { Chat } from './components/Chat.js';
import { Visualizer } from './components/Visualizer.js';
import { Markdown } from './components/Markdown.js';
import { Library } from './components/Library.js';
import { Usage } from './components/Usage.js';
import {
  newTopic,
  chatStream,
  resume,
  endSession,
  checkResume,
  health,
  openSession,
  getTranscript,
  getUsage,
  ApiError
} from './api.js';

interface Message {
  role: 'tutor' | 'learner';
  content: string;
  error?: boolean;
}

const MODE_TONE: Record<string, string> = {
  PROBING: 'chip--violet',
  TEACHING: 'chip--cyan',
  PREDICTING: 'chip--amber',
  PRACTICING: 'chip--magenta',
  REVIEWING: 'chip--violet',
  DONE: 'chip--lime'
};

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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [vaultVersion, setVaultVersion] = useState(0);
  const [alert, setAlert] = useState<{ message: string; kind: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  /** Tutor text arriving right now; null when nothing is streaming. */
  const [streaming, setStreaming] = useState<string | null>(null);

  // Reads the local ledger only, so it is cheap to refresh after every turn.
  function refreshUsage(id: string | null = sessionId) {
    getUsage(id).then(setUsage).catch(() => {});
  }

  useEffect(() => {
    refreshUsage(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Count down the provider's suggested retry delay so the wait is visible.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    health().then((h) => {
      setConfigured(h.configured);
    });
    checkResume().then((r) => setResumeAvailable(r.available));
  }, []);

  /**
   * Switching to a different topic or session must not leave the previous
   * transcript, visual or concept on screen — that made a successful switch
   * look like nothing had happened.
   */
  function resetSession() {
    setMessages([]);
    setSessionId(null);
    setVisualState(null);
    setMode('');
    setConcept('');
    setHintLevel(0);
    setNotes('');
    setAlert(null);
  }

  /**
   * Rebuild the whole UI from a saved session. Free — the transcript, mode,
   * concept and visual position are all already on disk, so reopening past
   * work costs no model requests. That matters on the free tier, where the
   * daily allowance is small.
   */
  function hydrateFromSession(s: SessionState) {
    setSessionId(s.id);
    setMode(s.mode);
    setConcept(s.currentConcept);
    setHintLevel(s.hintLevel ?? 0);
    setMessages(
      s.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'tutor' | 'learner', content: m.content }))
    );
    // Older sessions stored a sliding-window state even for concepts that have
    // no visualization, so gate on the concept as well as presence.
    setVisualState(s.visualState && conceptHasVisual(s.currentConcept) ? s.visualState : null);
  }

  async function startNew() {
    setLoading(true);
    resetSession();
    try {
      const res = await newTopic(goalInput);
      applyResponse(res);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
      setVaultVersion((v) => v + 1);
    }
  }

  /** Reopen a past session for free; the tutor is not called. */
  async function doOpenSession(id: string) {
    setLibraryOpen(false);
    setLoading(true);
    resetSession();
    try {
      hydrateFromSession(await getTranscript(id));
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  /** Optional, costs one request: ask the tutor to summarise where we left off. */
  async function doCatchMeUp() {
    if (!sessionId) return;
    setLoading(true);
    try {
      applyResponse(await openSession(sessionId));
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
      setVaultVersion((v) => v + 1);
    }
  }

  async function sendMessage(text: string): Promise<boolean> {
    if (!sessionId) return false;
    setMessages((m) => [...m, { role: 'learner', content: text }]);
    setLoading(true);
    setStreaming('');
    try {
      const res = await chatStream(sessionId, text, setStreaming);
      setStreaming(null);
      appendTutor(res);
      refreshUsage(sessionId);
      return true;
    } catch (err) {
      setStreaming(null);
      // Roll the optimistic bubble back out so the composer can hand the text
      // back instead of the learner having to retype it.
      setMessages((m) => {
        const i = m.reduce(
          (found, msg, idx) =>
            msg.role === 'learner' && msg.content === text ? idx : found,
          -1
        );
        return i === -1 ? m : [...m.slice(0, i), ...m.slice(i + 1)];
      });
      handleError(err);
      return false;
    } finally {
      setLoading(false);
    }
  }

  /** Reopen the latest unfinished session for free. */
  async function doResume() {
    setLoading(true);
    resetSession();
    try {
      const res = await checkResume();
      if (!res.available || !res.session) {
        setResumeAvailable(false);
      } else {
        hydrateFromSession(res.session);
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
      setVisualState(null);
      setMessages((m) => [
        ...m,
        { role: 'tutor', content: 'Session ended. Notes saved below.' }
      ]);
      setResumeAvailable(false);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
      setVaultVersion((v) => v + 1);
    }
  }

  function applyResponse(res: (TutorResponse & { sessionId: string }) | TutorResponse) {
    if ('needsConfig' in res && res.needsConfig) {
      setConfigured(false);
      setConfigError(res.configError ?? 'Gemini not configured.');
      setMessages((m) => [
        ...m,
        { role: 'tutor', content: res.configError ?? 'Gemini not configured.', error: true }
      ]);
      return;
    }
    const full = res as TutorResponse & { sessionId: string };
    refreshUsage(full.sessionId);
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
    // Quota and overload are normal operating conditions on the free tier, so
    // surface them as an actionable banner rather than a fault bubble.
    if (err instanceof ApiError && err.kind !== 'UNKNOWN') {
      setAlert({ message: err.message, kind: err.kind });
      // Only count down when waiting actually helps. The daily cap also
      // reports a retryDelay, but coming back in 32 seconds changes nothing,
      // and blocking the composer would just imply otherwise.
      const waitable = err.kind === 'RATE_LIMIT' || err.kind === 'OVERLOADED';
      if (waitable && err.retryAfterSeconds && err.retryAfterSeconds <= 600) {
        setCooldown(err.retryAfterSeconds);
      }
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    setMessages((m) => [...m, { role: 'tutor', content: `Error: ${msg}`, error: true }]);
  }

  if (configured === null) {
    return (
      <div className="boot">
        <span>initializing neural link…</span>
      </div>
    );
  }

  if (configured === false) {
    return (
      <div className="setup">
        <div className="setup__card">
          <div className="setup__badge">
            <span className="dot dot--off" /> api key required
          </div>
          <h1 className="setup__title">Smart Learning</h1>
          <p className="setup__lede">
            The tutor runs on Gemini. Drop in a key and the lights come on — it takes about a
            minute.
          </p>
          <ol className="steps">
            <li>
              Grab a free API key from{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>
            </li>
            <li>
              Create a <code>.env</code> file next to <code>.env.example</code>
            </li>
            <li>
              Add <code>GEMINI_API_KEY=your-key</code>
            </li>
            <li>Restart the dev server</li>
          </ol>
          {configError && <pre className="trace">{configError}</pre>}
        </div>
      </div>
    );
  }

  const statusTone = loading ? 'dot--busy' : sessionId ? 'dot--live' : 'dot';

  return (
    <div className="shell">
      <header className="titlebar">
        <div className="lights">
          <i />
          <i />
          <i />
        </div>
        <div className="brand mono">
          <span className="brand__mark">◈</span>
          <span className="brand__name">smart-learning</span>
          <span className="brand__ver">v0.1</span>
        </div>
        <div className="titlebar__right">
          {sessionId && (
            <>
              <span className="chip chip--violet">
                <span className="chip__key">concept</span>
                <span className="chip__val">{concept}</span>
              </span>
              <span className={`chip ${MODE_TONE[mode] ?? 'chip--cyan'}`}>{mode || 'IDLE'}</span>
            </>
          )}
          <span className="chip chip--dim">
            <span className={`dot ${statusTone}`} />
            {loading ? 'thinking' : sessionId ? 'live' : 'ready'}
          </span>
        </div>
      </header>

      <div className="cmdbar">
        <label className="cmdbar__input">
          <span className="cmdbar__prompt mono">›</span>
          <input
            className="field"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && goalInput.trim() && !loading) startNew();
            }}
            placeholder="what do you want to learn?"
            aria-label="Learning goal"
          />
        </label>
        <button
          className="btn btn--primary"
          onClick={startNew}
          disabled={loading || !goalInput.trim()}
        >
          ▶ New Topic
        </button>
        {resumeAvailable && (
          <button className="btn btn--ghost-violet" onClick={doResume} disabled={loading}>
            ⟲ Resume
          </button>
        )}
        {sessionId && (
          <button
            className="btn btn--ghost-violet"
            onClick={doCatchMeUp}
            disabled={loading || cooldown > 0}
            title="Ask the tutor to summarise where you left off (uses one request)"
          >
            ⤴ Catch me up
          </button>
        )}
        {sessionId && (
          <button className="btn btn--ghost-magenta" onClick={doEnd} disabled={loading}>
            ■ End &amp; Notes
          </button>
        )}
        <button className="btn" onClick={() => setLibraryOpen(true)} disabled={loading}>
          ☰ Vault
        </button>
        <button
          className="btn"
          onClick={() => {
            refreshUsage(sessionId);
            setUsageOpen(true);
          }}
          title="Token usage and estimated cost"
        >
          ⌁ Tokens
        </button>
      </div>

      {alert && (
        <div className={`alert${alert.kind === 'AUTH' ? ' alert--auth' : ''}`} role="status">
          <span className="alert__icon">{alert.kind === 'OVERLOADED' ? '◴' : '⚠'}</span>
          <div className="alert__body">
            <div className="alert__title">
              {alert.kind === 'RATE_LIMIT_DAILY'
                ? 'Daily quota reached'
                : alert.kind === 'RATE_LIMIT'
                ? 'Slow down'
                : alert.kind === 'OVERLOADED'
                ? 'Model busy'
                : 'Configuration problem'}
            </div>
            <div className="alert__text">{alert.message}</div>
          </div>
          {cooldown > 0 && <span className="chip chip--amber">retry in {cooldown}s</span>}
          <button className="btn btn--icon" onClick={() => setAlert(null)} title="Dismiss">
            ✕
          </button>
        </div>
      )}

      <main className={`workspace ${visualState ? 'workspace--split' : ''}`}>
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">tutor.session</span>
            <span className="panel__spacer" />
            <span className="chip chip--dim">{messages.length} msg</span>
          </div>
          <Chat
            messages={messages}
            onSend={sendMessage}
            disabled={loading || !sessionId || cooldown > 0}
            loading={loading}
            streaming={streaming}
            hasSession={!!sessionId}
          />
        </section>

        {visualState && (
          <section className="panel">
            <Visualizer visualState={visualState} />
          </section>
        )}
      </main>

      {notes && (
        <section className="panel" style={{ marginBottom: 14, maxHeight: '40vh' }}>
          <div className="panel__head">
            <span className="panel__title panel__title--magenta">session.notes.md</span>
          </div>
          <div className="panel__body notes">
            <Markdown>{notes}</Markdown>
          </div>
        </section>
      )}

      <footer className="statusbar">
        <span className="statusbar__item">
          <span className={`dot ${statusTone}`} />
          <b>{loading ? 'GENERATING' : sessionId ? 'CONNECTED' : 'STANDBY'}</b>
        </span>
        {sessionId && (
          <>
            <span className="statusbar__item">
              hints <b>{hintLevel}</b>
            </span>
            <span className="statusbar__item">
              turns <b>{messages.length}</b>
            </span>
          </>
        )}
        {usage && (usage.session ?? usage.today).requests > 0 && (
          <button
            className="statusbar__item statusbar__item--btn"
            onClick={() => setUsageOpen(true)}
            title="Token usage and estimated cost"
          >
            ⌁{' '}
            <b>
              {(
                (usage.session ?? usage.today).inputTokens +
                (usage.session ?? usage.today).outputTokens +
                (usage.session ?? usage.today).thoughtTokens
              ).toLocaleString()}
            </b>{' '}
            tok · R$
            {((usage.session ?? usage.today).costUsd * usage.usdBrl).toFixed(3)}
          </button>
        )}
        <span className="statusbar__right">
          {concept && <span className="statusbar__item">{concept}</span>}
          <span className="statusbar__item">gemini</span>
          <span className="statusbar__item">utf-8</span>
          <span className="statusbar__item">tsx</span>
        </span>
      </footer>

      <Library
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onOpenSession={doOpenSession}
        activeSessionId={sessionId}
        refreshKey={vaultVersion}
      />

      <Usage open={usageOpen} onClose={() => setUsageOpen(false)} usage={usage} />
    </div>
  );
}
