import type { SetVisualSpec } from '@smart-learning/shared';

/** Unique-collection view: values inside set braces. */
export function SetVisual({ spec }: { spec: SetVisualSpec }) {
  const hl = new Set(spec.highlight.map(String));
  return (
    <div className="viz">
      <div className="panel__head">
        <span className="panel__title">{spec.title ?? 'set'}</span>
        <span className="panel__spacer" />
        <span className="chip chip--lime">set</span>
      </div>
      <div className="viz__body">
        <div className="setwrap">
          <span className="setwrap__brace">{'{'}</span>
          {spec.values.map((v, i) => (
            <span
              key={i}
              className={`setwrap__item${hl.has(String(v)) ? ' setwrap__item--hl' : ''}`}
            >
              {v}
            </span>
          ))}
          <span className="setwrap__brace">{'}'}</span>
        </div>
        {spec.caption && <p className="viz__narration">{spec.caption}</p>}
      </div>
    </div>
  );
}
