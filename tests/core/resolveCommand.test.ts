import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInvocation, resolveCommand } from "../../src/core/connectors/resolveCommand";
import { connectorWithTest, ConnectorError } from "../../src/core/connectors/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "guio-resolve-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolveCommand", () => {
  it("finds a command through PATHEXT on Windows", async () => {
    await writeFile(join(dir, "tool.cmd"), "");
    expect(resolveCommand("tool", { PATH: dir, PATHEXT: ".EXE;.CMD" }, "win32")).toBe(join(dir, "tool.cmd"));
  });

  it("prefers the earlier PATHEXT entry", async () => {
    await writeFile(join(dir, "tool.cmd"), "");
    await writeFile(join(dir, "tool.exe"), "");
    expect(resolveCommand("tool", { PATH: dir, PATHEXT: ".EXE;.CMD" }, "win32")).toBe(join(dir, "tool.exe"));
  });

  it("searches every PATH entry", async () => {
    await writeFile(join(dir, "tool"), "");
    const path = ["missing-folder", dir].join(delimiter);
    expect(resolveCommand("tool", { PATH: path }, "linux")).toBe(join(dir, "tool"));
  });

  it("returns null when nothing matches", () => {
    expect(resolveCommand("nope", { PATH: dir, PATHEXT: ".EXE" }, "win32")).toBeNull();
  });
});

describe("buildInvocation", () => {
  it("runs executables directly", () => {
    expect(buildInvocation("C:\\a\\t.exe", ["--x", ""])).toEqual({
      command: "C:\\a\\t.exe",
      args: ["--x", ""],
      verbatim: false,
    });
  });

  it("wraps cmd files and quotes every argument", () => {
    const result = buildInvocation("C:\\a b\\t.cmd", ["run", "x&y"], "cmd.exe");
    expect(result.command).toBe("cmd.exe");
    expect(result.args).toEqual(["/d", "/s", "/c", `""C:\\a b\\t.cmd" "run" "x&y""`]);
    expect(result.verbatim).toBe(true);
  });

  it("refuses characters a cmd file could expand", () => {
    expect(() => buildInvocation("t.cmd", ["%PATH%"])).toThrow(ConnectorError);
  });
});

describe("connectorWithTest", () => {
  it("reports success when the model answers", async () => {
    const connector = connectorWithTest("x", true, async () => "OK");
    expect((await connector.testConnection()).ok).toBe(true);
  });

  it("reports the error message on failure", async () => {
    const connector = connectorWithTest("x", true, async () => {
      throw new ConnectorError("not-found", "CLI missing");
    });
    expect(await connector.testConnection()).toEqual({ ok: false, message: "CLI missing" });
  });
});
