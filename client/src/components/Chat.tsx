import { useState } from 'react';

interface Message {
  role: 'tutor' | 'learner';
  content: string;
}

interface Props {
  messages: Message[];
  onSend: (message: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export function Chat({ messages, onSend, disabled, placeholder = 'Type your answer...' }: Props) {
  const [input, setInput] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid #ccc',
          borderRadius: 8,
          padding: 12,
          minHeight: 300
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              textAlign: m.role === 'learner' ? 'right' : 'left'
            }}
          >
            <div
              style={{
                display: 'inline-block',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.role === 'learner' ? '#bde0fe' : '#f0f0f0',
                color: '#111',
                maxWidth: '80%'
              }}
            >
              <strong>{m.role === 'tutor' ? 'Tutor' : 'You'}</strong>
              <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{m.content}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #999' }}
        />
        <button type="submit" disabled={disabled} style={{ padding: '10px 16px' }}>
          Send
        </button>
      </form>
    </div>
  );
}
