import type { z } from "zod";
import type { Connector, GenerateRequest } from "../connectors/types";

export class InvalidOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "InvalidOutputError";
  }
}

export function parseModelJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The reply contains no JSON object.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function runStructured<S extends z.ZodType>(
  connector: Connector,
  request: GenerateRequest,
  schema: S,
  signal: AbortSignal,
): Promise<z.infer<S>> {
  let prompt = request.prompt;
  let lastMessage = "";
  let lastRaw = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    lastRaw = await connector.generate({ ...request, prompt }, signal);
    try {
      return schema.parse(parseModelJson(lastRaw));
    } catch (error) {
      lastMessage = (error as Error).message;
      prompt = `${request.prompt}\n\nYour previous reply was invalid: ${lastMessage}\nReply again with only valid JSON.`;
    }
  }
  throw new InvalidOutputError(`The model returned invalid output: ${lastMessage}`, lastRaw);
}

function hardSplit(paragraph: string, maxChars: number): string[] {
  const pieces: string[] = [];
  for (let index = 0; index < paragraph.length; index += maxChars) {
    pieces.push(paragraph.slice(index, index + maxChars));
  }
  return pieces;
}

export function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n\s*\n/).flatMap((part) => hardSplit(part, maxChars))) {
    const joined = current === "" ? paragraph : `${current}\n\n${paragraph}`;
    if (joined.length <= maxChars) {
      current = joined;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current !== "") {
    chunks.push(current);
  }
  return chunks;
}
