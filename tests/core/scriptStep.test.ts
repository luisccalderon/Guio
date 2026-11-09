import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConnectorError, type Connector } from "../../src/core/connectors/types";
import type { Script, Source, Template } from "../../src/core/domain/schemas";
import { draftScript, rewriteBlock, type GenerationContext } from "../../src/core/pipeline/script";
import { ProjectStore } from "../../src/core/store/projectStore";
import { fakeConnector, noSignal } from "../helpers/fakeConnector";

const template: Template = {
  id: "t",
  name: "T",
  blocks: [
    { id: "opening", title: "Opening", guidance: "Open it" },
    { id: "body", title: "Body", guidance: "Explain it" },
  ],
};

const source: Source = {
  kind: "web",
  id: "F1",
  url: null,
  title: "S",
  accessedAt: "2026-11-09T10:00:00.000Z",
  text: "FULL ARTICLE BODY",
  summary: "",
  keyPoints: [{ id: "F1-k1", text: "Fact", quote: "THE QUOTE", quoteStatus: "verified", selected: true }],
  discarded: false,
};

let root: string;
let store: ProjectStore;
let slug: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "guio-script-"));
  store = new ProjectStore(root);
  ({ slug } = await store.create({ title: "V", templateId: "t", language: "es", targetSeconds: 600 }));
  await store.saveSource(slug, source);
  await store.saveSkeleton(slug, {
    blocks: [
      { id: "opening", title: "Opening", points: [{ id: "pt-1", text: "Fact", keyPointId: "F1-k1", sourceIds: ["F1"] }] },
      { id: "body", title: "Body", points: [{ id: "pt-2", text: "Own", keyPointId: null, sourceIds: [] }] },
    ],
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function reply(voiceover: string): string {
  return JSON.stringify({ voiceover, onScreen: "Screen" });
}

function context(draft: Connector, overrides: Partial<GenerationContext> = {}): GenerationContext {
  return {
    store,
    slug,
    template,
    styleProfile: null,
    connectors: { draft, rewrite: draft, humanize: draft },
    humanize: { enabled: false, rules: "RULES" },
    timeoutMs: 1000,
    signal: noSignal,
    now: () => "2026-11-09T12:00:00.000Z",
    ...overrides,
  };
}

async function markEdited(blockId: string): Promise<void> {
  const script = await store.getScript(slug);
  const updated: Script = {
    blocks: script.blocks.map((block) =>
      block.id === blockId ? { ...block, voiceover: "Mine", origin: "edited" } : block,
    ),
  };
  await store.saveScript(slug, updated);
}

describe("draftScript", () => {
  it("writes one block per skeleton block with humanize off", async () => {
    const script = await draftScript(context(fakeConnector([reply("Uno [F1]."), reply("Dos.")])));
    expect(script.blocks.map((block) => [block.id, block.voiceover, block.humanizeStatus])).toEqual([
      ["b-opening", "Uno [F1].", "off"],
      ["b-body", "Dos.", "off"],
    ]);
    expect(await store.getScript(slug)).toEqual(script);
    expect(script.blocks[0]?.pointRefs).toHaveLength(1);
  });

  it("sends only approved points with their quotes, and the previous block", async () => {
    const connector = fakeConnector([reply("Uno [F1]."), reply("Dos.")]);
    await draftScript(context(connector));
    expect(connector.requests[0]!.prompt).toContain("THE QUOTE");
    expect(connector.requests[0]!.prompt).not.toContain("FULL ARTICLE BODY");
    expect(connector.requests[1]!.prompt).toContain("Uno [F1].");
    expect(connector.requests[0]!.prompt).toContain("Script language: es.");
  });

  it("records the run as done", async () => {
    await draftScript(context(fakeConnector([reply("A."), reply("B.")])));
    expect((await store.getRuns(slug)).runs[0]).toMatchObject({ step: "draft", status: "done" });
  });

  it("records a failed run and keeps finished blocks", async () => {
    const connector = fakeConnector([reply("A."), new ConnectorError("failed", "down")]);
    await expect(draftScript(context(connector))).rejects.toThrow("down");
    expect((await store.getRuns(slug)).runs[0]?.status).toBe("failed");
    expect((await store.getScript(slug)).blocks.map((block) => block.id)).toEqual(["b-opening"]);
  });

  it("does not overwrite a manually edited block", async () => {
    await draftScript(context(fakeConnector([reply("A."), reply("B.")])));
    await markEdited("b-opening");
    const script = await draftScript(context(fakeConnector([reply("New.")])));
    expect(script.blocks[0]?.voiceover).toBe("Mine");
    expect(script.blocks[1]?.voiceover).toBe("New.");
  });

  it("stores the replaced version in history", async () => {
    await draftScript(context(fakeConnector([reply("A."), reply("B.")])));
    await draftScript(context(fakeConnector([reply("A2."), reply("B2.")])));
    expect((await store.getHistory(slug, "b-opening")).versions.map((item) => item.voiceover)).toEqual(["A."]);
  });

  it("never calls the humanize connector while disabled", async () => {
    const humanize = fakeConnector(["never"]);
    const draft = fakeConnector([reply("A."), reply("B.")]);
    await draftScript(context(draft, { connectors: { draft, rewrite: draft, humanize } }));
    expect(humanize.requests).toHaveLength(0);
  });

  it("humanizes when enabled and keeps the prior text in history", async () => {
    const humanize = fakeConnector(["Humano."]);
    const draft = fakeConnector([reply("Robot.")]);
    const script = await draftScript(
      context(draft, {
        connectors: { draft, rewrite: draft, humanize },
        humanize: { enabled: true, rules: "RULES" },
      }),
    );
    expect(script.blocks[0]).toMatchObject({ voiceover: "Humano.", humanizeStatus: "done" });
    expect((await store.getHistory(slug, "b-opening")).versions[0]).toMatchObject({ voiceover: "Robot.", reason: "draft" });
    expect(humanize.requests[1]!.prompt).toContain("Humano.");
  });

  it("shows a failed status when humanize cannot keep the marks", async () => {
    const humanize = fakeConnector(["Sin marcas."]);
    const draft = fakeConnector([reply("Dato [F1]."), reply("Otro.")]);
    const script = await draftScript(
      context(draft, {
        connectors: { draft, rewrite: draft, humanize },
        humanize: { enabled: true, rules: "RULES" },
      }),
    );
    expect(script.blocks[0]).toMatchObject({ voiceover: "Dato [F1].", humanizeStatus: "failed" });
  });
});

describe("rewriteBlock", () => {
  beforeEach(async () => {
    await draftScript(context(fakeConnector([reply("A [F1]."), reply("B.")])));
  });

  it("changes one block, sends the instruction, and leaves the rest", async () => {
    const connector = fakeConnector([reply("Corto [F1].")]);
    const block = await rewriteBlock(context(connector), "b-opening", "Más corto", { confirmOverwrite: false });
    expect(block.voiceover).toBe("Corto [F1].");
    expect(connector.requests[0]!.prompt).toContain("Más corto");
    expect(connector.requests[0]!.prompt).toContain("A [F1].");
    expect((await store.getScript(slug)).blocks[1]?.voiceover).toBe("B.");
  });

  it("stores the previous version", async () => {
    await rewriteBlock(context(fakeConnector([reply("Corto.")])), "b-opening", "x", { confirmOverwrite: false });
    expect((await store.getHistory(slug, "b-opening")).versions.at(-1)?.voiceover).toBe("A [F1].");
  });

  it("refuses to replace a manual edit without confirmation", async () => {
    await markEdited("b-opening");
    const connector = fakeConnector([reply("X.")]);
    await expect(rewriteBlock(context(connector), "b-opening", "x", { confirmOverwrite: false })).rejects.toThrow(/manually edited/);
    expect(connector.requests).toHaveLength(0);
  });

  it("replaces a manual edit once confirmed", async () => {
    await markEdited("b-opening");
    const block = await rewriteBlock(context(fakeConnector([reply("X.")])), "b-opening", "x", { confirmOverwrite: true });
    expect(block).toMatchObject({ voiceover: "X.", origin: "generated" });
  });

  it("rejects an unknown block", async () => {
    await expect(rewriteBlock(context(fakeConnector([reply("X.")])), "nope", "x", { confirmOverwrite: false })).rejects.toThrow(/nope/);
  });
});
