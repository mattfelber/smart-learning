import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Tutor } from '../orchestrator.js';
import { Store } from '../../persistence/store.js';
import type { LLMProvider } from '../../providers/types.js';
import type { GenerateResponse } from '@smart-learning/shared';

const STUB_USAGE = {
  inputTokens: 800,
  outputTokens: 100,
  thoughtTokens: 50,
  cachedTokens: 0,
  totalTokens: 950
};

class StubProvider implements LLMProvider {
  private callCount = 0;

  async generate(): Promise<GenerateResponse> {
    this.callCount++;
    if (this.callCount === 1) {
      return {
        model: 'gemini-3.8-flash',
        usage: STUB_USAGE,
        text: JSON.stringify({
          message: 'What do you already know about arrays and indices?',
          mode: 'PROBING',
          concept: 'sliding-window',
          correct: null,
          misconceptions: [],
          confidenceAsk: false,
          advanceVisual: false,
          needsHint: false,
          nextReview: null
        })
      };
    }

    if (this.callCount === 3) {
      return {
        model: 'gemini-3.8-flash',
        usage: STUB_USAGE,
        text: '# Sliding Window\n\n## Goal\nLearn sliding window.\n\n## Next review\n2026-09-05'
      };
    }

    return {
      model: 'gemini-3.8-flash',
      usage: STUB_USAGE,
      text: JSON.stringify({
        message: 'Correct. Here is the next step.',
        mode: 'PREDICTING',
        concept: 'sliding-window',
        correct: true,
        misconceptions: [],
        confidenceAsk: false,
        advanceVisual: true,
        needsHint: false,
        nextReview: '2026-09-05'
      })
    };
  }

  supportsJson(): boolean {
    return true;
  }
}

function tempDir(): string {
  const dir = resolve(tmpdir(), `smart-learning-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Tutor orchestrator', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = tempDir();
  });

  afterEach(() => {
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  it('creates a topic and starts with a probe', async () => {
    const store = new Store(dataDir);
    await store.init();
    const tutor = new Tutor(new StubProvider(), store);

    const result = await tutor.startTopic('Sliding window algorithms for coding interviews');

    expect(result.sessionId).toBeDefined();
    expect(result.mode).toBe('PROBING');
    expect(result.concept).toBe('sliding-window');
    expect(result.message).toContain('arrays');

    const learnerState = store.loadLearnerState();
    expect(learnerState.lastTopicId).toBeDefined();

    const topic = store.loadTopic(learnerState.lastTopicId!);
    expect(topic).not.toBeNull();
    expect(topic!.goal).toBe('Sliding window algorithms for coding interviews');
  });

  it('advances and updates learner state on a correct answer', async () => {
    const store = new Store(dataDir);
    await store.init();
    const tutor = new Tutor(new StubProvider(), store);

    const start = await tutor.startTopic('Sliding window algorithms for coding interviews');
    const cont = await tutor.continueSession(start.sessionId, 'I know arrays and loops.');

    expect(cont.mode).toBe('PREDICTING');
    expect(cont.visualState?.kind).toBe('sliding-window');
    if (cont.visualState?.kind === 'sliding-window') {
      expect(cont.visualState.stepIndex).toBeGreaterThan(0);
    }

    const session = store.loadSession(start.sessionId);
    expect(session!.mode).toBe('PREDICTING');

    const topic = store.loadTopic(session!.topicId);
    const concept = topic!.concepts['sliding-window'];
    expect(concept).toBeDefined();
    expect(concept.understanding).toBeGreaterThan(0);
  });

  it('records a usage ledger line per model request', async () => {
    const store = new Store(dataDir);
    await store.init();
    const tutor = new Tutor(new StubProvider(), store);

    const start = await tutor.startTopic('Sliding window algorithms for coding interviews');
    await tutor.continueSession(start.sessionId, 'I know arrays and loops.');

    const records = store.loadUsage();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.kind === 'tutor-turn')).toBe(true);
    expect(records[0].sessionId).toBe(start.sessionId);
    expect(records[0].thoughtTokens).toBe(50);

    // 800 in @ $0.75/M + (100 + 50) out @ $3.75/M = 0.0006 + 0.0005625
    expect(records[0].costUsd).toBeCloseTo(0.0011625, 8);

    const summary = store.summarizeUsage(start.sessionId);
    expect(summary.allTime.requests).toBe(2);
    expect(summary.allTime.inputTokens).toBe(1600);
    expect(summary.session!.requests).toBe(2);
    expect(summary.perTurn!.inputTokens).toBe(800);
    expect(summary.unpricedModels).toHaveLength(0);
    expect(summary.byModel[0].key).toBe('gemini-3.8-flash');
  });

  it('counts the summary request too, under its own kind', async () => {
    const store = new Store(dataDir);
    await store.init();
    const tutor = new Tutor(new StubProvider(), store);

    const start = await tutor.startTopic('Sliding window algorithms for coding interviews');
    await tutor.continueSession(start.sessionId, 'I know arrays and loops.');
    await tutor.endSession(start.sessionId);

    const kinds = store.loadUsage().map((r) => r.kind);
    expect(kinds).toEqual(['tutor-turn', 'tutor-turn', 'session-summary']);
    // Averages must describe teaching turns, not the one-off summary.
    expect(store.summarizeUsage().perTurn!.inputTokens).toBe(800);
  });

  it('ends a session and writes markdown notes', async () => {
    const store = new Store(dataDir);
    await store.init();
    const provider = new StubProvider();
    const tutor = new Tutor(provider, store);

    const start = await tutor.startTopic('Sliding window algorithms for coding interviews');
    await tutor.continueSession(start.sessionId, 'I know arrays and loops.');
    const note = await tutor.endSession(start.sessionId);

    expect(note).toContain('#');
    const session = store.loadSession(start.sessionId);
    expect(session!.mode).toBe('DONE');
  });
});
