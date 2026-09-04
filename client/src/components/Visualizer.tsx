import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildTrace, stateFromTrace, type SlidingWindowVisualState } from '@smart-learning/shared';

interface Props {
  visualState: SlidingWindowVisualState;
}

const SPEEDS = [1, 2, 4] as const;

export function Visualizer({ visualState }: Props) {
  const { nums, k } = visualState;
  const trace = useMemo(() => buildTrace(nums, k), [nums, k]);
  const [displayStep, setDisplayStep] = useState(visualState.stepIndex);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const rootRef = useRef<HTMLDivElement>(null);

  const lastStep = trace.length - 1;
  // Where the tutor is; distinct from where you are looking.
  const tutorStep = Math.max(0, Math.min(lastStep, visualState.stepIndex));

  // Follow the tutor only while you haven't taken manual control. Scrubbing or
  // playing detaches the view so an incoming reply can't yank it away
  // mid-exploration.
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (following) setDisplayStep(tutorStep);
  }, [tutorStep, following]);

  const detached = displayStep !== tutorStep;

  function takeControl(next: number) {
    setFollowing(false);
    setDisplayStep(Math.max(0, Math.min(lastStep, next)));
  }

  function resync() {
    setPlaying(false);
    setFollowing(true);
    setDisplayStep(tutorStep);
  }

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
    }, 800 / speed);
    return () => clearInterval(interval);
  }, [playing, trace.length, speed]);

  const current = useMemo(
    () => stateFromTrace(nums, k, displayStep),
    [nums, k, displayStep, trace]
  );

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      setFollowing(false);
      setDisplayStep((s) => Math.max(0, Math.min(lastStep, s + delta)));
    },
    [lastStep]
  );

  // Arrow keys scrub the trace while the panel has focus.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === ' ') {
      e.preventDefault();
      setPlaying((p) => !p);
    }
  }

  const windowSize = current.right < 0 ? 0 : current.right - current.left + 1;
  const bestSize = current.bestRight < 0 ? 0 : current.bestRight - current.bestLeft + 1;
  const overBudget = current.zeroCount > current.k;
  const pct = lastStep > 0 ? (displayStep / lastStep) * 100 : 0;
  const tutorPct = lastStep > 0 ? (tutorStep / lastStep) * 100 : 0;

  return (
    <div
      className="viz"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="group"
      aria-label="Sliding window visualizer"
    >
      <div className="panel__head">
        <span className="panel__title">sliding_window.trace</span>
        <span className="panel__spacer" />
        {detached ? (
          <button className="chip chip--amber chip--btn" onClick={resync}>
            previewing · tutor at {tutorStep} ⟲ resync
          </button>
        ) : (
          <span className="chip chip--lime">following tutor</span>
        )}
        <span className={`chip ${current.phase === 'done' ? 'chip--lime' : 'chip--cyan'}`}>
          {current.phase}
        </span>
      </div>

      <div className="viz__body">
        <p className="viz__narration">{current.message}</p>

        <div className="tape">
          {current.nums.map((n, i) => {
            const inWindow = current.right >= 0 && i >= current.left && i <= current.right;
            const isLeft = i === current.left && current.right >= 0;
            const isRight = i === current.right;
            const isBest = current.bestRight >= 0 && i >= current.bestLeft && i <= current.bestRight;
            const both = isLeft && isRight;
            return (
              <div
                key={i}
                className={[
                  'cell',
                  inWindow && 'cell--in',
                  isBest && 'cell--best',
                  n === 0 && 'cell--zero'
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="cell__idx">{i}</span>
                {n}
                {isLeft && <span className={`ptr ptr--l${both ? ' ptr--lr' : ''}`}>L</span>}
                {isRight && <span className={`ptr ptr--r${both ? ' ptr--rl' : ''}`}>R</span>}
              </div>
            );
          })}
        </div>

        <div className="readouts">
          <div className={`readout ${overBudget ? 'readout--alert' : 'readout--magenta'}`}>
            <div className="readout__k">zeros</div>
            <div className="readout__v">{current.zeroCount}</div>
          </div>
          <div className="readout readout--violet">
            <div className="readout__k">budget k</div>
            <div className="readout__v">{current.k}</div>
          </div>
          <div className="readout readout--cyan">
            <div className="readout__k">window</div>
            <div className="readout__v">{windowSize}</div>
          </div>
          <div className="readout readout--lime">
            <div className="readout__k">best</div>
            <div className="readout__v">{bestSize}</div>
          </div>
        </div>

        <div className="scrub">
          <div className="scrub__meta">
            <span>
              step <b>{displayStep}</b> / {lastStep}
            </span>
            <span>
              <b>{Math.round(pct)}%</b> traced
            </span>
          </div>
          <div className="scrub__track">
            <input
              type="range"
              min={0}
              max={lastStep}
              value={displayStep}
              style={{ ['--pct' as string]: `${pct}%` }}
              onChange={(e) => {
                setPlaying(false);
                takeControl(Number(e.target.value));
              }}
              aria-label="Scrub through the algorithm trace"
            />
            <span
              className="scrub__marker"
              style={{ left: `${tutorPct}%` }}
              title={`Tutor is at step ${tutorStep}`}
            />
          </div>
        </div>
      </div>

      <div className="transport">
        <button
          className="btn btn--icon"
          onClick={() => {
            setPlaying(false);
            takeControl(0);
          }}
          disabled={displayStep === 0}
          title="Restart"
        >
          ⏮
        </button>
        <button
          className="btn btn--icon"
          onClick={() => step(-1)}
          disabled={displayStep === 0}
          title="Previous step (←)"
        >
          ◀
        </button>
        <button
          className="btn btn--primary"
          onClick={() => {
            setFollowing(false);
            if (displayStep >= lastStep) setDisplayStep(0);
            setPlaying((p) => !p);
          }}
          title="Play / pause (space)"
        >
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button
          className="btn btn--icon"
          onClick={() => step(1)}
          disabled={displayStep === lastStep}
          title="Next step (→)"
        >
          ▶
        </button>
        <span className="transport__spacer" />
        {detached && (
          <button className="btn btn--ghost-violet" onClick={resync} title="Jump back to the tutor">
            ⟲ Tutor
          </button>
        )}
        <button
          className="btn btn--icon"
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          title="Playback speed"
        >
          {speed}×
        </button>
      </div>
    </div>
  );
}
