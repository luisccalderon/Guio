import { z } from "zod";
import type { Connector } from "../connectors/types";
import type { Finding, ScriptBlock, Source, Verification } from "../domain/schemas";
import { sourceSearchText } from "../domain/sourceText";
import { hashText } from "../hash";
import type { ProjectStore } from "../store/projectStore";
import { extractMarks } from "../verify/marks";
import { checkBlockNumbers } from "../verify/numberCheck";
import { aiReviewPrompt, styleProfilePrompt } from "./prompts";
import { runStructured } from "./structured";

const ReviewReply = z.object({ claims: z.array(z.object({ claim: z.string() })) });

export interface VerificationInput {
  store: ProjectStore;
  slug: string;
  connector: Connector;
  timeoutMs: number;
  signal: AbortSignal;
  now: () => string;
}

function citedQuotes(block: ScriptBlock, sources: Source[]): { id: string; quote: string }[] {
  const cited = extractMarks(block.voiceover);
  return sources
    .filter((source) => cited.includes(source.id))
    .flatMap((source) =>
      source.keyPoints.filter((point) => point.selected).map((point) => ({ id: source.id, quote: point.quote })),
    );
}

async function reviewClaims(input: VerificationInput, block: ScriptBlock, sources: Source[]): Promise<Finding[]> {
  const quotes = citedQuotes(block, sources);
  if (quotes.length === 0) {
    return [];
  }
  const reply = await runStructured(
    input.connector,
    { ...aiReviewPrompt(block.voiceover, quotes), timeoutMs: input.timeoutMs },
    ReviewReply,
    input.signal,
  );
  return reply.claims.map(({ claim }) => ({
    id: `${block.id}:claim:${hashText(claim).slice(0, 12)}`,
    blockId: block.id,
    kind: "claim",
    token: claim,
    reason: "claim-unsupported",
  }));
}

export async function runVerification(input: VerificationInput): Promise<Verification> {
  const startedAt = input.now();
  await input.store.recordRun(input.slug, { step: "ai-review", status: "running", startedAt });

  try {
    const [script, sources, previous] = await Promise.all([
      input.store.getScript(input.slug),
      input.store.listSources(input.slug),
      input.store.getVerification(input.slug),
    ]);
    const texts = Object.fromEntries(sources.map((source) => [source.id, sourceSearchText(source)]));

    const findings: Finding[] = [];
    for (const block of script.blocks) {
      findings.push(...checkBlockNumbers({ blockId: block.id, voiceover: block.voiceover, sources: texts }));
      findings.push(...(await reviewClaims(input, block, sources)));
    }

    const verification: Verification = { findings, acceptances: previous.acceptances };
    await input.store.saveVerification(input.slug, verification);
    await input.store.recordRun(input.slug, { step: "ai-review", status: "done", startedAt });
    return verification;
  } catch (error) {
    await input.store.recordRun(input.slug, { step: "ai-review", status: "failed", startedAt });
    throw error;
  }
}

export async function generateStyleProfile(
  connector: Connector,
  scripts: string[],
  timeoutMs: number,
  signal: AbortSignal,
): Promise<string> {
  return (await connector.generate({ ...styleProfilePrompt(scripts), timeoutMs }, signal)).trim();
}
