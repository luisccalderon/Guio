import type { Finding } from "../../core/domain/schemas";
import { hashText } from "../../core/hash";
import { runVerification } from "../../core/pipeline/review";
import type { IpcParsedInput, ProjectSnapshot } from "../../shared/ipc";
import { AI_TIMEOUT_MS, configuredConnector, trackedStep, type ServiceContext } from "./context";
import { saveManualText } from "./scriptService";
import { buildSnapshot } from "./snapshot";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeSentenceContaining(text: string, token: string): string | null {
  const pattern = new RegExp(`(?<![\\d.,])${escapeRegExp(token)}(?!\\d)`);
  const sentences = text.split(/(?<=[.!?…])\s+/);
  const index = sentences.findIndex((sentence) => pattern.test(sentence));
  if (index === -1) {
    return null;
  }
  return sentences.filter((_sentence, position) => position !== index).join(" ");
}

async function requireOpenFinding(ctx: ServiceContext, slug: string, findingId: string): Promise<Finding> {
  const finding = (await buildSnapshot(ctx, slug)).openFindings.find((item) => item.id === findingId);
  if (finding === undefined) {
    throw new Error("This finding is no longer open.");
  }
  return finding;
}

export async function runVerificationStep(
  ctx: ServiceContext,
  input: IpcParsedInput<"runVerification">,
): Promise<ProjectSnapshot> {
  const { slug } = input;
  await trackedStep(ctx, slug, "ai-review", async (signal) => {
    await runVerification({
      store: ctx.store,
      slug,
      connector: await configuredConnector(ctx),
      timeoutMs: AI_TIMEOUT_MS,
      signal,
      now: ctx.now,
    });
  });
  return buildSnapshot(ctx, slug);
}

export async function acceptFinding(
  ctx: ServiceContext,
  input: IpcParsedInput<"acceptFinding">,
): Promise<ProjectSnapshot> {
  const { slug, findingId } = input;
  await ctx.steps.mutate(slug, async () => {
    const finding = await requireOpenFinding(ctx, slug, findingId);
    const [script, verification] = await Promise.all([ctx.store.getScript(slug), ctx.store.getVerification(slug)]);
    const block = script.blocks.find((item) => item.id === finding.blockId);
    if (block === undefined) {
      throw new Error(`Unknown block: ${finding.blockId}`);
    }
    await ctx.store.saveVerification(slug, {
      ...verification,
      acceptances: [
        ...verification.acceptances.filter((item) => item.findingId !== findingId),
        { findingId, textHash: hashText(block.voiceover) },
      ],
    });
  });
  return buildSnapshot(ctx, slug);
}

export async function removeFindingText(
  ctx: ServiceContext,
  input: IpcParsedInput<"removeFindingText">,
): Promise<ProjectSnapshot> {
  const { slug, findingId } = input;
  await ctx.steps.mutate(slug, async () => {
    const finding = await requireOpenFinding(ctx, slug, findingId);
    const block = (await ctx.store.getScript(slug)).blocks.find((item) => item.id === finding.blockId);
    const remaining = block === undefined ? null : removeSentenceContaining(block.voiceover, finding.token);
    if (block === undefined || remaining === null) {
      throw new Error("This text was not found in the block. Correct it by hand.");
    }
    await saveManualText(ctx, slug, block.id, remaining, block.onScreen);
  });
  return buildSnapshot(ctx, slug);
}
