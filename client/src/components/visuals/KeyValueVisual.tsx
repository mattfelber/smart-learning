import type { KeyValueVisualSpec } from '@smart-learning/shared';

/** Hash-map / dictionary view: key → value rows. */
export function KeyValueVisual({ spec }: { spec: KeyValueVisualSpec }) {
  return (
    <div className="viz">
      <div className="panel__head">
        <span className="panel__title">{spec.title ?? 'map'}</span>
        <span className="panel__spacer" />
        <span className="chip chip--magenta">key-value</span>
      </div>
      <div className="viz__body">
        <div className="kv">
          {spec.entries.map((e) => (
            <div
              key={e.key}
              className={`kv__row${spec.highlight.includes(e.key) ? ' kv__row--hl' : ''}`}
            >
              <span className="kv__key">{e.key}</span>
              <span className="kv__arrow">→</span>
              <span className="kv__val">{e.value}</span>
            </div>
          ))}
        </div>
        {spec.caption && <p className="viz__narration">{spec.caption}</p>}
      </div>
    </div>
  );
}
