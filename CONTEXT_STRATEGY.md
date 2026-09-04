# Context Strategy

To keep free-tier token usage low, the Tutor only sends the LLM the information necessary for the current tutoring decision.

## Always included

1. **System persona** — brief pedagogical instructions (constant).
2. **Learning goal** — the user's original request.
3. **Current topic & concept** — e.g. `sliding-window`, `variable-window`.
4. **Recent turns** — last 3 to 5 messages, summarized if long.
5. **Current concept state** — understanding/recall/application scores, active misconceptions, confidence.
6. **Current exercise / visual state** — the problem being worked, hint level, visual snapshot.
7. **Desired next action** — the type of response needed (probe, explain, ask prediction, evaluate answer, hint, etc.).

## Never included

- Full previous sessions
- Entire `events.jsonl`
- All topics studied
- Source code of the visualizer
- System logs
- Unrelated learner data

## Prompt templates

Prompts live in `server/src/tutor/prompts/`. Each file is a function that takes a `Context` object and returns a compact prompt string. This keeps token usage predictable and makes it easy to tune.

## Token budget target

A typical tutoring prompt should stay under ~2,000 tokens. Longer context is summarized by code before being sent.
