import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAnthropicConnector,
  createOllamaConnector,
  createOpenAiCompatibleConnector,
} from "../../src/core/connectors/httpConnectors";

const signal = new AbortController().signal;
const request = { system: "SYS", prompt: "PROMPT", timeoutMs: 5000 };

let server: Server | undefined;
let received: { url: string; headers: Record<string, unknown>; body: any };

async function serve(status: number, reply: unknown, delayMs = 0): Promise<string> {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = { url: req.url ?? "", headers: req.headers, body: JSON.parse(body) };
      setTimeout(() => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(reply));
      }, delayMs);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

describe("Ollama connector", () => {
  it("calls the chat API without streaming", async () => {
    const baseUrl = await serve(200, { message: { content: "hola" } });
    const reply = await createOllamaConnector({ baseUrl, model: "m1" }).generate(request, signal);
    expect(reply).toBe("hola");
    expect(received.url).toBe("/api/chat");
    expect(received.body).toEqual({
      model: "m1",
      stream: false,
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "PROMPT" },
      ],
    });
  });
});

describe("OpenAI-compatible connector", () => {
  it("sends the bearer key and reads the first choice", async () => {
    const baseUrl = await serve(200, { choices: [{ message: { content: "ok" } }] });
    const connector = createOpenAiCompatibleConnector({ baseUrl, model: "m", apiKey: "k1" });
    expect(await connector.generate(request, signal)).toBe("ok");
    expect(received.url).toBe("/chat/completions");
    expect(received.headers.authorization).toBe("Bearer k1");
  });

  it("works without a key for local servers", async () => {
    const baseUrl = await serve(200, { choices: [{ message: { content: "ok" } }] });
    await createOpenAiCompatibleConnector({ baseUrl, model: "m" }).generate(request, signal);
    expect(received.headers.authorization).toBeUndefined();
  });

  it("reports an HTTP error with its status", async () => {
    const baseUrl = await serve(401, { error: "bad key" });
    await expect(
      createOpenAiCompatibleConnector({ baseUrl, model: "m" }).generate(request, signal),
    ).rejects.toMatchObject({ kind: "failed", message: expect.stringContaining("401") });
  });

  it("reports an unexpected body as failed", async () => {
    const baseUrl = await serve(200, { nope: true });
    await expect(
      createOpenAiCompatibleConnector({ baseUrl, model: "m" }).generate(request, signal),
    ).rejects.toMatchObject({ kind: "failed" });
  });

  it("times out", async () => {
    const baseUrl = await serve(200, {}, 2000);
    await expect(
      createOpenAiCompatibleConnector({ baseUrl, model: "m" }).generate({ ...request, timeoutMs: 100 }, signal),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("cancels", async () => {
    const baseUrl = await serve(200, {}, 2000);
    const controller = new AbortController();
    const pending = createOpenAiCompatibleConnector({ baseUrl, model: "m" }).generate(request, controller.signal);
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
  });
});

describe("Anthropic connector", () => {
  it("uses the Messages API and joins text blocks", async () => {
    const baseUrl = await serve(200, {
      content: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
    });
    const connector = createAnthropicConnector({ baseUrl, model: "claude-sonnet-5-5", apiKey: "k2" });
    expect(await connector.generate(request, signal)).toBe("ab");
    expect(received.url).toBe("/v1/messages");
    expect(received.headers["x-api-key"]).toBe("k2");
    expect(received.headers["anthropic-version"]).toBe("2023-06-01");
    expect(received.body.system).toBe("SYS");
    expect(received.body.messages).toEqual([{ role: "user", content: "PROMPT" }]);
    expect(received.body.max_tokens).toBeGreaterThan(0);
  });
});
