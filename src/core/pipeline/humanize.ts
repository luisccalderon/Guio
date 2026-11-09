import { ConnectorError, type Connector } from "../connectors/types";
import { compareProtectedTokens, type GuardResult } from "../humanize/guard";
import { humanizePrompt } from "./prompts";

export interface HumanizeInput {
  voiceover: string;
  previousVoiceover: string | null;
  language: string;
  styleProfile: string | null;
  rules: string;
  connector: Connector;
  timeoutMs: number;
}

export interface HumanizeResult {
  voiceover: string;
  status: "done" | "failed";
}

function describeDifference(guard: GuardResult): string {
  return [
    `Missing reference marks: ${guard.missingMarks.join(", ") || "none"}.`,
    `Added reference marks: ${guard.addedMarks.join(", ") || "none"}.`,
    `Missing numbers: ${guard.missingNumbers.join(", ") || "none"}.`,
    `Added numbers: ${guard.addedNumbers.join(", ") || "none"}.`,
  ].join(" ");
}

export async function humanizeVoiceover(input: HumanizeInput, signal: AbortSignal): Promise<HumanizeResult> {
  let correction: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let candidate: string;
    try {
      const parts = humanizePrompt({ ...input, correction });
      candidate = (await input.connector.generate({ ...parts, timeoutMs: input.timeoutMs }, signal)).trim();
    } catch (error) {
      if (error instanceof ConnectorError && error.kind === "cancelled") {
        throw error;
      }
      return { voiceover: input.voiceover, status: "failed" };
    }

    const guard = compareProtectedTokens(input.voiceover, candidate);
    if (guard.ok && candidate !== "") {
      return { voiceover: candidate, status: "done" };
    }
    correction = describeDifference(guard);
  }

  return { voiceover: input.voiceover, status: "failed" };
}
