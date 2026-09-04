// Shared types and constants between client and server.
import type { SlidingWindowVisualState } from './visual.js';

export interface GenerateRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  responseMimeType?: 'text/plain' | 'application/json';
}

export interface GenerateResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export interface Misconception {
  id: string;
  name: string;
  description: string;
  detectedAt: string;
  resolvedAt?: string;
  evidence?: string;
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  timestamp: string;
  concept: string;
  detail: string;
  scoreDelta?: number;
}

export type EvidenceType =
  | 'EXPLAINED_OWN_WORDS'
  | 'PREDICTION_CORRECT'
  | 'PREDICTION_INCORRECT'
  | 'ANSWER_CORRECT'
  | 'ANSWER_INCORRECT'
  | 'HINT_USED'
  | 'INDEPENDENT_SOLVED'
  | 'TRANSFER_SOLVED'
  | 'CONFIDENCE_REPORTED';

export interface ConceptState {
  concept: string;
  understanding: number;
  recall: number;
  application: number;
  transfer: number;
  confidence: number | null;
  misconceptions: Misconception[];
  evidence: Evidence[];
  lastTested: string | null;
  nextReview: string | null;
}

export interface TopicState {
  id: string;
  name: string;
  goal: string;
  createdAt: string;
  concepts: Record<string, ConceptState>;
  currentConcept: string;
  activeSessionId: string | null;
}

export type TutorMode =
  | 'PROBING'
  | 'TEACHING'
  | 'PREDICTING'
  | 'PRACTICING'
  | 'REVIEWING'
  | 'DONE';

export interface SessionState {
  id: string;
  topicId: string;
  startedAt: string;
  resumedAt?: string;
  endedAt?: string;
  mode: TutorMode;
  currentConcept: string;
  messages: TutorMessage[];
  visualStep?: number;
  visualState?: SlidingWindowVisualState;
  hintLevel: number;
  lastInteractionAt: string;
}

export interface TutorMessage {
  role: 'system' | 'tutor' | 'learner';
  content: string;
  timestamp: string;
}

export interface TutorResponse {
  message: string;
  mode: TutorMode;
  concept: string;
  visualState?: SlidingWindowVisualState;
  hintLevel: number;
  needsConfig: boolean;
  configError?: string;
}

export interface LearningEvent {
  timestamp: string;
  type: string;
  concept?: string;
  detail?: unknown;
}

export interface LearnerProfile {
  id: string;
  name?: string;
  createdAt: string;
}

export interface LearnerState {
  profile: LearnerProfile;
  topics: Record<string, TopicState>;
  lastTopicId: string | null;
}

export { buildTrace, stateFromTrace, nextStep, DEFAULT_EXAMPLE } from './visual.js';
export type { SlidingWindowVisualState, VisualStep } from './visual.js';
