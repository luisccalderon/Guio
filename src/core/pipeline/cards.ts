import { z } from "zod";
import type { Connector } from "../connectors/types";
import type { KeyPoint, Source } from "../domain/schemas";
import { sourceSearchText } from "../domain/sourceText";
import { quoteExistsIn } from "../verify/quote";
import { cardPrompt } from "./prompts";
import { chunkText, runStructured } from "./structured";

const MAX_CHUNK_CHARS = 12_000;

const CardReply = z.object({
  summary: z.string(),
  keyPoints: z.array(z.object({ text: z.string(), quote: z.string() })),
});

export async function generateCard(
  source: Source,
  connector: Connector,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Source> {
  const text = sourceSearchText(source);
  const summaries: string[] = [];
  const keyPoints: KeyPoint[] = [];

  for (const chunk of chunkText(text, MAX_CHUNK_CHARS)) {
    const reply = await runStructured(
      connector,
      { ...cardPrompt(source.id, chunk), timeoutMs },
      CardReply,
      signal,
    );
    summaries.push(reply.summary);
    for (const point of reply.keyPoints) {
      const verified = quoteExistsIn(point.quote, text);
      keyPoints.push({
        id: `${source.id}-k${keyPoints.length + 1}`,
        text: point.text,
        quote: point.quote,
        quoteStatus: verified ? "verified" : "unverified",
        selected: verified,
      });
    }
  }

  return { ...source, summary: summaries.join(" "), keyPoints };
}
