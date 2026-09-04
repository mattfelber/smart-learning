import type { TutorResponse, SessionState, TopicSummary } from '@smart-learning/shared';

export type ApiErrorKind =
  | 'RATE_LIMIT_DAILY'
  | 'RATE_LIMIT'
  | 'OVERLOADED'
  | 'AUTH'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    message: string,
    public kind: ApiErrorKind = 'UNKNOWN',
    public retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The server sends `{ error, kind, retryAfterSeconds }`. Reading the raw body
 * instead dumped several hundred characters of nested Gemini JSON into the
 * chat, so always go through the structured field.
 */
async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;

  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      kind?: ApiErrorKind;
      retryAfterSeconds?: number | null;
    };
    throw new ApiError(
      parsed.error ?? `Request failed (${res.status})`,
      parsed.kind ?? 'UNKNOWN',
      parsed.retryAfterSeconds ?? null
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(body || `Request failed (${res.status})`);
  }
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then((r) => unwrap<T>(r));
}

function get<T>(path: string): Promise<T> {
  return fetch(path).then((r) => unwrap<T>(r));
}

export function health(): Promise<{ ok: boolean; configured: boolean }> {
  return get('/api/health');
}

export function newTopic(goal: string): Promise<TutorResponse & { sessionId: string }> {
  return post('/api/new-topic', { goal });
}

export function chat(sessionId: string, message: string): Promise<TutorResponse> {
  return post('/api/chat', { sessionId, message });
}

/** Costs one model request. */
export function resume(): Promise<TutorResponse & { sessionId: string; available: boolean }> {
  return post('/api/resume');
}

export function checkResume(): Promise<{ available: boolean; session?: SessionState }> {
  return get('/api/resume');
}

export function listTopics(): Promise<TopicSummary[]> {
  return get('/api/topics');
}

/** Costs one model request — asks the tutor for a fresh orienting turn. */
export function openSession(sessionId: string): Promise<TutorResponse & { sessionId: string }> {
  return post('/api/open', { sessionId });
}

/** Free: reads the saved transcript, no model request. */
export function getTranscript(sessionId: string): Promise<SessionState> {
  return get(`/api/session/${encodeURIComponent(sessionId)}`);
}

export function endSession(sessionId: string): Promise<{ note: string }> {
  return post('/api/end', { sessionId });
}
