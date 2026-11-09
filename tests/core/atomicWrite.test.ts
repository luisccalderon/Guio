import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../../src/core/store/atomicWrite";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "guio-atomic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("creates parent folders and writes the content", async () => {
    const target = join(dir, "a", "b.json");
    await writeFileAtomic(target, "hello");
    expect(await readFile(target, "utf8")).toBe("hello");
  });

  it("replaces existing content and leaves no temporary file", async () => {
    const target = join(dir, "b.json");
    await writeFileAtomic(target, "one");
    await writeFileAtomic(target, "two");
    expect(await readFile(target, "utf8")).toBe("two");
    expect(await readdir(dir)).toEqual(["b.json"]);
  });

  it("removes the temporary file when the rename fails", async () => {
    const target = join(dir, "occupied");
    await mkdir(target);
    await expect(writeFileAtomic(target, "x")).rejects.toThrow();
    expect(await readdir(dir)).toEqual(["occupied"]);
  });
});
