import { useEffect, useState } from 'react';
import type { TopicSummary } from '@smart-learning/shared';
import { listTopics } from '../api.js';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
  activeSessionId: string | null;
  /** Bumped by the parent to force a refetch after the vault changes. */
  refreshKey: number;
}

function when(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Library({ open, onClose, onOpenSession, activeSessionId, refreshKey }: Props) {
  const [topics, setTopics] = useState<TopicSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    listTopics()
      .then(setTopics)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, refreshKey]);

  // Escape closes, matching the command-palette feel.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="library"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Learning vault"
      >
        <div className="panel__head">
          <span className="panel__title panel__title--magenta">vault</span>
          <span className="panel__spacer" />
          <span className="chip chip--dim">esc to close</span>
        </div>

        <div className="library__body">
          {error && <pre className="trace">{error}</pre>}

          {!topics && !error && <div className="library__hint">loading vault…</div>}

          {topics && topics.length === 0 && (
            <div className="library__hint">
              Nothing saved yet. Start a topic and it will show up here.
            </div>
          )}

          {topics?.map((t) => (
            <div className="topic" key={t.id}>
              <div className="topic__head">
                <div className="topic__name">{t.goal || t.name}</div>
                <span className="chip chip--dim">{t.id}</span>
              </div>

              {t.concepts.length > 0 && (
                <div className="topic__concepts">
                  {t.concepts.map((c) => (
                    <span
                      key={c.concept}
                      className="chip chip--violet"
                      title={`understanding ${Math.round(c.understanding * 100)}%`}
                    >
                      {c.concept}
                      <b className="chip__val">{Math.round(c.understanding * 100)}%</b>
                    </span>
                  ))}
                </div>
              )}

              {t.sessions.length === 0 ? (
                <div className="library__hint">no sessions</div>
              ) : (
                <ul className="sessions">
                  {t.sessions.map((s) => (
                    <li key={s.id}>
                      <button
                        className={`session${s.id === activeSessionId ? ' session--active' : ''}`}
                        onClick={() => onOpenSession(s.id)}
                        disabled={s.id === activeSessionId}
                      >
                        <span className={`chip ${s.mode === 'DONE' ? 'chip--lime' : 'chip--cyan'}`}>
                          {s.mode}
                        </span>
                        <span className="session__concept">{s.currentConcept}</span>
                        <span className="session__meta">
                          {s.messageCount} msg · {when(s.lastInteractionAt)}
                        </span>
                        <span className="session__go">
                          {s.id === activeSessionId ? 'current' : 'open ▸'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
