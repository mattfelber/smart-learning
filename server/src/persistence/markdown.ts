import type { SessionState, TopicState, LearningEvent } from '@smart-learning/shared';

export function sessionNote(
  topic: TopicState,
  session: SessionState,
  events: LearningEvent[]
): string {
  const goal = topic.goal;
  const concept = session.currentConcept;
  const concepts = Object.values(topic.concepts);
  const conceptState = topic.concepts[concept];

  const sections: string[] = [];
  sections.push(`# ${topic.name}`);
  sections.push('');
  sections.push(`## Goal`);
  sections.push(goal);
  sections.push('');
  sections.push(`## Session`);
  sections.push(`- Started: ${session.startedAt}`);
  sections.push(`- Mode: ${session.mode}`);
  sections.push(`- Concept: ${concept}`);
  sections.push('');

  if (conceptState) {
    sections.push(`## Concept: ${concept}`);
    sections.push(`- Understanding: ${conceptState.understanding}`);
    sections.push(`- Recall: ${conceptState.recall}`);
    sections.push(`- Application: ${conceptState.application}`);
    sections.push(`- Transfer: ${conceptState.transfer}`);
    if (conceptState.confidence !== null) {
      sections.push(`- Confidence: ${conceptState.confidence}`);
    }
    if (conceptState.misconceptions.length) {
      sections.push(`- Misconceptions: ${conceptState.misconceptions.map((m) => m.name).join(', ')}`);
    }
    sections.push('');
  }

  sections.push(`## Key events`);
  const eventTypes: Record<string, number> = {};
  for (const event of events) {
    eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(eventTypes).sort()) {
    sections.push(`- ${type}: ${count}`);
  }
  sections.push('');

  if (conceptState && conceptState.misconceptions.length) {
    sections.push(`## Mistakes / misconceptions`);
    for (const m of conceptState.misconceptions) {
      sections.push(`- **${m.name}**: ${m.description}`);
    }
    sections.push('');
  }

  if (conceptState && conceptState.evidence.length) {
    sections.push(`## Evidence`);
    for (const e of conceptState.evidence.slice(-10)) {
      sections.push(`- ${e.type} at ${e.timestamp}: ${e.detail}`);
    }
    sections.push('');
  }

  sections.push(`## What still needs work`);
  const weak = concepts.filter((c) => c.understanding < 0.5);
  if (weak.length) {
    sections.push(weak.map((c) => `- ${c.concept} (${c.understanding.toFixed(2)})`).join('\n'));
  } else {
    sections.push('- No clear weak areas yet.');
  }
  sections.push('');

  const nextReview = conceptState?.nextReview ?? 'not set';
  sections.push(`## Next review`);
  sections.push(`${nextReview}`);
  sections.push('');

  return sections.join('\n');
}
