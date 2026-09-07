import type {
  TutorResponse,
  SessionState,
  TopicSummary,
  UsageSummary
} from '@smart-learning/shared';

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

/**
 * Streaming chat over SSE. `onDelta` receives the tutor message as it is
 * written; the promise resolves with the complete response.
 *
 * Falls back to the blocking endpoint if streaming is unavailable, so a proxy
 * that buffers or a browser without ReadableStream still works.
 */
export async function chatStream(
  sessionId: string,
  message: string,
  onDelta: (messageSoFar: string) => void
): Promise<TutorResponse> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message })
  });

  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    if (!res.ok) return unwrap<TutorResponse>(res);
    return chat(sessionId, message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: TutorResponse | null = null;
  let failure: ApiError | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let split: number;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;

      const parsed = JSON.parse(data);
      if (event === 'delta') onDelta(parsed.text as string);
      else if (event === 'done') result = parsed as TutorResponse;
      else if (event === 'fail') {
        failure = new ApiError(parsed.error, parsed.kind, parsed.retryAfterSeconds ?? null);
      }
    }
  }

  if (failure) throw failure;
  if (!result) throw new ApiError('The tutor response ended before it was complete.');
  return result;
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

/** Free: rolls up the local token ledger. */
export function getUsage(sessionId?: string | null): Promise<UsageSummary> {
  return get(`/api/usage${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`);
}
