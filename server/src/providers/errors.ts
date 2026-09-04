export type ProviderErrorKind =
  | 'RATE_LIMIT_DAILY'
  | 'RATE_LIMIT'
  | 'OVERLOADED'
  | 'AUTH'
  | 'UNKNOWN';

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public retryAfterSeconds: number | null = null,
    /** Raw upstream text, for the server log only — never for the UI. */
    public detail?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  get status(): number {
    switch (this.kind) {
      case 'RATE_LIMIT_DAILY':
      case 'RATE_LIMIT':
        return 429;
      case 'OVERLOADED':
        return 503;
      case 'AUTH':
        return 401;
      default:
        return 502;
    }
  }
}

/**
 * Gemini reports the delay twice and they disagree: the structured retryDelay
 * is truncated ("31s") while the prose keeps the fraction ("31.930112062s").
 * Take the larger so we never come back a moment too early.
 */
function retryDelayFrom(raw: string): number | null {
  const candidates = [
    /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(raw)?.[1],
    /retry in (\d+(?:\.\d+)?)s/i.exec(raw)?.[1]
  ]
    .filter((v): v is string => v !== undefined)
    .map((v) => Math.ceil(Number(v)));

  return candidates.length ? Math.max(...candidates) : null;
}

function humanDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)}h`;
}

/**
 * Turn the concatenated upstream failures into one sentence a learner can act
 * on. The raw Gemini payload is several hundred characters of nested JSON and
 * was previously rendered straight into the chat.
 */
export function classifyProviderError(raw: string, models: string[]): ProviderError {
  const daily = /PerDayPerProject|GenerateRequestsPerDay/.test(raw);
  const exhausted = /RESOURCE_EXHAUSTED|\b429\b/.test(raw);
  const overloaded = /UNAVAILABLE|high demand|\b503\b/.test(raw);
  const auth = /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|\b401\b|\b403\b/.test(raw);
  const retry = retryDelayFrom(raw);
  const limit = /"quotaValue":\s*"(\d+)"/.exec(raw)?.[1];
  const tried = models.join(', ');

  if (auth) {
    return new ProviderError(
      'AUTH',
      'Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.',
      null,
      raw
    );
  }

  if (exhausted && daily) {
    return new ProviderError(
      'RATE_LIMIT_DAILY',
      `Daily free-tier quota used up${limit ? ` (${limit} requests per model per day)` : ''}. ` +
        `Tried ${tried}. The allowance resets on Google's daily schedule — or add billing to raise it.`,
      retry,
      raw
    );
  }

  if (exhausted) {
    return new ProviderError(
      'RATE_LIMIT',
      `Sending requests too quickly for the free tier.` +
        (retry ? ` Try again in ${humanDuration(retry)}.` : ' Wait a moment and retry.'),
      retry,
      raw
    );
  }

  if (overloaded) {
    return new ProviderError(
      'OVERLOADED',
      `Gemini is busy right now and every fallback model (${tried}) was unavailable. ` +
        `This is usually brief — retry shortly.`,
      retry ?? 30,
      raw
    );
  }

  return new ProviderError('UNKNOWN', 'The Gemini request failed. See the server log.', null, raw);
}
