import { z } from 'zod';
import type { SlidingWindowVisualState } from './visual.js';

/**
 * VisualSpec is the contract between the tutor and the visual panel: the model
 * decides WHAT to show and emits plain structured data; React decides HOW to
 * draw it. The union is discriminated on `kind` so a malformed spec fails
 * validation instead of reaching a renderer that cannot handle it.
 *
 * Size caps keep the model honest — a visual should depict the current
 * teaching step, not the whole topic.
 */

const shortText = (max: number) => z.string().min(1).max(max);
const title = z.string().max(80).optional();
const caption = z.string().max(200).optional();

export const ArrayVisualSpecSchema = z.object({
  kind: z.literal('array'),
  title,
  values: z.array(z.union([z.number(), shortText(40)])).min(1).max(24),
  /** Indices to emphasise. */
  highlight: z.array(z.number().int().min(0)).max(24).default([]),
  /** Named markers under cells, e.g. { index: 0, label: 'L' }. */
  pointers: z
    .array(z.object({ index: z.number().int().min(0), label: shortText(12) }))
    .max(8)
    .default([]),
  caption
});

export const KeyValueVisualSpecSchema = z.object({
  kind: z.literal('key-value'),
  title,
  entries: z
    .array(z.object({ key: shortText(40), value: z.union([z.number(), shortText(40)]) }))
    .min(1)
    .max(16),
  /** Keys to emphasise. */
  highlight: z.array(shortText(40)).max(16).default([]),
  caption
});

export const SetVisualSpecSchema = z.object({
  kind: z.literal('set'),
  title,
  values: z.array(z.union([z.number(), shortText(40)])).min(1).max(24),
  /** Values to emphasise. */
  highlight: z.array(z.union([z.number(), shortText(40)])).max(24).default([]),
  caption
});

export const DiagramVisualSpecSchema = z.object({
  kind: z.literal('diagram'),
  title,
  nodes: z
    .array(z.object({ id: shortText(40), label: shortText(60) }))
    .min(1)
    .max(16),
  edges: z
    .array(
      z.object({
        from: shortText(40),
        to: shortText(40),
        label: z.string().max(40).optional()
      })
    )
    .max(20)
    .default([]),
  /** Node ids to emphasise. */
  highlight: z.array(shortText(40)).max(16).default([]),
  caption
});

/**
 * The sliding-window spec is the deterministic server-built trace state plus a
 * kind tag; the model never authors it directly, it reports `window` instead
 * and the server resolves the step.
 */
export const SlidingWindowVisualSpecSchema = z.object({
  kind: z.literal('sliding-window'),
  nums: z.array(z.number()),
  k: z.number().int(),
  left: z.number().int(),
  right: z.number().int(),
  zeroCount: z.number().int(),
  bestLeft: z.number().int(),
  bestRight: z.number().int(),
  phase: z.enum(['expand', 'shrink', 'done']),
  message: z.string(),
  askPrediction: z.boolean(),
  stepIndex: z.number().int()
});

export const VisualSpecSchema = z.discriminatedUnion('kind', [
  ArrayVisualSpecSchema,
  KeyValueVisualSpecSchema,
  SetVisualSpecSchema,
  DiagramVisualSpecSchema,
  SlidingWindowVisualSpecSchema
]);

export type ArrayVisualSpec = z.infer<typeof ArrayVisualSpecSchema>;
export type KeyValueVisualSpec = z.infer<typeof KeyValueVisualSpecSchema>;
export type SetVisualSpec = z.infer<typeof SetVisualSpecSchema>;
export type DiagramVisualSpec = z.infer<typeof DiagramVisualSpecSchema>;
export type SlidingWindowVisualSpec = z.infer<typeof SlidingWindowVisualSpecSchema>;
export type VisualSpec = z.infer<typeof VisualSpecSchema>;
export type VisualKind = VisualSpec['kind'];

/** Server-side: validate a model-emitted spec. Undefined means "no visual". */
export function parseVisualSpec(raw: unknown): VisualSpec | undefined {
  const result = VisualSpecSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

/**
 * Sessions saved before VisualSpec existed persist a bare
 * SlidingWindowVisualState (no `kind`). Wrap those so old transcripts still
 * render; anything else unrecognised yields no visual rather than a crash.
 */
export function normalizeVisualSpec(raw: unknown): VisualSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if ('kind' in (raw as Record<string, unknown>)) return parseVisualSpec(raw);
  return parseVisualSpec({ ...(raw as Record<string, unknown>), kind: 'sliding-window' });
}

/** The server builds this from the trace; the model never emits it. */
export function slidingWindowSpec(state: SlidingWindowVisualState): SlidingWindowVisualSpec {
  return { kind: 'sliding-window', ...state };
}
