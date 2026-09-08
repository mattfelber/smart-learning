# Smart Learning — Architecture

## Goal
A locally-hosted personal AI tutor that uses a free hosted LLM (Gemini) for reasoning while keeping all learner state on disk.

## Core Boundaries

```
User -> React UI (Vite)
          |
          v
   Express API
          |
          v
   Tutor Orchestrator
          |
          v
   LLM Provider (Gemini)
          |
          v
   Learning Engine  <-->  Local Filesystem
```

- **AI does reasoning** (explanations, diagnosis, next-step decisions, answer evaluation).
- **Code does state** (persistence, event logging, review scheduling, context selection, rendering).

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, TypeScript, Express
- LLM: `@google/genai` with `gemini-3.8-flash` (free tier, configurable)
- Persistence: filesystem, JSON, JSONL, Markdown
- Tests: Vitest

## Directories

```
client/          Vite + React frontend
server/          Express + TypeScript backend
shared/          Common types + Zod VisualSpec schemas used by both
learning-data/   Generated learner state (lives outside the repo by default)
```

## Provider Abstraction

```typescript
interface LLMProvider {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  /** Optional streaming; used by /api/chat/stream for live tutor output. */
  generateStream?(req: GenerateRequest, onText: (textSoFar: string) => void): Promise<GenerateResponse>;
  supportsJson(): boolean;
}
```

Gemini-specific implementation lives in `server/src/providers/gemini.ts`. Groq can be added later behind the same interface.

## Tutor Orchestrator

The orchestrator maintains a `TutorState` machine:

1. `PROBING` — ask broad prerequisite questions.
2. `TEACHING` — deliver cognitive chunks.
3. `PREDICTING` — pause for learner prediction before reveal.
4. `PRACTICING` — independent problem with hint ladder.
5. `REVIEWING` — summarize and schedule next review.

Transitions are driven by the learner's last message, current concept, learner state, and one LLM call per turn.

## Learner Control

`server/src/tutor/learnerControl.ts` detects control phrases deterministically — no extra LLM call:

- **move-on** ("move on", "I already answered this", "skip this") — tutor advances and the concept is marked covered
- **direct** ("just tell me", "idk", "what's the answer") — tutor answers directly instead of asking another question
- **scope** ("focus on interviews", "don't go that deep") — depth is matched to the stated goal immediately

Two compact session fields back this up: `probeCount` (resets when the concept changes; after ~3 unanswered probes the tutor is told to teach directly) and `coveredObjectives` (demonstrated concepts that must not be re-tested in a loop).

## Streaming

`POST /api/chat/stream` returns SSE: headers flush immediately, heartbeats keep the connection warm while the model thinks, `delta` events carry the `message` field extracted from the in-flight JSON, and `done` delivers the final `TutorResponse`. Each Gemini attempt is bounded by a first-token watchdog (`GEMINI_FIRST_TOKEN_TIMEOUT_MS`) and a request timeout (`GEMINI_REQUEST_TIMEOUT_MS`) before falling to the next model in `GEMINI_FALLBACKS`.

## Context Strategy

The prompt to the LLM always includes:

- Learning goal (1 line)
- Current concept
- Recent 3-5 turns of conversation (compact)
- Learner state summary for current concept
- Active misconceptions
- Concepts already covered this lesson (`coveredObjectives`) and probe budget
- Learner directive, when a control phrase was detected ("move on", "just tell me", "focus on …")
- Current visual: sliding-window trace state or the VisualSpec on the whiteboard
- Instructions for the next expected interaction type

It explicitly does **not** include:

- Full previous sessions
- All event logs
- Unrelated topics
- System debug logs

See `CONTEXT_STRATEGY.md` for the exact template.

## Learning State

Each concept tracks:

- `understanding`, `recall`, `application`, `transfer` (0.0–1.0)
- `confidence`
- `misconceptions[]`
- `evidence[]`
- `lastTested`, `nextReview`

Events are written append-only to `events.jsonl`.

## Persistence Layout

```
learning-data/
  learner/
    profile.json
    learner-state.json
  topics/
    <topic-key>/
      state.json
      notes.md
  sessions/
    <date>-<topic-key>/
      session.md
      metadata.json
      events.jsonl
```

## Visualizer

Visuals are a discriminated union, `VisualSpec` (`shared/src/visualSpec.ts`), validated by Zod before reaching the client:

- `kind: 'array'` — values, highlighted indices, labelled pointers
- `kind: 'key-value'` — key→value entries, highlighted keys
- `kind: 'set'` — unique values, highlighted values
- `kind: 'diagram'` — labelled nodes and directed edges (flows, request lifecycles)
- `kind: 'sliding-window'` — server-built trace state (nums/k/left/right/zeroCount/best/phase) with the interactive step scrubber

The model decides WHAT to show and emits structured data only — never markup or code. `Visualizer.tsx` dispatches on `kind` to a deterministic renderer in `client/src/components/visuals/`. New kinds = one schema + one renderer + one map entry.

The panel is a persistent whiteboard: the previous spec is sent back to the tutor each turn, and `visualAction` (`keep` / `replace` / `clear`) lets the model keep, evolve, or remove it. Malformed specs fall back to the previous visual.

Sliding-window lessons are the exception: the tutor reports `window` (left/right/zeroCount), the server resolves the step via `findStep` and builds the spec from the deterministic trace — the model never authors it.

## Session Resume

On startup the server loads `sessions/` and returns the most recent unfinished session. The UI shows a `Resume` button. Only a compact summary is sent to the LLM, not the full transcript.
