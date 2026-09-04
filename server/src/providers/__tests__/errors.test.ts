import { describe, it, expect } from 'vitest';
import { classifyProviderError } from '../errors.js';

const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

// Trimmed from a real failure: both flash models over the daily free-tier cap,
// the last fallback overloaded.
const DAILY_QUOTA = `gemini-3.8-flash: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash\\nPlease retry in 31.930112062s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"31s"}]}}; gemini-3.5-flash: {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}`;

describe('classifyProviderError', () => {
  it('identifies the daily free-tier cap and never leaks raw JSON', () => {
    const err = classifyProviderError(DAILY_QUOTA, MODELS);

    expect(err.kind).toBe('RATE_LIMIT_DAILY');
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(32);
    expect(err.message).toContain('20 requests per model per day');
    // The learner-facing message must stay readable.
    expect(err.message).not.toContain('{');
    expect(err.message).not.toContain('quotaId');
    expect(err.message.length).toBeLessThan(240);
    // The raw payload is still available for the server log.
    expect(err.detail).toBe(DAILY_QUOTA);
  });

  it('separates a short per-minute limit from the daily cap', () => {
    const raw =
      'gemini-3.8-flash: {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded","details":[{"quotaId":"GenerateRequestsPerMinutePerProject-FreeTier"},{"retryDelay":"12s"}]}}';
    const err = classifyProviderError(raw, MODELS);
    expect(err.kind).toBe('RATE_LIMIT');
    expect(err.retryAfterSeconds).toBe(12);
    expect(err.message).toContain('12s');
  });

  it('flags transient overload as 503 with a default backoff', () => {
    const raw =
      'gemini-3.5-flash: {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}';
    const err = classifyProviderError(raw, MODELS);
    expect(err.kind).toBe('OVERLOADED');
    expect(err.status).toBe(503);
    expect(err.retryAfterSeconds).toBe(30);
  });

  it('flags a bad key as auth rather than a transient failure', () => {
    const raw = '{"error":{"code":400,"message":"API key not valid","status":"INVALID_ARGUMENT"}}';
    const err = classifyProviderError(raw, MODELS);
    expect(err.kind).toBe('AUTH');
    expect(err.status).toBe(401);
    expect(err.message).toContain('GEMINI_API_KEY');
  });

  it('falls back to UNKNOWN without exposing internals', () => {
    const err = classifyProviderError('socket hang up', MODELS);
    expect(err.kind).toBe('UNKNOWN');
    expect(err.status).toBe(502);
  });
});
