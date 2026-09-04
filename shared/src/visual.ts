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
