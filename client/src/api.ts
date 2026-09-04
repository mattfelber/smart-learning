import type { TutorResponse, SessionState } from '@smart-learning/shared';

export async function health(): Promise<{ ok: boolean; configured: boolean }> {
  const res = await fetch('/api/health');
  return res.json();
}

export async function newTopic(goal: string): Promise<TutorResponse & { sessionId: string }> {
  const res = await fetch('/api/new-topic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function chat(sessionId: string, message: string): Promise<TutorResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resume(): Promise<TutorResponse & { sessionId: string; available: boolean }> {
  const res = await fetch('/api/resume', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function checkResume(): Promise<{ available: boolean; session?: SessionState }> {
  const res = await fetch('/api/resume');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function endSession(sessionId: string): Promise<{ note: string }> {
  const res = await fetch('/api/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
