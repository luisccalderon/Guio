import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runProcess } from "../../src/core/connectors/runProcess";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "guio-run-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function run(source: string, stdin: string, timeoutMs: number, signal = new AbortController().signal) {
  const script = join(dir, "s.mjs");
  await writeFile(script, source);
  return runProcess({ command: process.execPath, args: [script], stdin, cwd: dir, timeoutMs, signal });
}

const SLEEP = "setTimeout(() => {}, 30000);";

describe("runProcess", () => {
  it("passes stdin and captures stdout and the exit code", async () => {
    const result = await run(
      `let t = ""; for await (const c of process.stdin) t += c; console.log(t.toUpperCase()); process.exitCode = 3;`,
      "héllo",
      10_000,
    );
    expect(result.stdout.trim()).toBe("HÉLLO");
    expect(result.code).toBe(3);
  });

  it("rejects with timeout", async () => {
    await expect(run(SLEEP, "", 200)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("rejects with cancelled when aborted", async () => {
    const controller = new AbortController();
    const pending = run(SLEEP, "", 10_000, controller.signal);
    setTimeout(() => controller.abort(), 200);
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("does not start when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(SLEEP, "", 10_000, controller.signal)).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("reports a missing executable as not-found", async () => {
    await expect(
      runProcess({
        command: join(dir, "missing.exe"),
        args: [],
        stdin: "",
        cwd: dir,
        timeoutMs: 5000,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ kind: "not-found" });
  });
});
