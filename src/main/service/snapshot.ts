import type { Finding, ScriptBlock, Source, Verification } from "../../core/domain/schemas";
import { sourceSearchText } from "../../core/domain/sourceText";
import { hashText } from "../../core/hash";
import { staleBlockIds } from "../../core/script/staleness";
import { estimateSeconds } from "../../core/script/timing";
import { evaluateExport } from "../../core/verify/exportGate";
import type { ProjectSnapshot } from "../../shared/ipc";
import { isBlockedSource } from "../../shared/sources";
import type { ServiceContext } from "./context";

function needsCard(source: Source): boolean {
  return !source.discarded && !isBlockedSource(source) && source.summary === "" && source.keyPoints.length === 0;
}

function openClaims(blocks: ScriptBlock[], verification: Verification): Finding[] {
  return verification.findings.filter((finding) => {
    const block = blocks.find((item) => item.id === finding.blockId);
    if (finding.kind !== "claim" || block === undefined) {
      return false;
    }
    const textHash = hashText(block.voiceover);
    return !verification.acceptances.some((item) => item.findingId === finding.id && item.textHash === textHash);
  });
}

export async function buildSnapshot(ctx: ServiceContext, slug: string): Promise<ProjectSnapshot> {
  const [meta, sources, skeleton, script, verification, runs, settings] = await Promise.all([
    ctx.store.getMeta(slug),
    ctx.store.listSources(slug),
    ctx.store.getSkeleton(slug),
    ctx.store.getScript(slug),
    ctx.store.getVerification(slug),
    ctx.store.getRuns(slug),
    ctx.settings.get(),
  ]);

  const exportGate = evaluateExport({
    blocks: script.blocks,
    sources: Object.fromEntries(sources.map((source) => [source.id, sourceSearchText(source)])),
    acceptances: verification.acceptances,
  });

  const blockSeconds = Object.fromEntries(
    script.blocks.map((block) => [block.id, estimateSeconds(block.voiceover, settings.wordsPerMinute)]),
  );

  return {
    meta,
    sources,
    skeleton,
    script,
    verification,
    runs: runs.runs,
    activeStep: ctx.steps.activeStep(slug),
    cardPendingIds: sources.filter(needsCard).map((source) => source.id),
    staleBlockIds: staleBlockIds(script, skeleton),
    openFindings: [...exportGate.blocking, ...openClaims(script.blocks, verification)],
    exportGate,
    timing: { blockSeconds, totalSeconds: Object.values(blockSeconds).reduce((sum, value) => sum + value, 0) },
    humanizeEnabled: settings.humanizeEnabled,
  };
}
