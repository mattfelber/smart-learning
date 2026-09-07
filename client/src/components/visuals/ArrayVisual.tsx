import type { ArrayVisualSpec } from '@smart-learning/shared';

/** Static array with highlighted cells and labelled pointers. */
export function ArrayVisual({ spec }: { spec: ArrayVisualSpec }) {
  const ptrLabels = new Map<number, string[]>();
  for (const p of spec.pointers) {
    ptrLabels.set(p.index, [...(ptrLabels.get(p.index) ?? []), p.label]);
  }

  return (
    <div className="viz">
      <div className="panel__head">
        <span className="panel__title">{spec.title ?? 'array'}</span>
        <span className="panel__spacer" />
        <span className="chip chip--cyan">array</span>
      </div>
      <div className="viz__body">
        <div className="tape">
          {spec.values.map((v, i) => (
            <div
              key={i}
              className={['cell', spec.highlight.includes(i) && 'cell--in']
                .filter(Boolean)
                .join(' ')}
            >
              <span className="cell__idx">{i}</span>
              {v}
              {(ptrLabels.get(i) ?? []).map((label, j) => (
                <span
                  key={j}
                  className={`ptr ${j % 2 === 0 ? 'ptr--l' : 'ptr--r'}`}
                  style={{ transform: `translateX(${j * 20 - ((ptrLabels.get(i)?.length ?? 1) - 1) * 10}px)` }}
                >
                  {label}
                </span>
              ))}
            </div>
          ))}
        </div>
        {spec.caption && <p className="viz__narration">{spec.caption}</p>}
      </div>
    </div>
  );
}
