import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown.js';

interface Message {
  role: 'tutor' | 'learner';
  content: string;
  error?: boolean;
}

interface Props {
  messages: Message[];
  onSend: (message: string) => void;
  disabled: boolean;
  loading?: boolean;
  hasSession?: boolean;
  placeholder?: string;
}

export function Chat({
  messages,
  onSend,
  disabled,
  loading = false,
  hasSession = false,
  placeholder = 'Explain it in your own words…'
}: Props) {
  const [input, setInput] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Stick to the newest message as the conversation grows.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, loading]);

  // Hand focus back to the composer the moment the tutor is done talking.
  useEffect(() => {
    if (!disabled) boxRef.current?.focus();
  }, [disabled]);

  // Auto-grow the textarea instead of scrolling a one-line input.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }, [input]);

  function submit() {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="chat">
      <div className="chat__log" ref={logRef}>
        {messages.length === 0 && (
          <div className="empty">
            <div className="empty__glyph mono">{'{ }'}</div>
            <div className="empty__title">no session running</div>
            <p className="empty__hint">
              Type a goal up top and hit <kbd>New Topic</kbd>. The tutor probes what you already
              know, then teaches around the gaps — with the algorithm animating beside you.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`msg msg--${m.role}${m.error ? ' msg--error' : ''}`}
          >
            <div className="msg__who">
              {m.error ? '! fault' : m.role === 'tutor' ? '◈ tutor' : 'you ▸'}
            </div>
            <div className="msg__bubble">
              {m.role === 'tutor' && !m.error ? (
                <Markdown>{m.content}</Markdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg msg--tutor">
            <div className="msg__who">◈ tutor</div>
            <div className="msg__bubble typing" aria-label="Tutor is thinking">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer__wrap">
          <textarea
            ref={boxRef}
            className="field"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={hasSession ? placeholder : 'start a topic to begin…'}
            aria-label="Your reply"
          />
          <p className="composer__hint">
            <kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> newline
          </p>
        </div>
        <button
          className="btn btn--primary"
          type="button"
          onClick={submit}
          disabled={disabled || !input.trim()}
        >
          Send ▸
        </button>
      </div>
    </div>
  );
}
