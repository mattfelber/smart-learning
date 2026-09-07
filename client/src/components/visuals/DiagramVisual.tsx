import { useMemo } from 'react';
import type { DiagramVisualSpec } from '@smart-learning/shared';

const NODE_W = 132;
const NODE_H = 38;
const COL_GAP = 156;
const ROW_H = 84;

interface Placed {
  id: string;
  label: string;
  x: number;
  y: number;
}

/**
 * Small directed diagram: nodes are layered top-to-bottom by longest-path
 * depth from the sources, then centred within each row. Aimed at 3–8 node
 * educational flows (request lifecycles, pipelines, call graphs); not a
 * general graph layout engine.
 */
export function DiagramVisual({ spec }: { spec: DiagramVisualSpec }) {
  const { placed, width, height, edges } = useMemo(() => {
    const depth = new Map(spec.nodes.map((n) => [n.id, 0]));
    // Relax edges a bounded number of times so cycles cannot loop forever.
    for (let i = 0; i < spec.nodes.length; i++) {
      for (const e of spec.edges) {
        const a = depth.get(e.from);
        const b = depth.get(e.to);
        if (a !== undefined && b !== undefined && b < a + 1) depth.set(e.to, a + 1);
      }
    }

    const rows = new Map<number, string[]>();
    for (const n of spec.nodes) {
      const d = Math.min(depth.get(n.id) ?? 0, spec.nodes.length);
      rows.set(d, [...(rows.get(d) ?? []), n.id]);
    }

    const maxRow = Math.max(1, ...[...rows.values()].map((r) => r.length));
    const maxDepth = Math.max(0, ...rows.keys());
    const width = Math.max(240, maxRow * COL_GAP + 24);
    const height = (maxDepth + 1) * ROW_H + NODE_H / 2;

    const byId = new Map(spec.nodes.map((n) => [n.id, n]));
    const placed = new Map<string, Placed>();
    for (const [d, ids] of rows) {
      const rowWidth = ids.length * COL_GAP;
      const startX = (width - rowWidth) / 2 + COL_GAP / 2;
      ids.forEach((id, i) => {
        placed.set(id, {
          id,
          label: byId.get(id)?.label ?? id,
          x: startX + i * COL_GAP,
          y: d * ROW_H + NODE_H
        });
      });
    }

    const edges = spec.edges
      .map((e) => {
        const from = placed.get(e.from);
        const to = placed.get(e.to);
        return from && to ? { ...e, from, to } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    return { placed, width, height, edges };
  }, [spec]);

  const highlighted = new Set(spec.highlight);

  return (
    <div className="viz">
      <div className="panel__head">
        <span className="panel__title">{spec.title ?? 'diagram'}</span>
        <span className="panel__spacer" />
        <span className="chip chip--violet">diagram</span>
      </div>
      <div className="viz__body">
        <div className="diagram" style={{ minHeight: height }}>
          <svg className="diagram__edges" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <defs>
              <marker
                id="darrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const x1 = e.from.x;
              const y1 = e.from.y + NODE_H / 2;
              const x2 = e.to.x;
              const y2 = e.to.y - NODE_H / 2;
              const sameRow = Math.abs(e.from.y - e.to.y) < 1;
              const path = sameRow
                ? `M ${x1 + NODE_W / 2} ${e.from.y} L ${x2 - NODE_W / 2} ${e.to.y}`
                : `M ${x1} ${y1} C ${x1} ${y1 + 28}, ${x2} ${y2 - 28}, ${x2} ${y2}`;
              return (
                <g key={i}>
                  <path className="diagram__edge" d={path} markerEnd="url(#darrow)" />
                  {e.label && (
                    <text
                      className="diagram__edgelabel"
                      x={(x1 + x2) / 2}
                      y={sameRow ? e.from.y - 8 : (y1 + y2) / 2}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {[...placed.values()].map((n) => (
            <div
              key={n.id}
              className={`diagram__node${highlighted.has(n.id) ? ' diagram__node--hl' : ''}`}
              style={{ left: n.x - NODE_W / 2, top: n.y - NODE_H / 2, width: NODE_W }}
            >
              {n.label}
            </div>
          ))}
        </div>
        {spec.caption && <p className="viz__narration">{spec.caption}</p>}
      </div>
    </div>
  );
}
