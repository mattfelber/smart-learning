import { describe, it, expect } from 'vitest';
import {
  buildTrace,
  stateFromTrace,
  findStep,
  conceptHasVisual,
  DEFAULT_EXAMPLE
} from '@smart-learning/shared';

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

describe('findStep', () => {
  const { nums, k } = DEFAULT_EXAMPLE;

  it('round-trips every step in the trace', () => {
    const trace = buildTrace(nums, k);
    trace.forEach((step, i) => {
      const found = findStep(nums, k, {
        left: step.left,
        right: step.right,
        zeroCount: step.zeroCount
      });
      const match = trace[found];
      // Positions can repeat, so compare the position rather than the index.
      expect({ l: match.left, r: match.right, z: match.zeroCount }).toEqual({
        l: step.left,
        r: step.right,
        z: step.zeroCount
      });
      expect(found).toBeGreaterThanOrEqual(i - trace.length);
    });
  });

  it('recovers the step the tutor narrates after it has drifted ahead', () => {
    // The real bug: session.visualStep sat at 7 (left=0, right=3) while the
    // tutor was already describing left=4, right=5 around step 15/16.
    const drifted = findStep(nums, k, { left: 4, right: 5, zeroCount: 2 });
    expect(drifted).toBeGreaterThan(7);

    const state = stateFromTrace(nums, k, drifted);
    expect(state.left).toBe(4);
    expect(state.right).toBe(5);
    expect(state.zeroCount).toBe(2);
  });

  it('falls back to the closest step for a position not in the trace', () => {
    const found = findStep(nums, k, { left: 99, right: 99, zeroCount: 99 });
    expect(found).toBeGreaterThanOrEqual(0);
    expect(found).toBeLessThan(buildTrace(nums, k).length);
  });
});

describe('conceptHasVisual', () => {
  it('recognises sliding window concept slugs', () => {
    expect(conceptHasVisual('sliding-window')).toBe(true);
    expect(conceptHasVisual('sliding window basics')).toBe(true);
    expect(conceptHasVisual('sliding_window_shrink')).toBe(true);
  });

  it('rejects concepts that have no visualization', () => {
    expect(conceptHasVisual('binary-search-basics')).toBe(false);
    expect(conceptHasVisual('orientation')).toBe(false);
    expect(conceptHasVisual('masterchef-prep')).toBe(false);
  });
});
