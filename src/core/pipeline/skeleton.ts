import { z } from "zod";
import type { Connector } from "../connectors/types";
import type { KeyPoint, Skeleton, SkeletonBlock, SkeletonPoint, Source, Template } from "../domain/schemas";
import { skeletonPrompt } from "./prompts";
import { runStructured } from "./structured";

const SkeletonReply = z.object({
  blocks: z.array(z.object({ blockId: z.string(), keyPointIds: z.array(z.string()) })),
});

export interface ProposeInput {
  sources: Source[];
  template: Template;
  connector: Connector;
  timeoutMs: number;
  signal: AbortSignal;
}

function toSkeletonPoint(point: KeyPoint, sourceId: string): SkeletonPoint {
  return { id: `pt-${point.id}`, text: point.text, keyPointId: point.id, sourceIds: [sourceId] };
}

export async function proposeSkeleton(input: ProposeInput): Promise<Skeleton> {
  const available = new Map<string, SkeletonPoint>();
  for (const source of input.sources.filter((item) => !item.discarded)) {
    for (const point of source.keyPoints.filter((item) => item.selected)) {
      available.set(point.id, toSkeletonPoint(point, source.id));
    }
  }

  const reply = await runStructured(
    input.connector,
    {
      ...skeletonPrompt(
        input.template.blocks,
        [...available.values()].map((point) => ({ id: point.keyPointId ?? point.id, text: point.text })),
      ),
      timeoutMs: input.timeoutMs,
    },
    SkeletonReply,
    input.signal,
  );

  const blocks: SkeletonBlock[] = input.template.blocks.map((block) => ({
    id: block.id,
    title: block.title,
    points: [],
  }));

  for (const proposed of reply.blocks) {
    const block = blocks.find((item) => item.id === proposed.blockId);
    for (const id of proposed.keyPointIds) {
      const point = available.get(id);
      if (block !== undefined && point !== undefined) {
        block.points.push(point);
        available.delete(id);
      }
    }
  }

  const fallback = blocks.find((block) => block.id === "body") ?? blocks.at(-1);
  fallback?.points.push(...available.values());

  return { blocks };
}
