import { mkdirSync, existsSync, writeFileSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  LearnerState,
  LearnerProfile,
  TopicState,
  SessionState,
  LearningEvent,
  ConceptState,
  TutorMessage,
  SessionSummary,
  TopicSummary
} from '@smart-learning/shared';
import { config } from '../config.js';

const DATA_DIR = config.DATA_DIR;

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function now(): string {
  return new Date().toISOString();
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    // Strip a UTF-8 BOM: editors and some shells add one, and JSON.parse rejects it.
    const content = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(content) as T;
  } catch (err) {
    // Falling back silently here means a corrupt file looks like a fresh start
    // and then gets overwritten with empty state. Make that loud.
    console.error(
      `[store] Could not parse ${path}; falling back to empty state. ` +
        `Existing data in this file will be overwritten on the next save.`,
      err
    );
    return fallback;
  }
}

function saveJson(path: string, data: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export class Store {
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DATA_DIR;
  }

  private learnerFile(): string {
    return resolve(this.dataDir, 'learner', 'learner-state.json');
  }

  private learnerProfileFile(): string {
    return resolve(this.dataDir, 'learner', 'profile.json');
  }

  private topicDir(topicId: string): string {
    return resolve(this.dataDir, 'topics', topicId);
  }

  private topicStateFile(topicId: string): string {
    return resolve(this.topicDir(topicId), 'state.json');
  }

  private topicNotesFile(topicId: string): string {
    return resolve(this.topicDir(topicId), 'notes.md');
  }

  private sessionDir(sessionId: string): string {
    return resolve(this.dataDir, 'sessions', sessionId);
  }

  private sessionMetadataFile(sessionId: string): string {
    return resolve(this.sessionDir(sessionId), 'metadata.json');
  }

  private sessionNoteFile(sessionId: string): string {
    return resolve(this.sessionDir(sessionId), 'session.md');
  }

  private eventsFile(sessionId: string): string {
    return resolve(this.sessionDir(sessionId), 'events.jsonl');
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(resolve(this.dataDir, 'learner'), { recursive: true });
    await mkdir(resolve(this.dataDir, 'topics'), { recursive: true });
    await mkdir(resolve(this.dataDir, 'sessions'), { recursive: true });
    await mkdir(resolve(this.dataDir, 'reviews'), { recursive: true });
  }

  loadLearnerState(): LearnerState {
    return loadJson<LearnerState>(this.learnerFile(), {
      profile: {
        id: randomUUID(),
        createdAt: now()
      },
      topics: {},
      lastTopicId: null
    });
  }

  saveLearnerState(state: LearnerState): void {
    saveJson(this.learnerFile(), state);
  }

  loadProfile(): LearnerProfile {
    return loadJson<LearnerProfile>(
      this.learnerProfileFile(),
      this.loadLearnerState().profile
    );
  }

  /**
   * Topic ids are derived from the goal, so re-entering a goal resolves to an
   * existing topic. Return that topic instead of overwriting it — a fresh
   * TopicState would discard every concept score, evidence entry and
   * misconception recorded against it.
   */
  createTopic(goal: string, name: string): TopicState {
    const id = slugify(name);
    const existing = this.loadTopic(id);
    if (existing) {
      existing.goal = goal;
      existing.name = name;
      this.saveTopic(existing);
      return existing;
    }
    const topic: TopicState = {
      id,
      name,
      goal,
      createdAt: now(),
      concepts: {},
      // The tutor names the real concept on its first reply; don't presume one.
      currentConcept: 'orientation',
      activeSessionId: null
    };
    this.saveTopic(topic);
    return topic;
  }

  loadTopic(topicId: string): TopicState | null {
    return loadJson<TopicState | null>(this.topicStateFile(topicId), null);
  }

  saveTopic(topic: TopicState): void {
    saveJson(this.topicStateFile(topic.id), topic);
  }

  createSession(topicId: string, concept: string): SessionState {
    const id = `${today()}-${topicId}-${Date.now()}`;
    const session: SessionState = {
      id,
      topicId,
      startedAt: now(),
      mode: 'PROBING',
      currentConcept: concept,
      messages: [
        {
          role: 'system',
          content: `Goal: ${topicId}`,
          timestamp: now()
        }
      ],
      hintLevel: 0,
      lastInteractionAt: now()
    };
    this.saveSession(session);
    return session;
  }

  loadSession(sessionId: string): SessionState | null {
    return loadJson<SessionState | null>(this.sessionMetadataFile(sessionId), null);
  }

  saveSession(session: SessionState): void {
    saveJson(this.sessionMetadataFile(session.id), session);
  }

  listSessions(): SessionSummary[] {
    const sessionsDir = resolve(this.dataDir, 'sessions');
    if (!existsSync(sessionsDir)) return [];
    const dirs = readdirSyncSafe(sessionsDir);
    return dirs
      .map((id) => {
        const s = this.loadSession(id);
        return s
          ? {
              id: s.id,
              topicId: s.topicId,
              startedAt: s.startedAt,
              lastInteractionAt: s.lastInteractionAt ?? s.startedAt,
              mode: s.mode,
              currentConcept: s.currentConcept,
              messageCount: s.messages.filter((m) => m.role !== 'system').length
            }
          : null;
      })
      .filter((s): s is SessionSummary => Boolean(s))
      .sort(
        (a, b) =>
          new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime()
      );
  }

  listTopics(): TopicSummary[] {
    const topicsDir = resolve(this.dataDir, 'topics');
    if (!existsSync(topicsDir)) return [];
    const sessions = this.listSessions();
    return readdirSyncSafe(topicsDir)
      .map((id) => this.loadTopic(id))
      .filter((t): t is TopicState => Boolean(t))
      .map((t) => ({
        id: t.id,
        name: t.name,
        goal: t.goal,
        createdAt: t.createdAt,
        concepts: Object.values(t.concepts).map((c) => ({
          concept: c.concept,
          understanding: c.understanding,
          nextReview: c.nextReview
        })),
        sessions: sessions.filter((s) => s.topicId === t.id)
      }))
      .sort((a, b) => {
        const aLast = a.sessions[0]?.lastInteractionAt ?? a.createdAt;
        const bLast = b.sessions[0]?.lastInteractionAt ?? b.createdAt;
        return new Date(bLast).getTime() - new Date(aLast).getTime();
      });
  }

  appendEvent(sessionId: string, type: string, detail: unknown = {}): void {
    const event: LearningEvent = {
      timestamp: now(),
      type,
      detail
    };
    ensureDir(this.sessionDir(sessionId));
    appendFileSync(this.eventsFile(sessionId), JSON.stringify(event) + '\n');
  }

  loadEvents(sessionId: string): LearningEvent[] {
    const path = this.eventsFile(sessionId);
    if (!existsSync(path)) return [];
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    return lines
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as LearningEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is LearningEvent => Boolean(e));
  }

  ensureConcept(topicId: string, concept: string): ConceptState {
    const topic = this.loadTopic(topicId);
    if (!topic) throw new Error(`Topic not found: ${topicId}`);
    if (!topic.concepts[concept]) {
      topic.concepts[concept] = {
        concept,
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
      this.saveTopic(topic);
    }
    return topic.concepts[concept];
  }

  updateConcept(topicId: string, concept: string, patch: Partial<ConceptState>): void {
    const topic = this.loadTopic(topicId);
    if (!topic) return;
    topic.concepts[concept] = { ...topic.concepts[concept], ...patch };
    this.saveTopic(topic);
  }

  saveSessionMarkdown(sessionId: string, markdown: string): void {
    ensureDir(this.sessionDir(sessionId));
    writeFileSync(this.sessionNoteFile(sessionId), markdown);
  }

  saveTopicNotes(topicId: string, markdown: string): void {
    ensureDir(this.topicDir(topicId));
    writeFileSync(this.topicNotesFile(topicId), markdown);
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readdirSyncSafe(path: string): string[] {
  if (!existsSync(path)) return [];
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
