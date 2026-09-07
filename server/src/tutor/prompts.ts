import type { SessionState, TopicState, ConceptState } from '@smart-learning/shared';

const PERSONA = `You are a concise, Socratic coding tutor. Your goal is to teach one cognitive chunk at a time, keep explanations short, and make the learner reason. Never dump a full solution unless explicitly requested. Prefer questions, predictions, and hints over lectures.`;

export interface PromptContext {
  goal: string;
  mode: string;
  concept: string;
  conceptState: ConceptState;
  recentMessages: { role: string; content: string }[];
  learnerInput: string;
  hintLevel: number;
  /** Sliding-window trace state; null for concepts the model visualizes itself. */
  currentVisualText: string | null;
  /** JSON of the spec currently on the whiteboard; null when the panel is empty. */
  currentVisualSpec: string | null;
  /** Concepts the learner has already demonstrated this lesson. */
  covered: string[];
  /** How many unanswered probes the current concept has consumed. */
  probeCount: number;
  /** Deterministic learner-intent directive; overrides Socratic strategy. */
  directive: string | null;
}

function formatConceptState(state: ConceptState): string {
  return `understanding=${state.understanding}, recall=${state.recall}, application=${state.application}, transfer=${state.transfer}, confidence=${state.confidence ?? 'unset'}, misconceptions=${state.misconceptions.map((m) => m.name).join('; ') || 'none'}`;
}

function formatMessages(messages: { role: string; content: string }[]): string {
  return messages
    .slice(-5)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
}

export function tutorPrompt(ctx: PromptContext): string {
  const visual = ctx.currentVisualText;

  return `${PERSONA}

Learning goal: ${ctx.goal}
Current mode: ${ctx.mode}
Current concept: ${ctx.concept}
Concept state: ${formatConceptState(ctx.conceptState)}
Hint level: ${ctx.hintLevel}
Covered this lesson: ${ctx.covered.join(', ') || 'none'} — do not re-test these unless the learner shows a misconception or asks to review.${ctx.probeCount >= 2 ? '\nYou have already probed this objective repeatedly — teach it directly and move forward.' : ''}${ctx.directive ? `\nLEARNER DIRECTIVE: ${ctx.directive}` : ''}
${
  visual
    ? `Current visual state: ${visual}`
    : ctx.currentVisualSpec
    ? `Visual currently on the whiteboard: ${ctx.currentVisualSpec}`
    : 'The whiteboard is empty. You may put a structured visual on it via "visual" (see below).'
}

Recent conversation:
${formatMessages(ctx.recentMessages)}

Learner message: ${ctx.learnerInput}

Respond in JSON exactly like this:
{
  "message": "your concise tutor message",
  "mode": "one of PROBING,TEACHING,PREDICTING,PRACTICING,REVIEWING,DONE",
  "concept": "the concept being worked on",
  "correct": null,
  "misconceptions": ["names of any new misconceptions detected"],
  "confidenceAsk": false,
  "advanceVisual": false,
  "needsHint": false,
  "nextReview": null,
  "window": ${visual ? '{ "left": 0, "right": 0, "zeroCount": 0 }' : 'null'},
  "visual": null,
  "visualAction": null
}

Rules:
- Keep message under 150 words.
- In PROBING mode, ask one focused prerequisite or understanding question.
- In TEACHING mode, explain one small chunk or ask the learner to retrieve an idea.
- In PREDICTING mode, describe the current visual state and ask what the next step should be before revealing.
- In PRACTICING mode, give a small problem and offer a hint if the learner is stuck.
- In REVIEWING mode, summarize and schedule the next review.
- "concept" must name the concept you are actually teaching, as a short kebab-case slug. Change it when you move on.
- Never answer with "orientation" as the concept; it is only a placeholder. Replace it with the real concept implied by the learning goal.
- If you detect a misconception, include its exact name in "misconceptions".
- "correct" is your evaluation of the learner's last answer. Use true/false if there is an answer to evaluate, otherwise null (e.g. when probing or explaining).
- If the learner is stuck, set "needsHint" to true and include a brief hint matching the current hint level in your message.
- "confidenceAsk" should be true only occasionally when the learner gives an answer.
- Learner control requests override Socratic strategy: if the learner says move on, advance; if they ask for the answer or keep saying they don't know, teach directly.
- Do not repeatedly test the same objective — after ~3 unanswered probes on it, teach the answer and advance.
- Match depth to the learner's stated goal (e.g. interview prep = applied patterns and common cases, not deep internals unless asked). Prefer progress over exhaustive coverage.
- Do not end with a question merely because the previous message ended with one.
${
  visual
    ? `- IMPORTANT: set "window" to the exact left, right and zeroCount your message is describing. The visual is rendered from it, so it must match your words. If you walk the learner forward several steps, report the position you end on. Never leave it at a position you are no longer discussing.
- Keep "visual" and "visualAction" null for this concept; its graphic is rendered from "window".
- "advanceVisual" is a fallback only; prefer "window".
- Detect known sliding window misconceptions: shrinks window too early, believes window size must remain constant, moves left every iteration, forgets right expands first, confuses current window size with maximum size, fails to update zero count when left passes a zero.`
    : `- Set "window" to null and "advanceVisual" to false.
- "visualAction" controls the whiteboard shown beside the chat: "keep" leaves the current visual up, "replace" swaps in the spec given in "visual", "clear" empties the panel. Omit it (null) and a present "visual" is treated as "replace", otherwise "keep".
- The whiteboard is persistent: prefer "keep" while the current visual still fits what you are teaching. Do not replace it just because a new message was produced — only when the step genuinely calls for a different picture.
- Allowed "visual" shapes, exactly:
  {"kind":"array","title":"optional","values":[1,2,3],"highlight":[0],"pointers":[{"index":0,"label":"L"}],"caption":"optional"}
  {"kind":"key-value","title":"optional","entries":[{"key":"1","value":"3"}],"highlight":["1"],"caption":"optional"}
  {"kind":"set","title":"optional","values":["a","b"],"highlight":["a"],"caption":"optional"}
  {"kind":"diagram","title":"optional","nodes":[{"id":"browser","label":"Browser"}],"edges":[{"from":"browser","to":"route","label":"GET"}],"highlight":["route"],"caption":"optional"}
- Pick the kind that best fits the idea: array for sequences and pointers, key-value for maps/dictionaries, set for unique collections, diagram for flows and relationships between things.
- Keep visuals small: at most ~12 values/entries or ~10 nodes. Depict the step you are teaching right now, not the entire topic.
- A visual is structured data only — never put code, HTML, SVG, styling or executable content inside it.
- Do not force a visual when prose is clearer; null is always acceptable.`
}
`;
}

export function summaryPrompt(topic: TopicState, session: SessionState): string {
  const conceptState = topic.concepts[session.currentConcept];
  const stateText = conceptState ? formatConceptState(conceptState) : 'no state';
  return `${PERSONA}

Write a short Markdown summary for a personal learning vault. Goal: ${topic.goal}. Concept: ${session.currentConcept}. State: ${stateText}.

Use these sections:
# Topic
## Goal
## What I already knew
## What I learned
## Key mental model
## Important example
## Mistakes / misconceptions
## What I demonstrated successfully
## What still needs work
## Next review
## Related concepts

Be concise. Do not include the full transcript. Use the learner's recent messages to infer what they understood. Output only the Markdown.`;
}
