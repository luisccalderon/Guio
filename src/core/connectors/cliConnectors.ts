import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCommand } from "./resolveCommand";
import { runProcess, type ProcessResult } from "./runProcess";
import { connectorWithTest, ConnectorError, type Connector, type GenerateRequest } from "./types";

export interface CliOptions {
  command?: string;
  prefixArgs?: string[];
  model?: string;
}

interface Launch {
  args: string[];
  stdin: string;
}

function resolved(command: string): string {
  const path = resolveCommand(command);
  if (path === null) {
    throw new ConnectorError("not-found", `"${command}" was not found. Install it or check your PATH.`);
  }
  return path;
}

function modelArgs(model: string | undefined): string[] {
  if (model === undefined) {
    return [];
  }
  if (!/^[\w./:#@-]+$/.test(model)) {
    throw new ConnectorError("failed", `Invalid model name: ${model}`);
  }
  return ["--model", model];
}

function failure(result: ProcessResult): ConnectorError {
  const detail = (result.stderr.trim() || result.stdout.trim()).slice(-500);
  return new ConnectorError("failed", `The CLI exited with code ${result.code}: ${detail}`);
}

async function inScratch<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "guio-run-"));
  try {
    return await work(dir);
  } finally {
    // Cleanup is best effort: a locked temporary folder must not fail a finished generation.
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
  }
}

async function execute(
  options: CliOptions,
  defaultCommand: string,
  dir: string,
  launch: Launch,
  request: GenerateRequest,
  signal: AbortSignal,
): Promise<ProcessResult> {
  return runProcess({
    command: resolved(options.command ?? defaultCommand),
    args: [...(options.prefixArgs ?? []), ...launch.args],
    stdin: launch.stdin,
    cwd: dir,
    timeoutMs: request.timeoutMs,
    signal,
  });
}

export function createClaudeConnector(options: CliOptions = {}): Connector {
  return connectorWithTest("claude-cli", true, (request, signal) =>
    inScratch(async (dir) => {
      const systemFile = join(dir, "system.txt");
      await writeFile(systemFile, request.system, "utf8");
      const args = [
        "-p",
        "--tools",
        "",
        "--disallowedTools",
        "mcp__*",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--setting-sources",
        "project",
        "--output-format",
        "text",
        "--system-prompt-file",
        systemFile,
        ...modelArgs(options.model),
      ];
      const result = await execute(options, "claude", dir, { args, stdin: request.prompt }, request, signal);
      if (result.code !== 0) {
        throw failure(result);
      }
      return result.stdout.trim();
    }),
  );
}

export function parseOpenCodeEvents(output: string): { text: string; error: string | null } {
  let text = "";
  let error: string | null = null;
  for (const line of output.split(/\r?\n/)) {
    let event: { type?: string; part?: { text?: string }; error?: { message?: string } };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "text" && typeof event.part?.text === "string") {
      text += event.part.text;
    } else if (event.type === "error") {
      error = event.error?.message ?? "OpenCode reported an unknown error.";
    }
  }
  return { text, error };
}

function denyAllAgent(system: string): string {
  return [
    "---",
    "description: Text generation only",
    "mode: primary",
    "permissions:",
    '  - action: "*"',
    '    resource: "*"',
    "    effect: deny",
    "---",
    "",
    system,
    "",
  ].join("\n");
}

export function createOpenCodeConnector(options: CliOptions = {}): Connector {
  return connectorWithTest("opencode-cli", true, (request, signal) =>
    inScratch(async (dir) => {
      const agents = join(dir, ".opencode", "agents");
      await mkdir(agents, { recursive: true });
      await writeFile(join(agents, "guio-writer.md"), denyAllAgent(request.system), "utf8");
      await writeFile(join(dir, "prompt.txt"), request.prompt, "utf8");
      const args = [
        "run",
        "--standalone",
        "--agent",
        "guio-writer",
        "--archived",
        "--format",
        "json",
        ...modelArgs(options.model),
        "--file",
        "prompt.txt",
        "--",
        "Follow the request in the attached file.",
      ];
      const result = await execute(options, "opencode", dir, { args, stdin: "" }, request, signal);
      const { text, error } = parseOpenCodeEvents(result.stdout);
      if (error !== null) {
        throw new ConnectorError("failed", error);
      }
      if (result.code !== 0) {
        throw failure(result);
      }
      return text.trim();
    }),
  );
}

export function createCustomCliConnector(options: CliOptions & { command: string }): Connector {
  return connectorWithTest("custom-cli", false, (request, signal) =>
    inScratch(async (dir) => {
      const stdin = `${request.system}\n\n${request.prompt}`;
      const launch = { args: modelArgs(options.model), stdin };
      const result = await execute(options, options.command, dir, launch, request, signal);
      if (result.code !== 0) {
        throw failure(result);
      }
      return result.stdout.trim();
    }),
  );
}
