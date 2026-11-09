import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Source } from "../../src/core/domain/schemas";
import { ProjectStore } from "../../src/core/store/projectStore";

let root: string;
let store: ProjectStore;

const input = { title: "Prueba: Modelo Ñu", templateId: "model-test", language: "es", targetSeconds: 600 };

function web(id: string): Source {
  return {
    kind: "web",
    id,
    url: null,
    title: id,
    accessedAt: "2026-11-09T10:00:00.000Z",
    text: "text",
    summary: "",
    keyPoints: [],
    discarded: false,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "guio-store-"));
  store = new ProjectStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ProjectStore projects", () => {
  it("creates a project with a clean slug", async () => {
    const meta = await store.create(input);
    expect(meta.slug).toBe("prueba-modelo-nu");
    expect(await store.getMeta(meta.slug)).toEqual(meta);
  });

  it("keeps slugs unique", async () => {
    await store.create(input);
    expect((await store.create(input)).slug).toBe("prueba-modelo-nu-2");
  });

  it("falls back to a default slug", async () => {
    expect((await store.create({ ...input, title: "!!!" })).slug).toBe("video");
  });

  it("lists created projects and ignores unrelated folders", async () => {
    const meta = await store.create(input);
    await writeFile(join(root, "note.txt"), "x");
    expect(await store.list()).toEqual([meta]);
  });

  it("rejects a slug that escapes the root", async () => {
    await expect(store.getMeta("../outside")).rejects.toThrow();
  });
});

describe("ProjectStore documents", () => {
  it("returns empty documents for a new project", async () => {
    const { slug } = await store.create(input);
    expect(await store.getSkeleton(slug)).toEqual({ blocks: [] });
    expect(await store.getScript(slug)).toEqual({ blocks: [] });
    expect(await store.getVerification(slug)).toEqual({ findings: [], acceptances: [] });
    expect(await store.getRuns(slug)).toEqual({ runs: [] });
    expect(await store.getHistory(slug, "b1")).toEqual({ versions: [] });
  });

  it("orders sources with web first and numerically", async () => {
    const { slug } = await store.create(input);
    await store.saveSource(slug, web("F10"));
    await store.saveSource(slug, web("F2"));
    await store.saveSource(slug, {
      kind: "test",
      id: "P1",
      title: "t",
      hardware: "",
      modelVersion: "",
      quantization: "",
      settings: "",
      results: "",
      notes: "",
      summary: "",
      keyPoints: [],
      discarded: false,
    });
    expect((await store.listSources(slug)).map((source) => source.id)).toEqual(["F2", "F10", "P1"]);
  });

  it("refuses invalid data without touching the saved file", async () => {
    const { slug } = await store.create(input);
    await store.saveSkeleton(slug, { blocks: [] });
    const before = await readFile(join(root, slug, "skeleton.json"), "utf8");
    await expect(
      store.saveSkeleton(slug, { blocks: [{ id: "../x", title: "", points: [] }] }),
    ).rejects.toThrow();
    expect(await readFile(join(root, slug, "skeleton.json"), "utf8")).toBe(before);
  });

  it("appends block history in order", async () => {
    const { slug } = await store.create(input);
    const version = { savedAt: "2026-11-09T10:00:00.000Z", voiceover: "a", onScreen: "", reason: "draft" as const };
    await store.appendHistory(slug, "b1", version);
    await store.appendHistory(slug, "b1", { ...version, voiceover: "b", reason: "rewrite" });
    expect((await store.getHistory(slug, "b1")).versions.map((v) => v.voiceover)).toEqual(["a", "b"]);
  });

  it("rejects a block id that escapes the history folder", async () => {
    const { slug } = await store.create(input);
    await expect(store.getHistory(slug, "../../x")).rejects.toThrow();
  });
});

describe("ProjectStore runs", () => {
  it("replaces the run of the same step", async () => {
    const { slug } = await store.create(input);
    await store.recordRun(slug, { step: "draft", status: "running", startedAt: "a" });
    await store.recordRun(slug, { step: "draft", status: "done", startedAt: "a" });
    expect((await store.getRuns(slug)).runs).toEqual([{ step: "draft", status: "done", startedAt: "a" }]);
  });

  it("marks running steps as interrupted", async () => {
    const { slug } = await store.create(input);
    await store.recordRun(slug, { step: "draft", status: "running", startedAt: "a" });
    await store.recordRun(slug, { step: "cards", status: "done", startedAt: "b" });
    await store.markRunningAsInterrupted(slug);
    const { runs } = await store.getRuns(slug);
    expect(runs.find((run) => run.step === "draft")?.status).toBe("interrupted");
    expect(runs.find((run) => run.step === "cards")?.status).toBe("done");
  });
});
