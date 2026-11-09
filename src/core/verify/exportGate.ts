import type { Acceptance, Finding, ScriptBlock } from "../domain/schemas";
import { hashText } from "../hash";
import { checkBlockNumbers } from "./numberCheck";

export interface ExportInput {
  blocks: Pick<ScriptBlock, "id" | "voiceover">[];
  sources: Readonly<Record<string, string>>;
  acceptances: Acceptance[];
}

export interface ExportDecision {
  allowed: boolean;
  blocking: Finding[];
}

export function evaluateExport(input: ExportInput): ExportDecision {
  const blocking = input.blocks.flatMap((block) => {
    const textHash = hashText(block.voiceover);
    return checkBlockNumbers({
      blockId: block.id,
      voiceover: block.voiceover,
      sources: input.sources,
    }).filter(
      (finding) =>
        !input.acceptances.some(
          (acceptance) => acceptance.findingId === finding.id && acceptance.textHash === textHash,
        ),
    );
  });

  return { allowed: blocking.length === 0, blocking };
}
