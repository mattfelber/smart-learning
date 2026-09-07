/**
 * Lightweight learner-intent detection — deterministic text matching, no extra
 * LLM call. The matched phrase is handed to the tutor prompt as a directive so
 * learner control requests override the Socratic strategy for that turn.
 */

export type LearnerDirective = 'move-on' | 'direct' | 'scope';

export interface Directive {
  kind: LearnerDirective;
  /** The matched phrase, echoed to the prompt so the model sees intent verbatim. */
  matched: string;
}

const PATTERNS: { kind: LearnerDirective; re: RegExp }[] = [
  {
    kind: 'move-on',
    re: /\b(move on|move forward|let['’]?s move|skip (this|it)|next (one|topic|concept|question)|already (know|answered)|stop asking|enough (of|with) this|i got (this|it)|can we continue)\b/i
  },
  {
    kind: 'direct',
    re: /\b(just tell me|tell me (the answer|what|it)|what['’]?s the answer|give me the answer|explain (it|that|this)|i don['’]?t know|i have no idea|idk|no idea|unsure|not sure|dunno)\b/i
  },
  {
    kind: 'scope',
    re: /\b(focus on|stick to|keep (this|it) (practical|simple)|don['’]?t go (that|so|too) deep|less (depth|theory|detail)|more practical|for interviews?)\b/i
  }
];

export function detectLearnerDirective(input: string): Directive | null {
  for (const { kind, re } of PATTERNS) {
    const m = re.exec(input);
    if (m) return { kind, matched: m[0].toLowerCase() };
  }
  return null;
}

/** The line injected into the prompt when a directive fires. */
export function directiveText(d: Directive): string {
  switch (d.kind) {
    case 'move-on':
      return `The learner said "${d.matched}". Do not probe this objective again — fill any essential gap in one sentence, then advance to the next useful concept.`;
    case 'direct':
      return `The learner said "${d.matched}". Answer or explain directly — do not respond with another Socratic question first.`;
    case 'scope':
      return `The learner corrected scope with "${d.matched}". Honor it immediately and match depth to their stated goal.`;
  }
}
