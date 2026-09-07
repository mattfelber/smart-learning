import type { ComponentType } from 'react';
import type { VisualKind, VisualSpec } from '@smart-learning/shared';
import { SlidingWindowVisualizer } from './visuals/SlidingWindowVisualizer.js';
import { ArrayVisual } from './visuals/ArrayVisual.js';
import { KeyValueVisual } from './visuals/KeyValueVisual.js';
import { SetVisual } from './visuals/SetVisual.js';
import { DiagramVisual } from './visuals/DiagramVisual.js';

/**
 * kind → renderer. The single place new visual types register: add the spec to
 * the shared union, add a renderer here, and the tutor can use it.
 */
export const VISUAL_RENDERERS: Record<VisualKind, ComponentType<{ spec: never }>> = {
  'sliding-window': SlidingWindowVisualizer,
  array: ArrayVisual,
  'key-value': KeyValueVisual,
  set: SetVisual,
  diagram: DiagramVisual
};

/**
 * Dispatches a validated VisualSpec to its renderer. The spec has already been
 * through the shared Zod schema, so each renderer can trust its own shape.
 */
export function Visualizer({ spec }: { spec: VisualSpec }) {
  const Renderer = VISUAL_RENDERERS[spec.kind] as ComponentType<{ spec: VisualSpec }> | undefined;
  if (!Renderer) return null;
  return <Renderer spec={spec} />;
}
