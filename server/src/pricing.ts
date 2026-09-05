import type { TokenUsage } from '@smart-learning/shared';

/**
 * Standard-tier prices in USD per 1,000,000 tokens, transcribed from
 * https://ai.google.dev/gemini-api/docs/pricing on the date below.
 *
 * Two things to keep in mind when reading these:
 *  - Output price includes thinking tokens, so reasoning is billed at the
 *    output rate even though the API reports it in a separate counter.
 *  - Several Gemini 3.x Flash models are on promotional pricing that doubles
 *    on 1 January 2027, so each entry can carry a follow-on price.
 */
export const PRICES_AS_OF = '2026-09-04';

interface Rate {
  input: number;
  output: number;
  cachedInput?: number;
}

interface ModelPrice extends Rate {
  /** Price change date (ISO); `then` applies from this date onward. */
  until?: string;
  then?: Rate;
}

const PROMO_END = '2027-01-01';

export const MODEL_PRICING: Record<string, ModelPrice> = {
  'gemini-3.8-flash': {
    input: 0.75,
    output: 3.75,
    cachedInput: 0.075,
    until: PROMO_END,
    then: { input: 1.5, output: 7.5, cachedInput: 0.15 }
  },
  'gemini-3.7-flash': {
    input: 0.75,
    output: 3.75,
    cachedInput: 0.075,
    until: PROMO_END,
    then: { input: 1.5, output: 7.5, cachedInput: 0.15 }
  },
  'gemini-3.6-flash': {
    input: 0.75,
    output: 3.75,
    cachedInput: 0.075,
    until: PROMO_END,
    then: { input: 1.5, output: 7.5, cachedInput: 0.15 }
  },
  'gemini-3.5-flash': { input: 1.5, output: 9.0, cachedInput: 0.15 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5, cachedInput: 0.03 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5, cachedInput: 0.025 },
  'gemini-3-flash-preview': { input: 0.5, output: 3.0, cachedInput: 0.05 },
  // Pro is not on the free tier; included so a paid comparison is possible.
  'gemini-3.1-pro-preview': { input: 2.0, output: 12.0, cachedInput: 0.2 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0, cachedInput: 0.125 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5, cachedInput: 0.03 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4, cachedInput: 0.01 }
};

export function rateFor(model: string, at: Date = new Date()): Rate | null {
  const entry = MODEL_PRICING[model];
  if (!entry) return null;
  if (entry.until && entry.then && at >= new Date(entry.until)) return entry.then;
  return { input: entry.input, output: entry.output, cachedInput: entry.cachedInput };
}

/**
 * Cost of a single request in USD, or null when the model has no known price —
 * an unknown cost must not be reported as zero.
 */
export function costOf(usage: TokenUsage, model: string, at: Date = new Date()): number | null {
  const rate = rateFor(model, at);
  if (!rate) return null;

  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  const freshInput = Math.max(0, usage.inputTokens - cached);
  // Thinking tokens bill at the output rate.
  const billedOutput = usage.outputTokens + usage.thoughtTokens;

  return (
    (freshInput * rate.input) / 1_000_000 +
    (cached * (rate.cachedInput ?? rate.input)) / 1_000_000 +
    (billedOutput * rate.output) / 1_000_000
  );
}

export function isPriced(model: string): boolean {
  return Boolean(MODEL_PRICING[model]);
}
