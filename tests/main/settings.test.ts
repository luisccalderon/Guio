import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveHumanizeRules, SettingsStore } from "../../src/core/store/settingsStore";
import { connectorOf, ConnectorSettingsSchema } from "../../src/core/store/settingsSchema";
import { createConnector } from "../../src/main/service/connectorFactory";

const claudeDefaults = { kind: "claude-cli", model: "", baseUrl: "" };

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "guio-settings-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("settings", () => {
  it("defaults to Claude CLI with humanize off at 150 words per minute", async () => {
    const settings = await new SettingsStore(dir).get();
    expect(settings).toEqual({ humanizeEnabled: false, humanizeRules: null, wordsPerMinute: 150 });
    expect(connectorOf(settings)).toEqual(claudeDefaults);
  });

  it("still loads a settings file written before connectors existed", async () => {
    await writeFile(join(dir, "settings.json"), '{"humanizeEnabled":true,"wordsPerMinute":170}', "utf8");
    const settings = await new SettingsStore(dir).get();
    expect(settings).toEqual({ humanizeEnabled: true, humanizeRules: null, wordsPerMinute: 170 });
    expect(connectorOf(settings)).toEqual(claudeDefaults);
  });

  it("persists the chosen connector and model", async () => {
    const store = new SettingsStore(dir);
    const settings = await store.get();
    const connector = { kind: "opencode-cli" as const, model: "claude-agent/haiku", baseUrl: "" };
    await store.save({ ...settings, connector });
    expect((await new SettingsStore(dir).get()).connector).toEqual(connector);
  });

  it("drops a command override found in a settings file", async () => {
    await writeFile(
      join(dir, "settings.json"),
      '{"connector":{"kind":"claude-cli","model":"","baseUrl":"","command":"evil"}}',
      "utf8",
    );
    expect((await new SettingsStore(dir).get()).connector).toEqual(claudeDefaults);
  });

  it("rejects OpenCode without a model and leaves the stored file unchanged", async () => {
    const store = new SettingsStore(dir);
    await store.save(await store.get());
    const before = await readFile(join(dir, "settings.json"), "utf8");
    const settings = await store.get();
    await expect(
      store.save({ ...settings, connector: { kind: "opencode-cli", model: "  ", baseUrl: "" } }),
    ).rejects.toThrow("Choose a model for OpenCode.");
    expect(await readFile(join(dir, "settings.json"), "utf8")).toBe(before);
  });

  it("keeps resolving humanize rules from the bundled copy", async () => {
    expect(effectiveHumanizeRules(await new SettingsStore(dir).get(), "bundled")).toBe("bundled");
  });
});

describe("ConnectorSettingsSchema", () => {
  it.each([
    [{ kind: "ollama", model: "", baseUrl: "" }, "Choose a model for Ollama."],
    [{ kind: "openai-compatible", model: "", baseUrl: "http://localhost:1234/v1" }, "Choose a model for the server."],
    [{ kind: "openai-compatible", model: "m", baseUrl: "" }, "Enter the server's base URL."],
    [{ kind: "openai-compatible", model: "m", baseUrl: "ftp://x" }, "The base URL must start with http or https."],
    [{ kind: "ollama", model: "m", baseUrl: "not a url" }, "The base URL must start with http or https."],
  ])("rejects %j", (input, message) => {
    const result = ConnectorSettingsSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("accepts a Claude CLI with no model", () => {
    expect(ConnectorSettingsSchema.parse({ kind: "claude-cli" })).toEqual(claudeDefaults);
  });
});

describe("createConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [{ kind: "claude-cli", model: "", baseUrl: "" }, "claude-cli"],
    [{ kind: "opencode-cli", model: "x/y", baseUrl: "" }, "opencode-cli"],
    [{ kind: "ollama", model: "llama", baseUrl: "" }, "ollama"],
    [{ kind: "openai-compatible", model: "m", baseUrl: "http://s/v1" }, "openai-compatible"],
  ] as const)("builds a restricted connector for %j", (settings, id) => {
    const connector = createConnector(settings);
    expect(connector.id).toBe(id);
    expect(connector.restricted).toBe(true);
  });

  it("uses the Ollama default address when the base URL is blank", async () => {
    const fetchMock = vi.fn(async () => Response.json({ message: { content: "OK" } }));
    vi.stubGlobal("fetch", fetchMock);
    await createConnector({ kind: "ollama", model: "llama", baseUrl: "" }).testConnection();
    expect(fetchMock.mock.calls[0]?.at(0)).toBe("http://localhost:11434/api/chat");
  });

  it("sends the configured model to an OpenAI-compatible server without an API key", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ choices: [{ message: { content: "OK" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await createConnector({ kind: "openai-compatible", model: "m", baseUrl: "http://s/v1" }).testConnection();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://s/v1/chat/completions");
    expect(JSON.parse(String(init?.body)).model).toBe("m");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  });
});
