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
import { costOf } from '../pricing.js';
import type { GenerateResponse, UsageKind } from '@smart-learning/shared';
import type { LLMProvider } from '../providers/types.js';
import { tutorPrompt, summaryPrompt } from './prompts.js';
import { extractPartialString } from './partialJson.js';
import { detectLearnerDirective, directiveText } from './learnerControl.js';
import {
  stateFromTrace,
  nextStep,
  findStep,
  conceptHasVisual,
  DEFAULT_EXAMPLE,
  parseVisualSpec,
  slidingWindowSpec
} from '@smart-learning/shared';
import type { VisualSpec } from '@smart-learning/shared';

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
    .default(null),
  // Model-authored visual for non-sliding-window concepts. Unknown here and
  // validated against VisualSpecSchema later, so a malformed spec cannot sink
  // the whole turn — it just degrades to a text-only reply.
  visual: z.unknown().nullable().default(null),
  // Whiteboard semantics: the panel persists across turns until the tutor
  // explicitly replaces or clears it. Null falls back to "a present visual
  // means replace, otherwise keep" for models that omit the field.
  visualAction: z.enum(['keep', 'replace', 'clear']).nullable().default(null)
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

  async continueSession(
    sessionId: string,
    learnerInput: string,
    onMessageDelta?: (messageSoFar: string) => void
  ): Promise<TutorResponse> {
    const session = this.store.loadSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const topic = this.store.loadTopic(session.topicId);
    if (!topic) throw new Error(`Topic not found: ${session.topicId}`);

    this.store.appendEvent(session.id, 'ANSWER_SUBMITTED', {
      concept: session.currentConcept,
      detail: learnerInput
    });

    return this.tutorTurn(session, topic, learnerInput, onMessageDelta);
  }

  async resume(): Promise<(TutorResponse & { sessionId: string }) | null> {
    // Ordered by most recent activity by listSessions.
    const latest = this.store.listSessions().filter((s) => s.mode !== 'DONE')[0];

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
    this.recordUsage(res, 'session-summary', session.id, topic.id);
    const note = res.text;

    this.store.saveSessionMarkdown(session.id, note);
    this.store.saveTopicNotes(topic.id, note);
    this.store.appendEvent(session.id, 'SESSION_ENDED', { sessionId: session.id });

    return note;
  }

  private async tutorTurn(
    session: SessionState,
    topic: TopicState,
    learnerInput: string,
    onMessageDelta?: (messageSoFar: string) => void
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

    // Only a model-authored spec can carry forward; a sliding-window spec is
    // rebuilt from the trace each turn and would be stale under a new concept.
    const previousSpec =
      session.visualState && session.visualState.kind !== 'sliding-window'
        ? session.visualState
        : undefined;

    // Obvious learner control phrases are detected deterministically — no
    // extra model call — and handed to the tutor as a directive that overrides
    // the Socratic strategy for this turn.
    const directive = detectLearnerDirective(learnerInput);

    const prompt = tutorPrompt({
      goal,
      mode: session.mode,
      concept,
      conceptState,
      recentMessages: session.messages,
      learnerInput,
      hintLevel: session.hintLevel,
      currentVisualText,
      currentVisualSpec: previousSpec ? JSON.stringify(previousSpec) : null,
      covered: session.coveredObjectives ?? [],
      probeCount: session.probeCount ?? 0,
      directive: directive ? directiveText(directive) : null
    });

    const request = {
      prompt,
      responseMimeType: 'application/json' as const,
      maxTokens: 2048
    };

    // Stream when the caller wants progress and the provider can do it. The
    // reply is a JSON object whose first key is `message`, so the prose can be
    // decoded and forwarded well before the object closes.
    const res =
      onMessageDelta && this.provider.generateStream
        ? await this.provider.generateStream(request, (rawSoFar) => {
            const partial = extractPartialString(rawSoFar, 'message');
            if (partial) onMessageDelta(partial);
          })
        : await this.provider.generate(request);

    this.recordUsage(res, 'tutor-turn', session.id, topic.id);
    const output = this.parseOutput(res.text, concept);

    const previousMode = session.mode;
    session.mode = output.mode;
    session.currentConcept = output.concept;
    session.lastInteractionAt = now();

    // Lesson bookkeeping: a correct answer marks the objective covered so it is
    // not re-tested in a loop; the probe counter resets when the objective moves.
    // A "move on" request counts as covered — the learner declined the probe.
    if (output.correct === true || directive?.kind === 'move-on') {
      const covered = new Set(session.coveredObjectives ?? []);
      covered.add(concept);
      covered.add(output.concept);
      session.coveredObjectives = [...covered].slice(-30);
      session.probeCount = 0;
    } else if (output.concept !== concept) {
      session.probeCount = 0;
    } else {
      session.probeCount = (session.probeCount ?? 0) + 1;
    }

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

    // Sliding-window visuals are server-built from the trace each turn so the
    // step stays authoritative. Every other concept works like a whiteboard:
    // the previous spec persists unless the tutor replaces or clears it, and a
    // malformed replacement is dropped without destroying the previous visual.
    let newVisual: VisualSpec | undefined;
    if (conceptHasVisual(output.concept)) {
      newVisual = slidingWindowSpec(
        stateFromTrace(DEFAULT_EXAMPLE.nums, DEFAULT_EXAMPLE.k, session.visualStep)
      );
    } else if (output.visualAction === 'clear') {
      newVisual = undefined;
    } else if (output.visualAction === 'keep') {
      newVisual = previousSpec;
    } else {
      const candidate = parseVisualSpec(output.visual);
      if (output.visual != null && candidate === undefined) {
        console.warn('[tutor] model emitted a visual that failed validation; keeping previous');
      }
      newVisual = candidate ?? previousSpec;
    }
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

  /**
   * Write one ledger line per model request. Cost is computed here rather than
   * at read time so a later price change cannot silently rewrite history.
   */
  private recordUsage(
    res: GenerateResponse,
    kind: UsageKind,
    sessionId: string | null,
    topicId: string | null
  ): void {
    if (!res.usage || !res.model) return;
    this.store.appendUsage({
      timestamp: now(),
      model: res.model,
      sessionId,
      topicId,
      kind,
      ...res.usage,
      costUsd: costOf(res.usage, res.model)
    });
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
      window: null,
      visual: null,
      visualAction: null
    };
  }
}
