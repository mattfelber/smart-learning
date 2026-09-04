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
shared/          Common types used by both client and server
docs/            Architecture and context docs
learning-data/   Generated learner state (gitignored)
```

## Provider Abstraction

```typescript
interface LLMProvider {
  generate(options: GenerateRequest): Promise<GenerateResponse>;
  generateStructured<T>(options: GenerateRequest, schema: ZodSchema<T>): Promise<T>;
  supportsVision(): boolean;
  supportsTools(): boolean;
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

Transitions are driven by the learner's last message, current concept, learner state, and a small LLM call.

## Context Strategy

The prompt to the LLM always includes:

- Learning goal (1 line)
- Current concept
- Recent 3-5 turns of conversation (compact)
- Learner state summary for current concept
- Active misconceptions
- Current exercise / visual state
- Instructions for the next expected interaction type

It explicitly does **not** include:

- Full previous sessions
- All event logs
- Unrelated topics
- Giant visualization code
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

The Sliding-Window visualizer is a deterministic React component. It receives an `ArrayPointerVisual` state:

- `nums`, `k`, `left`, `right`, `zeroCount`, `bestLeft`, `bestRight`, `phase`

It renders an HTML/SVG array with pointers, window highlight, and counters. Controls: Next, Previous, Reset, Reveal.

The Tutor can request a new visual state, but the renderer is deterministic code.

## Session Resume

On startup the server loads `sessions/` and returns the most recent unfinished session. The UI shows a `Resume` button. Only a compact summary is sent to the LLM, not the full transcript.
