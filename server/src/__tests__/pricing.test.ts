import { describe, it, expect } from 'vitest';
import { costOf, rateFor, isPriced } from '../pricing.js';

const usage = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  thoughtTokens: 0,
  cachedTokens: 0,
  totalTokens: 2_000_000
};

describe('pricing', () => {
  it('bills thinking tokens at the output rate', () => {
    // The API reports thoughts separately from candidates, but Google bills
    // them as output. Splitting the same total across the two counters must
    // therefore cost exactly the same.
    const asOutput = costOf(
      { ...usage, outputTokens: 1000, thoughtTokens: 0 },
      'gemini-3.8-flash',
      new Date('2026-09-04')
    );
    const asThoughts = costOf(
      { ...usage, outputTokens: 0, thoughtTokens: 1000 },
      'gemini-3.8-flash',
      new Date('2026-09-04')
    );
    expect(asOutput).toBeCloseTo(asThoughts!, 10);

    // Ignoring thoughts entirely is what understates the bill.
    const split = costOf(
      { ...usage, outputTokens: 500, thoughtTokens: 500 },
      'gemini-3.8-flash',
      new Date('2026-09-04')
    );
    expect(split).toBeCloseTo(asOutput!, 10);
  });

  it('applies the promotional rate before 2027 and the increase after', () => {
    const promo = rateFor('gemini-3.8-flash', new Date('2026-12-31'));
    const after = rateFor('gemini-3.8-flash', new Date('2027-01-01'));
    expect(promo).toEqual({ input: 0.75, output: 3.75, cachedInput: 0.075 });
    expect(after).toEqual({ input: 1.5, output: 7.5, cachedInput: 0.15 });
  });

  it('charges cached input at the discounted rate', () => {
    const full = costOf(
      { inputTokens: 1000, outputTokens: 0, thoughtTokens: 0, cachedTokens: 0, totalTokens: 1000 },
      'gemini-3.1-flash-lite'
    );
    const cached = costOf(
      {
        inputTokens: 1000,
        outputTokens: 0,
        thoughtTokens: 0,
        cachedTokens: 1000,
        totalTokens: 1000
      },
      'gemini-3.1-flash-lite'
    );
    expect(cached!).toBeLessThan(full!);
    expect(cached!).toBeCloseTo(full! / 10, 10);
  });

  it('reports unknown cost as null rather than zero', () => {
    expect(costOf(usage, 'some-model-we-never-priced')).toBeNull();
    expect(isPriced('some-model-we-never-priced')).toBe(false);
    expect(isPriced('gemini-3.5-flash-lite')).toBe(true);
  });

  it('matches the published per-million rates', () => {
    const at = new Date('2026-09-04');
    // 1M in + 1M out, so the cost equals input rate + output rate.
    expect(costOf(usage, 'gemini-3.5-flash', at)).toBeCloseTo(1.5 + 9.0, 6);
    expect(costOf(usage, 'gemini-3.5-flash-lite', at)).toBeCloseTo(0.3 + 2.5, 6);
    expect(costOf(usage, 'gemini-3.1-flash-lite', at)).toBeCloseTo(0.25 + 1.5, 6);
    expect(costOf(usage, 'gemini-3.8-flash', at)).toBeCloseTo(0.75 + 3.75, 6);
  });
});
