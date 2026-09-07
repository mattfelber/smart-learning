import { describe, it, expect } from 'vitest';
import { extractPartialString } from '../partialJson.js';

describe('extractPartialString', () => {
  it('reads a complete value', () => {
    expect(extractPartialString('{"message": "Hello there", "mode": "TEACHING"}', 'message')).toBe(
      'Hello there'
    );
  });

  it('reads a value that is still being written', () => {
    expect(extractPartialString('{"message": "Next up, let us explore fixed', 'message')).toBe(
      'Next up, let us explore fixed'
    );
  });

  it('returns null before the key arrives', () => {
    expect(extractPartialString('{"mes', 'message')).toBeNull();
    expect(extractPartialString('{"message"', 'message')).toBeNull();
    expect(extractPartialString('{"message":', 'message')).toBeNull();
    expect(extractPartialString('{', 'message')).toBeNull();
  });

  it('returns an empty string once the value opens', () => {
    expect(extractPartialString('{"message": "', 'message')).toBe('');
  });

  it('decodes escapes, including newlines the tutor uses for paragraphs', () => {
    expect(extractPartialString('{"message": "line one\\nline two"}', 'message')).toBe(
      'line one\nline two'
    );
    expect(extractPartialString('{"message": "a \\"quote\\" here"}', 'message')).toBe(
      'a "quote" here'
    );
    expect(extractPartialString('{"message": "back\\\\slash"}', 'message')).toBe('back\\slash');
    expect(extractPartialString('{"message": "\\u00e9clair"}', 'message')).toBe('éclair');
  });

  it('does not emit a stray backslash when cut mid-escape', () => {
    expect(extractPartialString('{"message": "line one\\', 'message')).toBe('line one');
    expect(extractPartialString('{"message": "caf\\u00', 'message')).toBe('caf');
  });

  it('stops at the closing quote and ignores later keys', () => {
    const raw = '{"message": "done", "mode": "TEACHING", "correct": true}';
    expect(extractPartialString(raw, 'message')).toBe('done');
  });

  it('is monotonic as the fragment grows, which the UI relies on', () => {
    const full = '{"message": "Once the window reaches size K, how should left move?", "mode": "X"}';
    let previous = '';
    for (let n = 1; n <= full.length; n++) {
      const got = extractPartialString(full.slice(0, n), 'message') ?? '';
      // Text may only ever grow or stay equal; it must never rewind.
      expect(got.startsWith(previous) || previous.startsWith(got)).toBe(true);
      if (got.length >= previous.length) previous = got;
    }
    expect(previous).toBe('Once the window reaches size K, how should left move?');
  });

  it('tolerates whitespace and key order', () => {
    expect(extractPartialString('{\n  "message"  :   "spaced"\n}', 'message')).toBe('spaced');
    expect(extractPartialString('{"mode":"X","message":"second"}', 'message')).toBe('second');
  });
});
