import { z } from "zod";
import { connectorWithTest, ConnectorError, type Connector, type GenerateRequest } from "./types";

export interface HttpOptions {
  baseUrl?: string;
  model: string;
  apiKey?: string;
}

const MAX_OUTPUT_TOKENS = 8192;

async function postJson<S extends z.ZodType>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  schema: S,
  request: GenerateRequest,
  signal: AbortSignal,
): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(request.timeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, timeout]),
    });
    text = await response.text();
  } catch (error) {
    if (signal.aborted) {
      throw new ConnectorError("cancelled", "The step was cancelled.");
    }
    if (timeout.aborted) {
      throw new ConnectorError("timeout", `No reply within ${request.timeoutMs} ms.`);
    }
    throw new ConnectorError("failed", `Could not reach ${url}: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new ConnectorError("failed", `The server replied ${response.status}: ${text.slice(0, 500)}`);
  }
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new ConnectorError("failed", `Unexpected reply from the server: ${text.slice(0, 500)}`);
  }
}

function chatMessages(request: GenerateRequest) {
  return [
    { role: "system", content: request.system },
    { role: "user", content: request.prompt },
  ];
}

const OllamaReply = z.object({ message: z.object({ content: z.string() }) });

export function createOllamaConnector(options: HttpOptions): Connector {
  const baseUrl = options.baseUrl ?? "http://localhost:11434";
  return connectorWithTest("ollama", true, async (request, signal) => {
    const body = { model: options.model, stream: false, messages: chatMessages(request) };
    const reply = await postJson(`${baseUrl}/api/chat`, {}, body, OllamaReply, request, signal);
    return reply.message.content.trim();
  });
}

const OpenAiReply = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

export function createOpenAiCompatibleConnector(options: HttpOptions & { baseUrl: string }): Connector {
  const headers: Record<string, string> =
    options.apiKey === undefined ? {} : { authorization: `Bearer ${options.apiKey}` };
  return connectorWithTest("openai-compatible", true, async (request, signal) => {
    const body = { model: options.model, messages: chatMessages(request) };
    const reply = await postJson(`${options.baseUrl}/chat/completions`, headers, body, OpenAiReply, request, signal);
    return (reply.choices[0]?.message.content ?? "").trim();
  });
}

const AnthropicReply = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export function createAnthropicConnector(options: HttpOptions & { apiKey: string }): Connector {
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com";
  const headers = { "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" };
  return connectorWithTest("anthropic", true, async (request, signal) => {
    const body = {
      model: options.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
    };
    const reply = await postJson(`${baseUrl}/v1/messages`, headers, body, AnthropicReply, request, signal);
    return reply.content.map((block) => block.text ?? "").join("").trim();
  });
}
