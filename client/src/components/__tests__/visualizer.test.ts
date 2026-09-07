import { describe, it, expect } from 'vitest';
import { VISUAL_RENDERERS } from '../Visualizer.js';
import { SlidingWindowVisualizer } from '../visuals/SlidingWindowVisualizer.js';
import { ArrayVisual } from '../visuals/ArrayVisual.js';
import { KeyValueVisual } from '../visuals/KeyValueVisual.js';
import { SetVisual } from '../visuals/SetVisual.js';
import { DiagramVisual } from '../visuals/DiagramVisual.js';

describe('visual dispatcher', () => {
  it('maps every spec kind to its renderer', () => {
    expect(VISUAL_RENDERERS['sliding-window']).toBe(SlidingWindowVisualizer);
    expect(VISUAL_RENDERERS['array']).toBe(ArrayVisual);
    expect(VISUAL_RENDERERS['key-value']).toBe(KeyValueVisual);
    expect(VISUAL_RENDERERS['set']).toBe(SetVisual);
    expect(VISUAL_RENDERERS['diagram']).toBe(DiagramVisual);
  });

  it('has a renderer for each kind in the union', () => {
    const kinds = ['sliding-window', 'array', 'key-value', 'set', 'diagram'] as const;
    for (const kind of kinds) {
      expect(VISUAL_RENDERERS[kind], `missing renderer for ${kind}`).toBeTypeOf('function');
    }
  });
});
