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
  /** Null when the current concept has no visualization. */
  currentVisualText: string | null;
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
${
  visual
    ? `Current visual state: ${visual}`
    : 'There is no visualization for this concept. Teach with words and small examples only.'
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
  "window": ${visual ? '{ "left": 0, "right": 0, "zeroCount": 0 }' : 'null'}
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
${
  visual
    ? `- IMPORTANT: set "window" to the exact left, right and zeroCount your message is describing. The visual is rendered from it, so it must match your words. If you walk the learner forward several steps, report the position you end on. Never leave it at a position you are no longer discussing.
- "advanceVisual" is a fallback only; prefer "window".
- Detect known sliding window misconceptions: shrinks window too early, believes window size must remain constant, moves left every iteration, forgets right expands first, confuses current window size with maximum size, fails to update zero count when left passes a zero.`
    : '- Set "window" to null and "advanceVisual" to false; this concept has no visual.'
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
