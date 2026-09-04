import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type {
  TutorResponse,
  SessionState,
  TopicState,
  ConceptState,
  Evidence,
  TutorMode
} from '@smart-learning/shared';
import { Store } from '../persistence/store.js';
import type { LLMProvider } from '../providers/types.js';
import { tutorPrompt, summaryPrompt } from './prompts.js';
import {
  stateFromTrace,
  nextStep,
  findStep,
  conceptHasVisual,
  DEFAULT_EXAMPLE
} from '@smart-learning/shared';

const TutorOutputSchema = z.object({
  message: z.string(),
  mode: z.enum(['PROBING', 'TEACHING', 'PREDICTING', 'PRACTICING', 'REVIEWING', 'DONE']),
  concept: z.string().default('sliding-window'),
  correct: z.boolean().nullable().default(null),
  misconceptions: z.array(z.string()).default([]),
  confidenceAsk: z.boolean().default(false),
  advanceVisual: z.boolean().default(false),
  needsHint: z.boolean().default(false),
  nextReview: z.string().nullable().default(null),
  // The window the tutor's message is actually describing. Authoritative when
  // present; `advanceVisual` is the fallback for models that omit it.
  window: z
    .object({
      left: z.number().int(),
      right: z.number().int(),
      zeroCount: z.number().int()
    })
    .nullable()
    .default(null)
});

type TutorOutput = z.infer<typeof TutorOutputSchema>;

function now(): string {
  return new Date().toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export class Tutor {
  constructor(private provider: LLMProvider, private store: Store) {}

  async startTopic(goal: string): Promise<TutorResponse & { sessionId: string }> {
    const topic = this.store.createTopic(goal, goal);
    const session = this.store.createSession(topic.id, topic.currentConcept);
    session.visualStep = 0;
    topic.activeSessionId = session.id;
    this.store.saveTopic(topic);

    const learner = this.store.loadLearnerState();
    learner.topics[topic.id] = topic;
    learner.lastTopicId = topic.id;
    this.store.saveLearnerState(learner);

    this.store.appendEvent(session.id, 'TOPIC_CREATED', { topicId: topic.id, goal });
    this.store.appendEvent(session.id, 'SESSION_STARTED', { sessionId: session.id });

    return this.tutorTurn(session, topic, `I want to learn ${goal}. Start by probing my knowledge.`);
  }

  async continueSession(sessionId: string, learnerInput: string): Promise<TutorResponse> {
    const session = this.store.loadSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const topic = this.store.loadTopic(session.topicId);
    if (!topic) throw new Error(`Topic not found: ${session.topicId}`);

    this.store.appendEvent(session.id, 'ANSWER_SUBMITTED', {
      concept: session.currentConcept,
      detail: learnerInput
    });

    return this.tutorTurn(session, topic, learnerInput);
  }

  async resume(): Promise<(TutorResponse & { sessionId: string }) | null> {
    const sessions = this.store.listSessions();
    const latest = sessions
      .filter((s) => s.mode !== 'DONE')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

    if (!latest) return null;

    const session = this.store.loadSession(latest.id);
    const topic = this.store.loadTopic(session!.topicId);
    if (!session || !topic) return null;

    session.resumedAt = now();
    this.store.saveSession(session);
    this.store.appendEvent(session.id, 'SESSION_RESUMED', { sessionId: session.id });

    return this.tutorTurn(
      session,
      topic,
      "I'm back. Briefly summarize where we left off and what the next step should be."
    );
  }

  /** Reopen a specific past session, whether or not it was ended. */
  async openSession(sessionId: string): Promise<(TutorResponse & { sessionId: string }) | null> {
    const session = this.store.loadSession(sessionId);
    if (!session) return null;
    const topic = this.store.loadTopic(session.topicId);
    if (!topic) return null;

    session.resumedAt = now();
    if (session.mode === 'DONE') {
      session.mode = 'REVIEWING';
      delete session.endedAt;
    }
    this.store.saveSession(session);
    topic.activeSessionId = session.id;
    this.store.saveTopic(topic);
    this.store.appendEvent(session.id, 'SESSION_RESUMED', { sessionId: session.id });

    return this.tutorTurn(
      session,
      topic,
      "I'm back. Briefly summarize where we left off and what the next step should be."
    );
  }

  /** The transcript of a past session, for rehydrating the UI without an LLM call. */
  getTranscript(sessionId: string): SessionState | null {
    return this.store.loadSession(sessionId);
  }

  async endSession(sessionId: string): Promise<string> {
    const session = this.store.loadSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const topic = this.store.loadTopic(session.topicId);
    if (!topic) throw new Error(`Topic not found: ${session.topicId}`);

    session.endedAt = now();
    session.mode = 'DONE';
    this.store.saveSession(session);

    const events = this.store.loadEvents(sessionId);
    const prompt = summaryPrompt(topic, session);
    const res = await this.provider.generate({ prompt, maxTokens: 2048 });
    const note = res.text;

    this.store.saveSessionMarkdown(session.id, note);
    this.store.saveTopicNotes(topic.id, note);
    this.store.appendEvent(session.id, 'SESSION_ENDED', { sessionId: session.id });

    return note;
  }

  private async tutorTurn(
    session: SessionState,
    topic: TopicState,
    learnerInput: string
  ): Promise<TutorResponse & { sessionId: string }> {
    const goal = topic.goal;
    const concept = session.currentConcept;
    const conceptState = this.store.ensureConcept(topic.id, concept);

    const visualStep = session.visualStep ?? 0;
    const conceptVisual = conceptHasVisual(concept);
    const visual = stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, visualStep);
    const currentVisualText = conceptVisual
      ? `left=${visual.left}, right=${visual.right}, zeroCount=${visual.zeroCount}, best=[${visual.bestLeft},${visual.bestRight}], nums=[${DEFAULT_EXAMPLE.nums.join(',')}], k=${DEFAULT_EXAMPLE.k}`
      : null;

    const prompt = tutorPrompt({
      goal,
      mode: session.mode,
      concept,
      conceptState,
      recentMessages: session.messages,
      learnerInput,
      hintLevel: session.hintLevel,
      currentVisualText
    });

    const res = await this.provider.generate({
      prompt,
      responseMimeType: 'application/json',
      maxTokens: 2048
    });
    const output = this.parseOutput(res.text, concept);

    const previousMode = session.mode;
    session.mode = output.mode;
    session.currentConcept = output.concept;
    session.lastInteractionAt = now();

    if (output.needsHint) {
      session.hintLevel = Math.min(session.hintLevel + 1, 5);
      this.store.appendEvent(session.id, 'HINT_REQUESTED', {
        concept: output.concept,
        level: session.hintLevel
      });
    } else {
      session.hintLevel = 0;
    }

    // Resolve the step from the window the tutor described, so the visual
    // tracks the narration instead of lagging one tick per turn behind it.
    if (output.window) {
      session.visualStep = findStep(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, output.window);
    } else if (previousMode === 'PREDICTING' && output.correct === true) {
      session.visualStep = nextStep(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, visualStep);
    } else if (output.advanceVisual) {
      session.visualStep = nextStep(
        DEFAULT_EXAMPLE.nums,
        DEFAULT_EXAMPLE.k,
        session.visualStep ?? 0
      );
    }

    if (session.visualStep === undefined) {
      session.visualStep = 0;
    }

    const showVisual = conceptHasVisual(output.concept);
    const newVisual = showVisual
      ? stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, session.visualStep)
      : undefined;
    session.visualState = newVisual;

    this.updateConcept(topic, concept, conceptState, output, learnerInput);

    session.messages.push({
      role: 'learner',
      content: learnerInput,
      timestamp: now()
    });
    session.messages.push({
      role: 'tutor',
      content: output.message,
      timestamp: now()
    });

    this.store.saveSession(session);

    const learner = this.store.loadLearnerState();
    learner.topics[topic.id] = this.store.loadTopic(topic.id) ?? topic;
    this.store.saveLearnerState(learner);

    this.store.appendEvent(session.id, 'QUESTION_ASKED', {
      concept: output.concept,
      mode: output.mode
    });

    return {
      message: output.message,
      mode: output.mode,
      concept: output.concept,
      visualState: newVisual,
      hintLevel: session.hintLevel,
      needsConfig: false,
      sessionId: session.id
    };
  }

  private updateConcept(
    topic: TopicState,
    concept: string,
    conceptState: ConceptState,
    output: TutorOutput,
    learnerInput: string
  ): void {
    if (output.correct === true) {
      conceptState.understanding = Math.min(1, conceptState.understanding + 0.1);
      conceptState.recall = Math.min(1, conceptState.recall + 0.05);
    } else if (output.correct === false) {
      conceptState.understanding = Math.max(0, conceptState.understanding - 0.05);
    }

    for (const name of output.misconceptions) {
      if (!conceptState.misconceptions.some((m) => m.name === name)) {
        conceptState.misconceptions.push({
          id: randomUUID(),
          name,
          description: `Detected misconception: ${name}`,
          detectedAt: now(),
          evidence: learnerInput
        });
      }
    }

    if (output.confidenceAsk) {
      conceptState.confidence = null;
    }

    conceptState.lastTested = now();
    conceptState.nextReview = output.nextReview ?? conceptState.nextReview ?? daysFromNow(1);

    const evidence: Evidence = {
      id: randomUUID(),
      type:
        output.correct === true
          ? 'ANSWER_CORRECT'
          : output.correct === false
          ? 'ANSWER_INCORRECT'
          : 'EXPLAINED_OWN_WORDS',
      timestamp: now(),
      concept,
      detail: learnerInput
    };
    conceptState.evidence.push(evidence);

    this.store.updateConcept(topic.id, concept, conceptState);
  }

  private extractJsonObject(text: string): unknown | null {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private parseOutput(text: string, fallbackConcept: string): TutorOutput {
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    const parsed = this.extractJsonObject(cleaned) ?? this.extractJsonObject(text);
    if (parsed) {
      const result = TutorOutputSchema.safeParse(parsed);
      if (result.success) return result.data;
    }

    return {
      message: text,
      mode: 'TEACHING',
      concept: fallbackConcept,
      correct: null,
      misconceptions: [],
      confidenceAsk: false,
      advanceVisual: false,
      needsHint: false,
      nextReview: null,
      window: null
    };
  }
}
