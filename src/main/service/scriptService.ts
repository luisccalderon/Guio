import type { BlockHistory, Script, ScriptBlock } from "../../core/domain/schemas";
import { humanizeVoiceover } from "../../core/pipeline/humanize";
import { draftScript, rewriteBlock, type GenerationContext } from "../../core/pipeline/script";
import { effectiveHumanizeRules } from "../../core/store/settingsStore";
import type { IpcParsedInput, ProjectSnapshot } from "../../shared/ipc";
import { AI_TIMEOUT_MS, configuredConnector, trackedStep, type ServiceContext } from "./context";
import { templateFor } from "./skeletonService";
import { buildSnapshot } from "./snapshot";

async function generationContext(ctx: ServiceContext, slug: string, signal: AbortSignal): Promise<GenerationContext> {
  const [meta, settings, connector] = await Promise.all([
    ctx.store.getMeta(slug),
    ctx.settings.get(),
    configuredConnector(ctx),
  ]);
  return {
    store: ctx.store,
    slug,
    template: templateFor(meta.templateId),
    styleProfile: null,
    connectors: { draft: connector, rewrite: connector, humanize: connector },
    humanize: {
      enabled: settings.humanizeEnabled,
      rules: effectiveHumanizeRules(settings, ctx.bundledHumanizeRules),
    },
    timeoutMs: AI_TIMEOUT_MS,
    signal,
    now: ctx.now,
  };
}

/** A failed draft has replaced script.json with the blocks it reached. Put the rest back. */
async function restoreUntouchedBlocks(ctx: ServiceContext, slug: string, prior: Script): Promise<void> {
  const [partial, skeleton] = await Promise.all([ctx.store.getScript(slug), ctx.store.getSkeleton(slug)]);
  const blocks = skeleton.blocks.flatMap((block) => {
    const current =
      partial.blocks.find((item) => item.skeletonBlockId === block.id) ??
      prior.blocks.find((item) => item.skeletonBlockId === block.id);
    return current === undefined ? [] : [current];
  });
  await ctx.store.saveScript(slug, { blocks });
}

export async function draftScriptStep(
  ctx: ServiceContext,
  input: IpcParsedInput<"draftScript">,
): Promise<ProjectSnapshot> {
  const { slug } = input;
  await trackedStep(ctx, slug, "draft", async (signal) => {
    const prior = await ctx.store.getScript(slug);
    try {
      await draftScript(await generationContext(ctx, slug, signal));
    } catch (error) {
      await restoreUntouchedBlocks(ctx, slug, prior);
      throw error;
    }
  });
  return buildSnapshot(ctx, slug);
}

export async function rewriteBlockStep(
  ctx: ServiceContext,
  input: IpcParsedInput<"rewriteBlock">,
): Promise<ProjectSnapshot> {
  const { slug, blockId, instruction, confirmOverwrite } = input;
  await trackedStep(ctx, slug, "rewrite", async (signal) => {
    await rewriteBlock(await generationContext(ctx, slug, signal), blockId, instruction, { confirmOverwrite });
  });
  return buildSnapshot(ctx, slug);
}

function requireBlock(script: Script, blockId: string): ScriptBlock {
  const block = script.blocks.find((item) => item.id === blockId);
  if (block === undefined) {
    throw new Error(`Unknown block: ${blockId}`);
  }
  return block;
}

async function replaceBlock(ctx: ServiceContext, slug: string, script: Script, updated: ScriptBlock): Promise<void> {
  await ctx.store.saveScript(slug, {
    blocks: script.blocks.map((item) => (item.id === updated.id ? updated : item)),
  });
}

/** Must run inside `ctx.steps.mutate` for this project. */
export async function saveManualText(
  ctx: ServiceContext,
  slug: string,
  blockId: string,
  voiceover: string,
  onScreen: string,
): Promise<void> {
  const script = await ctx.store.getScript(slug);
  const current = requireBlock(script, blockId);
  if (current.voiceover === voiceover && current.onScreen === onScreen) {
    return;
  }
  await ctx.store.appendHistory(slug, blockId, {
    savedAt: ctx.now(),
    voiceover: current.voiceover,
    onScreen: current.onScreen,
    reason: "edit",
  });
  await replaceBlock(ctx, slug, script, {
    ...current,
    voiceover,
    onScreen,
    origin: "edited",
    humanizeStatus: "off",
  });
}

export async function editBlock(ctx: ServiceContext, input: IpcParsedInput<"editBlock">): Promise<ProjectSnapshot> {
  const { slug, blockId, voiceover, onScreen } = input;
  await ctx.steps.mutate(slug, () => saveManualText(ctx, slug, blockId, voiceover, onScreen));
  return buildSnapshot(ctx, slug);
}

export function getBlockHistory(
  ctx: ServiceContext,
  input: IpcParsedInput<"getBlockHistory">,
): Promise<BlockHistory> {
  return ctx.store.getHistory(input.slug, input.blockId);
}

export async function restoreVersion(
  ctx: ServiceContext,
  input: IpcParsedInput<"restoreVersion">,
): Promise<ProjectSnapshot> {
  const { slug, blockId, versionIndex } = input;
  await ctx.steps.mutate(slug, async () => {
    const script = await ctx.store.getScript(slug);
    const current = requireBlock(script, blockId);
    const version = (await ctx.store.getHistory(slug, blockId)).versions[versionIndex];
    if (version === undefined) {
      throw new Error(`Unknown version: ${versionIndex}`);
    }
    await ctx.store.appendHistory(slug, blockId, {
      savedAt: ctx.now(),
      voiceover: current.voiceover,
      onScreen: current.onScreen,
      reason: "restore",
    });
    await replaceBlock(ctx, slug, script, {
      ...current,
      voiceover: version.voiceover,
      onScreen: version.onScreen,
      origin: "edited",
      humanizeStatus: "off",
    });
  });
  return buildSnapshot(ctx, slug);
}

export async function retryHumanize(
  ctx: ServiceContext,
  input: IpcParsedInput<"retryHumanize">,
): Promise<ProjectSnapshot> {
  const { slug, blockId } = input;
  const settings = await ctx.settings.get();
  if (!settings.humanizeEnabled) {
    return buildSnapshot(ctx, slug);
  }
  await trackedStep(ctx, slug, "humanize", async (signal) => {
    const [meta, script, connector] = await Promise.all([
      ctx.store.getMeta(slug),
      ctx.store.getScript(slug),
      configuredConnector(ctx),
    ]);
    const current = requireBlock(script, blockId);
    const index = script.blocks.indexOf(current);
    const result = await humanizeVoiceover(
      {
        voiceover: current.voiceover,
        previousVoiceover: index > 0 ? (script.blocks[index - 1]?.voiceover ?? null) : null,
        language: meta.language,
        styleProfile: null,
        rules: effectiveHumanizeRules(settings, ctx.bundledHumanizeRules),
        connector,
        timeoutMs: AI_TIMEOUT_MS,
      },
      signal,
    );
    if (result.status === "done") {
      await ctx.store.appendHistory(slug, blockId, {
        savedAt: ctx.now(),
        voiceover: current.voiceover,
        onScreen: current.onScreen,
        reason: "humanize",
      });
    }
    await replaceBlock(ctx, slug, script, { ...current, voiceover: result.voiceover, humanizeStatus: result.status });
  });
  return buildSnapshot(ctx, slug);
}
