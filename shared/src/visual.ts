export interface SlidingWindowVisualState {
  nums: number[];
  k: number;
  left: number;
  right: number;
  zeroCount: number;
  bestLeft: number;
  bestRight: number;
  phase: 'expand' | 'shrink' | 'done';
  message: string;
  askPrediction: boolean;
  stepIndex: number;
}

export const DEFAULT_EXAMPLE = {
  nums: [1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0],
  k: 2
};

export interface VisualStep {
  left: number;
  right: number;
  zeroCount: number;
  bestLeft: number;
  bestRight: number;
  phase: 'expand' | 'shrink' | 'done';
  description: string;
}

export function buildTrace(nums: number[], k: number): VisualStep[] {
  const trace: VisualStep[] = [];
  let left = 0;
  let zeroCount = 0;
  let bestLeft = 0;
  let bestRight = -1;
  let bestSize = 0;

  trace.push({
    left,
    right: -1,
    zeroCount,
    bestLeft,
    bestRight,
    phase: 'expand',
    description: 'Initial state. right is before the array.'
  });

  for (let right = 0; right < nums.length; right++) {
    if (nums[right] === 0) {
      zeroCount++;
    }

    trace.push({
      left,
      right,
      zeroCount,
      bestLeft,
      bestRight,
      phase: 'expand',
      description: `Expand right to index ${right} (value ${nums[right]}). zero_count is now ${zeroCount}.`
    });

    while (zeroCount > k) {
      if (nums[left] === 0) {
        zeroCount--;
      }
      left++;
      trace.push({
        left,
        right,
        zeroCount,
        bestLeft,
        bestRight,
        phase: 'shrink',
        description: `Window invalid; shrink left to ${left} (passed a ${nums[left - 1]}). zero_count is now ${zeroCount}.`
      });
    }

    const windowSize = right - left + 1;
    if (windowSize > bestSize) {
      bestSize = windowSize;
      bestLeft = left;
      bestRight = right;
    }

    trace.push({
      left,
      right,
      zeroCount,
      bestLeft,
      bestRight,
      phase: 'expand',
      description: `Window [${left}, ${right}] is valid. Current best is [${bestLeft}, ${bestRight}] with size ${bestSize}.`
    });
  }

  trace.push({
    left,
    right: nums.length - 1,
    zeroCount,
    bestLeft,
    bestRight,
    phase: 'done',
    description: `Done. Maximum window is [${bestLeft}, ${bestRight}] with size ${bestSize}.`
  });

  return trace;
}

export function stateFromTrace(
  nums: number[],
  k: number,
  stepIndex: number
): SlidingWindowVisualState {
  const trace = buildTrace(nums, k);
  const step = trace[Math.min(stepIndex, trace.length - 1)];
  return {
    nums,
    k,
    left: step.left,
    right: step.right,
    zeroCount: step.zeroCount,
    bestLeft: step.bestLeft,
    bestRight: step.bestRight,
    phase: step.phase,
    message: step.description,
    askPrediction: stepIndex < trace.length - 1,
    stepIndex
  };
}

export function nextStep(nums: number[], k: number, stepIndex: number): number {
  const trace = buildTrace(nums, k);
  return Math.min(stepIndex + 1, trace.length - 1);
}

export interface WindowPosition {
  left: number;
  right: number;
  zeroCount: number;
}

/**
 * Map a window position the tutor is talking about back onto the trace.
 *
 * The tutor narrates several algorithm steps per turn, so a counter that only
 * ticks forward one step at a time drifts behind the conversation. Resolving
 * the step from the described window instead keeps the two in lockstep and lets
 * the visual recover from any earlier drift.
 *
 * Prefers an exact (left, right, zeroCount) match, taking the latest one since
 * consecutive entries can share a position (a shrink and the validity check
 * that follows it). Falls back to the closest entry by Manhattan distance.
 */
export function findStep(nums: number[], k: number, target: WindowPosition): number {
  const trace = buildTrace(nums, k);

  for (let i = trace.length - 1; i >= 0; i--) {
    const s = trace[i];
    if (s.left === target.left && s.right === target.right && s.zeroCount === target.zeroCount) {
      return i;
    }
  }

  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < trace.length; i++) {
    const s = trace[i];
    const distance =
      Math.abs(s.left - target.left) +
      Math.abs(s.right - target.right) +
      Math.abs(s.zeroCount - target.zeroCount);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export function totalSteps(nums: number[], k: number): number {
  return buildTrace(nums, k).length;
}

/**
 * The sliding-window trace is the only visualization that exists, so a concept
 * only gets a visual panel when it actually is that concept. Models name it
 * loosely ("sliding-window", "sliding window basics"), hence the pattern.
 */
export function conceptHasVisual(concept: string): boolean {
  return /sliding[\s_-]?window/i.test(concept);
}
