import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createClaudeConnector,
  createCustomCliConnector,
  createOpenCodeConnector,
  parseOpenCodeEvents,
} from "../../src/core/connectors/cliConnectors";

let dir: string;
const signal = new AbortController().signal;
const request = { system: "SYSTEM TEXT", prompt: "PROMPT TEXT", timeoutMs: 15_000 };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "guio-cli-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function fake(source: string) {
  const script = join(dir, "fake.mjs");
  await writeFile(script, source);
  return { command: process.execPath, prefixArgs: [script] };
}

const REPORT = `
import { readFileSync, readdirSync } from "node:fs";
let stdin = ""; for await (const c of process.stdin) stdin += c;
const argv = process.argv.slice(2);
const index = argv.indexOf("--system-prompt-file");
console.log(JSON.stringify({
  argv, stdin, cwd: process.cwd(), files: readdirSync(process.cwd()),
  system: index >= 0 ? readFileSync(argv[index + 1], "utf8") : null,
}));
`;

describe("Claude connector", () => {
  it("disables tools, pipes the prompt, and sends the system text as a file", async () => {
    const connector = createClaudeConnector({ ...(await fake(REPORT)), model: "sonnet" });
    const seen = JSON.parse(await connector.generate(request, signal));
    expect(seen.stdin).toBe("PROMPT TEXT");
    expect(seen.system).toBe("SYSTEM TEXT");
    expect(seen.argv).toEqual(expect.arrayContaining(["-p", "--strict-mcp-config", "--no-session-persistence"]));
    expect(seen.argv[seen.argv.indexOf("--tools") + 1]).toBe("");
    expect(seen.argv[seen.argv.indexOf("--disallowedTools") + 1]).toBe("mcp__*");
    expect(seen.argv[seen.argv.indexOf("--model") + 1]).toBe("sonnet");
    expect(connector.restricted).toBe(true);
  });

  it("runs in a temporary folder that is removed afterwards", async () => {
    const connector = createClaudeConnector(await fake(REPORT));
    const seen = JSON.parse(await connector.generate(request, signal));
    expect(seen.cwd).not.toBe(process.cwd());
    expect(existsSync(seen.cwd)).toBe(false);
  });

  it("reports a non-zero exit with its stderr", async () => {
    const connector = createClaudeConnector(await fake(`console.error("not logged in"); process.exit(1);`));
    await expect(connector.generate(request, signal)).rejects.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("not logged in"),
    });
  });

  it("rejects an unsafe model name", async () => {
    const connector = createClaudeConnector({ ...(await fake(REPORT)), model: "x; rm -rf" });
    await expect(connector.generate(request, signal)).rejects.toMatchObject({ kind: "failed" });
  });

  it("reports a missing CLI as not-found", async () => {
    const connector = createClaudeConnector({ command: "guio-no-such-cli" });
    await expect(connector.generate(request, signal)).rejects.toMatchObject({ kind: "not-found" });
  });
});

describe("OpenCode connector", () => {
  it("writes a deny-all agent and attaches the prompt as a file", async () => {
    const connector = createOpenCodeConnector({
      ...(await fake(`
        import { readFileSync } from "node:fs";
        const agent = readFileSync(".opencode/agents/guio-writer.md", "utf8");
        const prompt = readFileSync("prompt.txt", "utf8");
        const text = JSON.stringify({ argv: process.argv.slice(2), agent, prompt });
        console.log(JSON.stringify({ type: "text", part: { type: "text", text } }));
      `)),
      model: "provider/model",
    });
    const seen = JSON.parse(await connector.generate(request, signal));
    expect(seen.prompt).toBe("PROMPT TEXT");
    expect(seen.agent).toContain('action: "*"');
    expect(seen.agent).toContain("effect: deny");
    expect(seen.agent).toContain("SYSTEM TEXT");
    expect(seen.argv).toEqual(
      expect.arrayContaining(["run", "--standalone", "--agent", "guio-writer", "--format", "json", "--file", "prompt.txt"]),
    );
    expect(seen.argv).not.toContain("--auto");
    expect(seen.argv[seen.argv.indexOf("--model") + 1]).toBe("provider/model");
  });

  it("surfaces the provider error message", async () => {
    const connector = createOpenCodeConnector(
      await fake(`console.log(JSON.stringify({ type: "error", error: { message: "Free usage limit reached" } })); process.exit(1);`),
    );
    await expect(connector.generate(request, signal)).rejects.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("Free usage limit reached"),
    });
  });
});

describe("parseOpenCodeEvents", () => {
  it("joins text events and ignores other lines", () => {
    const output = [
      `{"type":"step_start","part":{}}`,
      "not json",
      `{"type":"text","part":{"type":"text","text":"Hola "}}`,
      `{"type":"text","part":{"type":"text","text":"mundo"}}`,
    ].join("\n");
    expect(parseOpenCodeEvents(output)).toEqual({ text: "Hola mundo", error: null });
  });
});

describe("custom CLI connector", () => {
  it("is marked unrestricted and sends system and prompt through stdin", async () => {
    const connector = createCustomCliConnector(await fake(REPORT));
    const seen = JSON.parse(await connector.generate(request, signal));
    expect(connector.restricted).toBe(false);
    expect(seen.stdin).toBe("SYSTEM TEXT\n\nPROMPT TEXT");
  });
});
