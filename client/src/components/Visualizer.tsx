import { useMemo, useState, useEffect } from 'react';
import { buildTrace, stateFromTrace, type SlidingWindowVisualState } from '@smart-learning/shared';

interface Props {
  visualState: SlidingWindowVisualState;
}

export function Visualizer({ visualState }: Props) {
  const { nums, k } = visualState;
  const trace = useMemo(() => buildTrace(nums, k), [nums, k]);
  const [displayStep, setDisplayStep] = useState(visualState.stepIndex);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setDisplayStep(visualState.stepIndex);
  }, [visualState.stepIndex]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setDisplayStep((s) => {
        if (s >= trace.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [playing, trace.length]);

  const current = useMemo(
    () => stateFromTrace(nums, k, displayStep),
    [nums, k, displayStep, trace]
  );

  return (
    <div style={{ border: '1px solid #ccc', padding: 12, borderRadius: 8, marginTop: 12 }}>
      <h3 style={{ margin: '0 0 12px' }}>Sliding Window Visualizer</h3>
      <p style={{ margin: '0 0 12px', minHeight: '2.5em' }}>{current.message}</p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginBottom: 12,
          justifyContent: 'center'
        }}
      >
        {current.nums.map((n, i) => {
          const inWindow = i >= current.left && i <= current.right;
          const isLeft = i === current.left;
          const isRight = i === current.right;
          const isBest = i >= current.bestLeft && i <= current.bestRight;
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                width: 36,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${isBest ? '#2a9d8f' : '#333'}`,
                background: inWindow ? '#e9f5db' : '#fff',
                borderRadius: 4,
                fontWeight: 'bold'
              }}
            >
              {n}
              {isLeft && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: -18,
                    fontSize: 10,
                    color: '#e76f51'
                  }}
                >
                  L
                </span>
              )}
              {isRight && (
                <span
                  style={{
                    position: 'absolute',
                    top: -18,
                    fontSize: 10,
                    color: '#264653'
                  }}
                >
                  R
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          justifyContent: 'center',
          fontSize: 14,
          marginBottom: 12
        }}
      >
        <span>zero_count: {current.zeroCount}</span>
        <span>k: {current.k}</span>
        <span>window size: {current.right - current.left + 1}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => setDisplayStep((s) => Math.max(0, s - 1))} disabled={displayStep === 0}>
          Previous
        </button>
        <button onClick={() => setDisplayStep(0)}>Reset</button>
        <button
          onClick={() => setDisplayStep((s) => Math.min(trace.length - 1, s + 1))}
          disabled={displayStep === trace.length - 1}
        >
          Next
        </button>
        <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
      </div>
    </div>
  );
}
