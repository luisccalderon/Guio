import { z } from "zod";
import type { Connector } from "../connectors/types";
import type { BlockVersion, Script, ScriptBlock, Skeleton, SkeletonBlock, Source, Template } from "../domain/schemas";
import { computePointRefs } from "../script/staleness";
import type { ProjectStore } from "../store/projectStore";
import { humanizeVoiceover } from "./humanize";
import { draftPrompt, rewritePrompt, type BlockPromptInput } from "./prompts";
import { runStructured } from "./structured";

const BlockReply = z.object({ voiceover: z.string().min(1), onScreen: z.string() });

export interface GenerationContext {
  store: ProjectStore;
  slug: string;
  template: Template;
  styleProfile: string | null;
  connectors: { draft: Connector; rewrite: Connector; humanize: Connector };
  humanize: { enabled: boolean; rules: string };
  timeoutMs: number;
  signal: AbortSignal;
  now: () => string;
}

interface Written {
  voiceover: string;
  onScreen: string;
  humanizeStatus: ScriptBlock["humanizeStatus"];
}

function blockIdFor(skeletonBlockId: string): string {
  return `b-${skeletonBlockId}`;
}

function promptInput(
  ctx: GenerationContext,
  language: string,
  skeleton: Skeleton,
  sources: Source[],
  block: SkeletonBlock,
  previousVoiceover: string | null,
): BlockPromptInput {
  const quotes = new Map(sources.flatMap((source) => source.keyPoints.map((point) => [point.id, point.quote] as const)));
  return {
    language,
    guidance: ctx.template.blocks.find((item) => item.id === block.id)?.guidance ?? "",
    blockTitle: block.title,
    styleProfile: ctx.styleProfile,
    outline: skeleton.blocks.map((item) => item.title),
    previousVoiceover,
    points: block.points.map((point) => ({
      text: point.text,
      sourceIds: point.sourceIds,
      quote: point.keyPointId === null ? null : (quotes.get(point.keyPointId) ?? null),
    })),
  };
}

async function archive(ctx: GenerationContext, blockId: string, version: BlockVersion): Promise<void> {
  await ctx.store.appendHistory(ctx.slug, blockId, version);
}

async function applyHumanize(
  ctx: GenerationContext,
  blockId: string,
  language: string,
  reply: { voiceover: string; onScreen: string },
  previousVoiceover: string | null,
  reason: "draft" | "rewrite",
): Promise<Written> {
  if (!ctx.humanize.enabled) {
    return { ...reply, humanizeStatus: "off" };
  }
  const result = await humanizeVoiceover(
    {
      voiceover: reply.voiceover,
      previousVoiceover,
      language,
      styleProfile: ctx.styleProfile,
      rules: ctx.humanize.rules,
      connector: ctx.connectors.humanize,
      timeoutMs: ctx.timeoutMs,
    },
    ctx.signal,
  );
  if (result.status === "done") {
    await archive(ctx, blockId, { savedAt: ctx.now(), voiceover: reply.voiceover, onScreen: reply.onScreen, reason });
  }
  return { voiceover: result.voiceover, onScreen: reply.onScreen, humanizeStatus: result.status };
}

function toScriptBlock(block: SkeletonBlock, written: Written): ScriptBlock {
  return {
    id: blockIdFor(block.id),
    skeletonBlockId: block.id,
    title: block.title,
    pointRefs: computePointRefs(block),
    origin: "generated",
    ...written,
  };
}

export async function draftScript(ctx: GenerationContext): Promise<Script> {
  const startedAt = ctx.now();
  await ctx.store.recordRun(ctx.slug, { step: "draft", status: "running", startedAt });

  try {
    const [meta, skeleton, sources, existing] = await Promise.all([
      ctx.store.getMeta(ctx.slug),
      ctx.store.getSkeleton(ctx.slug),
      ctx.store.listSources(ctx.slug),
      ctx.store.getScript(ctx.slug),
    ]);

    const blocks: ScriptBlock[] = [];
    let previous: string | null = null;

    for (const block of skeleton.blocks) {
      const id = blockIdFor(block.id);
      const current = existing.blocks.find((item) => item.id === id);

      if (current?.origin === "edited") {
        blocks.push(current);
      } else {
        const input = promptInput(ctx, meta.language, skeleton, sources, block, previous);
        const reply = await runStructured(
          ctx.connectors.draft,
          { ...draftPrompt(input), timeoutMs: ctx.timeoutMs },
          BlockReply,
          ctx.signal,
        );
        if (current !== undefined) {
          await archive(ctx, id, {
            savedAt: ctx.now(),
            voiceover: current.voiceover,
            onScreen: current.onScreen,
            reason: "draft",
          });
        }
        blocks.push(toScriptBlock(block, await applyHumanize(ctx, id, meta.language, reply, previous, "draft")));
      }

      previous = blocks.at(-1)?.voiceover ?? null;
      await ctx.store.saveScript(ctx.slug, { blocks });
    }

    await ctx.store.recordRun(ctx.slug, { step: "draft", status: "done", startedAt });
    return { blocks };
  } catch (error) {
    await ctx.store.recordRun(ctx.slug, { step: "draft", status: "failed", startedAt });
    throw error;
  }
}

export async function rewriteBlock(
  ctx: GenerationContext,
  blockId: string,
  instruction: string,
  options: { confirmOverwrite: boolean },
): Promise<ScriptBlock> {
  const [meta, skeleton, sources, script] = await Promise.all([
    ctx.store.getMeta(ctx.slug),
    ctx.store.getSkeleton(ctx.slug),
    ctx.store.listSources(ctx.slug),
    ctx.store.getScript(ctx.slug),
  ]);

  const index = script.blocks.findIndex((item) => item.id === blockId);
  const current = script.blocks[index];
  if (current === undefined) {
    throw new Error(`Unknown block: ${blockId}`);
  }
  if (current.origin === "edited" && !options.confirmOverwrite) {
    throw new Error(`Block ${blockId} was manually edited. Confirm before replacing it.`);
  }
  const block = skeleton.blocks.find((item) => item.id === current.skeletonBlockId);
  if (block === undefined) {
    throw new Error(`Block ${blockId} no longer exists in the skeleton.`);
  }

  const previous = index > 0 ? (script.blocks[index - 1]?.voiceover ?? null) : null;
  const input = promptInput(ctx, meta.language, skeleton, sources, block, previous);
  const reply = await runStructured(
    ctx.connectors.rewrite,
    { ...rewritePrompt(input, current.voiceover, instruction), timeoutMs: ctx.timeoutMs },
    BlockReply,
    ctx.signal,
  );

  await archive(ctx, blockId, {
    savedAt: ctx.now(),
    voiceover: current.voiceover,
    onScreen: current.onScreen,
    reason: "rewrite",
  });
  const updated = toScriptBlock(block, await applyHumanize(ctx, blockId, meta.language, reply, previous, "rewrite"));
  await ctx.store.saveScript(ctx.slug, {
    blocks: script.blocks.map((item) => (item.id === blockId ? updated : item)),
  });
  return updated;
}
