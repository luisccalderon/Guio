import type { Finding } from "../domain/schemas";
import { extractMarks } from "./marks";
import { extractNumbers, numbersMatch } from "./numbers";

export interface BlockNumberInput {
  blockId: string;
  voiceover: string;
  sources: Readonly<Record<string, string>>;
}

export function checkBlockNumbers(input: BlockNumberInput): Finding[] {
  const cited = extractMarks(input.voiceover);
  const available = cited.flatMap((id) => extractNumbers(input.sources[id] ?? ""));

  return extractNumbers(input.voiceover)
    .filter((token) => !available.some((candidate) => numbersMatch(token, candidate)))
    .map((token) => ({
      id: `${input.blockId}:number:${token.raw}`,
      blockId: input.blockId,
      kind: "number" as const,
      token: token.raw,
      reason: cited.length === 0 ? ("no-citation" as const) : ("not-in-source" as const),
    }));
}
