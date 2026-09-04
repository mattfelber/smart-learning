import { describe, it, expect } from 'vitest';
import { buildTrace, stateFromTrace, DEFAULT_EXAMPLE } from '@smart-learning/shared';

describe('sliding window visual', () => {
  it('produces a non-empty trace for the default example', () => {
    const trace = buildTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k);
    expect(trace.length).toBeGreaterThan(0);
    const last = trace[trace.length - 1];
    expect(last.phase).toBe('done');
  });

  it('starts before the array', () => {
    const state = stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, 0);
    expect(state.right).toBe(-1);
    expect(state.zeroCount).toBe(0);
  });

  it('advances right and left correctly', () => {
    const state = stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, 3);
    expect(state.right).toBeGreaterThanOrEqual(0);
    expect(state.left).toBeGreaterThanOrEqual(0);
  });

  it('marks askPrediction false at the final step', () => {
    const trace = buildTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k);
    const state = stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, trace.length - 1);
    expect(state.askPrediction).toBe(false);
  });
});
