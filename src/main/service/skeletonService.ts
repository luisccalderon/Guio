import type { Skeleton, SkeletonBlock, SkeletonPoint, Template } from "../../core/domain/schemas";
import { proposeSkeleton } from "../../core/pipeline/skeleton";
import { DEFAULT_TEMPLATES } from "../../core/templates/defaults";
import type { IpcParsedInput, ProjectSnapshot, SkeletonEdit } from "../../shared/ipc";
import { AI_TIMEOUT_MS, configuredConnector, trackedStep, type ServiceContext } from "./context";
import { buildSnapshot } from "./snapshot";

export function templateFor(templateId: string): Template {
  const template = DEFAULT_TEMPLATES.find((item) => item.id === templateId);
  if (template === undefined) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  return template;
}

function findPoint(skeleton: Skeleton, pointId: string): SkeletonPoint {
  const point = skeleton.blocks.flatMap((block) => block.points).find((item) => item.id === pointId);
  if (point === undefined) {
    throw new Error(`Unknown point: ${pointId}`);
  }
  return point;
}

function requireBlock(skeleton: Skeleton, blockId: string): SkeletonBlock {
  const block = skeleton.blocks.find((item) => item.id === blockId);
  if (block === undefined) {
    throw new Error(`Unknown block: ${blockId}`);
  }
  return block;
}

function nextUserPointId(skeleton: Skeleton): string {
  const used = skeleton.blocks
    .flatMap((block) => block.points)
    .map((point) => /^pt-u-(\d+)$/.exec(point.id)?.[1])
    .filter((value) => value !== undefined)
    .map(Number);
  return `pt-u-${Math.max(0, ...used) + 1}`;
}

function mapBlocks(skeleton: Skeleton, change: (block: SkeletonBlock) => SkeletonBlock): Skeleton {
  return { blocks: skeleton.blocks.map(change) };
}

function without(skeleton: Skeleton, pointId: string): Skeleton {
  return mapBlocks(skeleton, (block) => ({ ...block, points: block.points.filter((item) => item.id !== pointId) }));
}

export function applySkeletonEdit(skeleton: Skeleton, edit: SkeletonEdit): Skeleton {
  switch (edit.op) {
    case "edit-point":
      findPoint(skeleton, edit.pointId);
      return mapBlocks(skeleton, (block) => ({
        ...block,
        points: block.points.map((item) => (item.id === edit.pointId ? { ...item, text: edit.text } : item)),
      }));
    case "move-point": {
      const point = findPoint(skeleton, edit.pointId);
      requireBlock(skeleton, edit.toBlockId);
      return mapBlocks(without(skeleton, edit.pointId), (block) => {
        if (block.id !== edit.toBlockId) {
          return block;
        }
        const points = [...block.points];
        points.splice(Math.min(edit.toIndex, points.length), 0, point);
        return { ...block, points };
      });
    }
    case "add-point": {
      requireBlock(skeleton, edit.blockId);
      const point = { id: nextUserPointId(skeleton), text: edit.text, keyPointId: null, sourceIds: edit.sourceIds };
      return mapBlocks(skeleton, (block) =>
        block.id === edit.blockId ? { ...block, points: [...block.points, point] } : block,
      );
    }
    case "remove-point":
      findPoint(skeleton, edit.pointId);
      return without(skeleton, edit.pointId);
  }
}

export async function editSkeleton(ctx: ServiceContext, input: IpcParsedInput<"editSkeleton">): Promise<ProjectSnapshot> {
  const { slug, edit } = input;
  await ctx.steps.mutate(slug, async () => {
    await ctx.store.saveSkeleton(slug, applySkeletonEdit(await ctx.store.getSkeleton(slug), edit));
  });
  return buildSnapshot(ctx, slug);
}

export async function proposeSkeletonStep(
  ctx: ServiceContext,
  input: IpcParsedInput<"proposeSkeleton">,
): Promise<ProjectSnapshot> {
  const { slug } = input;
  await trackedStep(ctx, slug, "skeleton", async (signal) => {
    const [meta, sources, connector] = await Promise.all([
      ctx.store.getMeta(slug),
      ctx.store.listSources(slug),
      configuredConnector(ctx),
    ]);
    const skeleton = await proposeSkeleton({
      sources,
      template: templateFor(meta.templateId),
      connector,
      timeoutMs: AI_TIMEOUT_MS,
      signal,
    });
    await ctx.store.saveSkeleton(slug, skeleton);
  });
  return buildSnapshot(ctx, slug);
}
