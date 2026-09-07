import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { detectLearnerDirective } from '../learnerControl.js';
import { tutorPrompt } from '../prompts.js';
import { Tutor } from '../orchestrator.js';
import { Store } from '../../persistence/store.js';
import type { LLMProvider } from '../../providers/types.js';
import type { ConceptState, GenerateResponse } from '@smart-learning/shared';

describe('detectLearnerDirective', () => {
  it('detects move-on requests', () => {
    for (const s of [
      'move on',
      'let’s move forward',
      'skip this',
      'I already know this',
      'I already answered this',
      'stop asking me this'
    ]) {
      expect(detectLearnerDirective(s)?.kind, s).toBe('move-on');
    }
  });

  it('detects direct-answer requests and uncertainty', () => {
    for (const s of ['just tell me', "what's the answer", 'explain it', 'idk', 'not sure', 'I don’t know']) {
      expect(detectLearnerDirective(s)?.kind, s).toBe('direct');
    }
  });

  it('detects scope corrections', () => {
    for (const s of ['focus on interviews', 'keep this practical', "don't go that deep"]) {
      expect(detectLearnerDirective(s)?.kind, s).toBe('scope');
    }
  });

  it('does not fire on ordinary answers', () => {
    for (const s of ['O(n)', 'the window shrinks', 'it returns 4', 'I think it uses a hash map']) {
      expect(detectLearnerDirective(s), s).toBeNull();
    }
  });
});

const CTX_BASE = {
  goal: 'Python for coding interviews',
  mode: 'PROBING',
  concept: 'hash-maps',
  recentMessages: [],
  learnerInput: 'hi',
  hintLevel: 0,
  currentVisualText: null,
  currentVisualSpec: null
};

const conceptState: ConceptState = {
  concept: 'hash-maps',
  understanding: 0,
  recall: 0,
  application: 0,
  transfer: 0,
  confidence: null,
  misconceptions: [],
  evidence: [],
  lastTested: null,
  nextReview: null
};

describe('tutorPrompt learner control', () => {
  it('injects a learner directive when present', () => {
    const p = tutorPrompt({
      ...CTX_BASE,
      conceptState,
      covered: [],
      probeCount: 0,
      directive: 'The learner said "move on". Do not probe this objective again.'
    });
    expect(p).toContain('LEARNER DIRECTIVE');
    expect(p).toContain('move on');
  });

  it('escalates to direct teaching after repeated probing', () => {
    const p = tutorPrompt({ ...CTX_BASE, conceptState, covered: [], probeCount: 3, directive: null });
    expect(p).toContain('already probed this objective repeatedly');
  });

  it('lists covered objectives so they are not re-tested', () => {
    const p = tutorPrompt({
      ...CTX_BASE,
      conceptState,
      covered: ['hash-maps', 'sets'],
      probeCount: 0,
      directive: null
    });
    expect(p).toContain('hash-maps, sets');
    expect(p).toContain('do not re-test');
  });
});

class FixedProvider implements LLMProvider {
  constructor(private output: Record<string, unknown>) {}
  async generate(): Promise<GenerateResponse> {
    return { model: 'stub', text: JSON.stringify({ message: 'ok', mode: 'TEACHING', concept: 'hash-maps', ...this.output }) };
  }
  supportsJson(): boolean {
    return true;
  }
}

function tempDir(): string {
  const dir = resolve(tmpdir(), `smart-learning-ctrl-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('lesson bookkeeping', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = tempDir();
  });
  afterEach(() => {
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  it('marks the concept covered after a correct answer and resets probes', async () => {
    const store = new Store(dataDir);
    await store.init();
    const tutor = new Tutor(new FixedProvider({ correct: true }), store);

    const start = await tutor.startTopic('Hash maps for interviews');
    const session = store.loadSession(start.sessionId)!;
    expect(session.coveredObjectives).toContain('hash-maps');
    expect(session.probeCount).toBe(0);
  });

  it('marks the concept covered when the learner says move on', async () => {
    const store = new Store(dataDir);
    await store.init();
    const tutor = new Tutor(new FixedProvider({ correct: null }), store);

    const start = await tutor.startTopic('Hash maps for interviews');
    await tutor.continueSession(start.sessionId, 'I already answered this, move on');
    const session = store.loadSession(start.sessionId)!;
    expect(session.coveredObjectives).toContain('hash-maps');
  });

  it('counts unanswered probes on the same concept', async () => {
    const store = new Store(dataDir);
    await store.init();
    const tutor = new Tutor(new FixedProvider({ correct: null }), store);

    const start = await tutor.startTopic('Hash maps for interviews');
    await tutor.continueSession(start.sessionId, 'maybe it stores things?');
    const session = store.loadSession(start.sessionId)!;
    expect(session.probeCount).toBeGreaterThan(0);
  });
});
