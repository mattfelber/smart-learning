import { describe, it, expect } from 'vitest';
import {
  VisualSpecSchema,
  parseVisualSpec,
  normalizeVisualSpec,
  slidingWindowSpec,
  stateFromTrace,
  DEFAULT_EXAMPLE
} from '@smart-learning/shared';

describe('VisualSpec validation', () => {
  it('parses a valid key-value spec', () => {
    const spec = parseVisualSpec({
      kind: 'key-value',
      title: 'counts',
      entries: [
        { key: '1', value: '3' },
        { key: '2', value: 2 },
        { key: '3', value: '1' }
      ],
      highlight: ['2']
    });
    expect(spec?.kind).toBe('key-value');
    expect(spec && spec.kind === 'key-value' ? spec.entries.length : 0).toBe(3);
  });

  it('parses a valid set spec', () => {
    const spec = parseVisualSpec({
      kind: 'set',
      values: [3, 2, 1],
      highlight: [3]
    });
    expect(spec?.kind).toBe('set');
  });

  it('parses a valid diagram spec', () => {
    const spec = parseVisualSpec({
      kind: 'diagram',
      nodes: [
        { id: 'browser', label: 'Browser' },
        { id: 'route', label: 'Express Route' },
        { id: 'ctrl', label: 'Controller' }
      ],
      edges: [
        { from: 'browser', to: 'route', label: 'GET /users' },
        { from: 'route', to: 'ctrl' }
      ],
      highlight: ['route']
    });
    expect(spec?.kind).toBe('diagram');
  });

  it('parses a valid array spec', () => {
    const spec = parseVisualSpec({
      kind: 'array',
      values: [4, 9, 2, 7],
      highlight: [1, 2],
      pointers: [
        { index: 1, label: 'L' },
        { index: 2, label: 'R' }
      ]
    });
    expect(spec?.kind).toBe('array');
  });

  it('rejects malformed specs without throwing', () => {
    expect(parseVisualSpec({ kind: 'temple-run', values: [] })).toBeUndefined();
    expect(parseVisualSpec({ kind: 'array' })).toBeUndefined();
    expect(parseVisualSpec({ kind: 'set', values: 'not-an-array' })).toBeUndefined();
    expect(parseVisualSpec({ kind: 'diagram', nodes: [] })).toBeUndefined();
    expect(parseVisualSpec('string')).toBeUndefined();
    expect(parseVisualSpec(null)).toBeUndefined();
    expect(parseVisualSpec(undefined)).toBeUndefined();
  });

  it('rejects oversized visuals', () => {
    expect(
      parseVisualSpec({ kind: 'array', values: Array.from({ length: 40 }, (_, i) => i) })
    ).toBeUndefined();
    expect(
      parseVisualSpec({
        kind: 'diagram',
        nodes: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, label: `n${i}` }))
      })
    ).toBeUndefined();
  });

  it('round-trips the server-built sliding-window spec', () => {
    const state = stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, 5);
    const spec = slidingWindowSpec(state);
    const parsed = VisualSpecSchema.safeParse(spec);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === 'sliding-window') {
      expect(parsed.data.stepIndex).toBe(5);
      expect(parsed.data.nums).toEqual(DEFAULT_EXAMPLE.nums);
    }
  });

  it('wraps a legacy bare sliding-window state', () => {
    const legacy = stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, 3);
    const spec = normalizeVisualSpec(legacy);
    expect(spec?.kind).toBe('sliding-window');
  });

  it('returns undefined for absent or junk persisted state', () => {
    expect(normalizeVisualSpec(undefined)).toBeUndefined();
    expect(normalizeVisualSpec({ hello: 'world' })).toBeUndefined();
  });
});
