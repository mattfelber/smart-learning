# Learning Model

## Concept State

```typescript
interface ConceptState {
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
```

Scores are 0.0–1.0 and updated by deterministic evidence rules, not LLM guesses.

## Evidence Types

- `EXPLAINED_OWN_WORDS`
- `PREDICTION_CORRECT`
- `PREDICTION_INCORRECT`
- `ANSWER_CORRECT`
- `ANSWER_INCORRECT`
- `HINT_USED`
- `INDEPENDENT_SOLVED`
- `TRANSFER_SOLVED`

## Misconceptions

A misconception has:

- `id`, `name`, `description`
- `detectedAt`, `resolvedAt`
- `evidence` (the answer that triggered detection)

Known sliding-window misconceptions:

- Shrinks window too early
- Believes window size must remain constant
- Moves left every iteration
- Forgets right expands first
- Confuses current window size with maximum size
- Fails to update zero_count when left passes a zero

## Lesson-level control state

Two compact fields on `SessionState` prevent Socratic loops without any extra model calls:

- `probeCount` — unanswered probes spent on the current concept; resets when the concept changes. After ~3 the tutor is instructed to teach directly and advance.
- `coveredObjectives` — concepts demonstrated (`correct: true`) or declined via "move on"; the tutor is told not to re-test them unless a misconception appears or the learner asks.

Learner control phrases ("move on", "idk", "focus on interviews") are detected by deterministic text matching (`learnerControl.ts`) and injected into the prompt as a directive.

## Confidence

Asked occasionally (not every turn). Interpreted as:

| Answer | Confidence | Meaning |
|--------|------------|---------|
| Correct | High | Strong evidence |
| Correct | Low | Unstable knowledge |
| Wrong | Low | Uncertainty |
| Wrong | High | Likely misconception |

## Updates

Evidence is recorded in `events.jsonl` and used to update concept scores in `learner-state.json`.
