import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Tutor } from '../orchestrator.js';
import { Store } from '../../persistence/store.js';
import type { LLMProvider } from '../../providers/types.js';
import type { GenerateResponse } from '@smart-learning/shared';

/** Returns queued JSON outputs, then repeats the last one. */
class QueueProvider implements LLMProvider {
  private i = 0;
  constructor(private outputs: string[]) {}

  async generate(): Promise<GenerateResponse> {
    const text = this.outputs[Math.min(this.i, this.outputs.length - 1)];
    this.i++;
    return { model: 'stub', text };
  }

  supportsJson(): boolean {
    return true;
  }
}

function reply(extra: Record<string, unknown>): string {
  return JSON.stringify({
    message: 'ok',
    mode: 'TEACHING',
    concept: 'hash-maps',
    correct: null,
    ...extra
  });
}

const SPEC_A = { kind: 'set', values: ['a', 'b'], highlight: [] };
const SPEC_B = { kind: 'array', values: [1, 2, 3], highlight: [1], pointers: [] };

function tempDir(): string {
  const dir = resolve(tmpdir(), `smart-learning-viz-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('visual continuity', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = tempDir();
  });
  afterEach(() => {
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  async function start(store: Store, outputs: string[]) {
    const tutor = new Tutor(new QueueProvider(outputs), store);
    const start = await tutor.startTopic('Hash maps for interviews');
    return { tutor, sessionId: start.sessionId };
  }

  it('persists the spec across session save/load', async () => {
    const store = new Store(dataDir);
    await store.init();
    const { tutor, sessionId } = await start(store, [
      reply({ visual: SPEC_A, visualAction: 'replace' })
    ]);

    expect((await tutor.getTranscript(sessionId))?.visualState).toMatchObject(SPEC_A);
    const loaded = store.loadSession(sessionId);
    expect(loaded?.visualState).toMatchObject({ kind: 'set', values: ['a', 'b'] });
  });

  it('keeps the previous visual when the tutor says keep', async () => {
    const store = new Store(dataDir);
    await store.init();
    const { tutor, sessionId } = await start(store, [
      reply({ visual: SPEC_A, visualAction: 'replace' }),
      reply({ visualAction: 'keep' })
    ]);

    const turn = await tutor.continueSession(sessionId, 'next');
    expect(turn.visualState).toMatchObject({ kind: 'set', values: ['a', 'b'] });
  });

  it('keeps the visual by default when the model omits the field', async () => {
    const store = new Store(dataDir);
    await store.init();
    const { tutor, sessionId } = await start(store, [
      reply({ visual: SPEC_A }),
      reply({}) // no visual, no visualAction -> keep
    ]);

    const turn = await tutor.continueSession(sessionId, 'and then?');
    expect(turn.visualState).toMatchObject({ kind: 'set', values: ['a', 'b'] });
  });

  it('replaces the visual when the tutor provides a new valid spec', async () => {
    const store = new Store(dataDir);
    await store.init();
    const { tutor, sessionId } = await start(store, [
      reply({ visual: SPEC_A, visualAction: 'replace' }),
      reply({ visual: SPEC_B, visualAction: 'replace' })
    ]);

    const turn = await tutor.continueSession(sessionId, 'show me differently');
    expect(turn.visualState).toMatchObject({ kind: 'array', values: [1, 2, 3] });
  });

  it('clears the visual when the tutor asks', async () => {
    const store = new Store(dataDir);
    await store.init();
    const { tutor, sessionId } = await start(store, [
      reply({ visual: SPEC_A, visualAction: 'replace' }),
      reply({ visualAction: 'clear' })
    ]);

    const turn = await tutor.continueSession(sessionId, 'no picture needed');
    expect(turn.visualState).toBeUndefined();
    expect(store.loadSession(sessionId)?.visualState).toBeUndefined();
  });

  it('keeps the previous visual when a replacement fails validation', async () => {
    const store = new Store(dataDir);
    await store.init();
    const { tutor, sessionId } = await start(store, [
      reply({ visual: SPEC_A, visualAction: 'replace' }),
      reply({ visual: { kind: 'hologram', pixels: true }, visualAction: 'replace' })
    ]);

    const turn = await tutor.continueSession(sessionId, 'draw me a hologram');
    expect(turn.visualState).toMatchObject({ kind: 'set', values: ['a', 'b'] });
  });
});
