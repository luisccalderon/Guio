import { afterEach, describe, expect, it } from "vitest";
import { ConnectorError } from "../../src/core/connectors/types";
import type { PageLoader } from "../../src/core/extractor/extract";
import type { TestSource, WebSource } from "../../src/core/domain/schemas";
import { buildSnapshot } from "../../src/main/service/snapshot";
import {
  addLinks,
  addTest,
  editTest,
  generateCards,
  pasteSourceText,
  setKeyPointSelected,
  setSourceDiscarded,
} from "../../src/main/service/sourcesService";
import { articleHtml, createHarness, NOW, type Harness } from "./serviceHarness";

const FIELDS = {
  title: "Speed test",
  hardware: "RTX 4090",
  modelVersion: "v1",
  quantization: "Q4",
  settings: "default",
  results: "42 t/s",
  notes: "",
};

const CARD = JSON.stringify({
  summary: "A summary.",
  keyPoints: [
    { text: "Fast", quote: "reaches 42 tokens per second" },
    { text: "Invented", quote: "this sentence is not in the article" },
  ],
});

const working: PageLoader = { name: "http", load: async (url) => articleHtml(`Title of ${url}`) };
const failing: PageLoader = {
  name: "http",
  load: async () => {
    throw new Error("HTTP 403");
  },
};

let harness: Harness;

afterEach(async () => {
  await harness.cleanup();
});

describe("addLinks", () => {
  it("extracts each link and allocates the next F id", async () => {
    harness = await createHarness([], { loaders: [working] });
    const { ctx, slug } = harness;
    const first = await addLinks(ctx, { slug, urls: ["https://a.test/1"] });
    const second = await addLinks(ctx, { slug, urls: ["https://a.test/2", "https://a.test/3"] });
    expect(first.problems).toEqual([]);
    expect(second.snapshot.sources.map((source) => source.id)).toEqual(["F1", "F2", "F3"]);
    const source = second.snapshot.sources[0] as WebSource;
    expect(source.url).toBe("https://a.test/1");
    expect(source.accessedAt).toBe(NOW);
    expect(source.text).toContain("42 tokens per second");
  });

  it("falls back to the next loader", async () => {
    harness = await createHarness([], { loaders: [failing, working] });
    const { snapshot } = await addLinks(harness.ctx, { slug: harness.slug, urls: ["https://a.test/1"] });
    expect((snapshot.sources[0] as WebSource).text).toContain("42 tokens");
  });

  it("keeps a blocked link so its text can be pasted", async () => {
    harness = await createHarness([], { loaders: [failing] });
    const { snapshot, problems } = await addLinks(harness.ctx, { slug: harness.slug, urls: ["https://a.test/1"] });
    expect(snapshot.sources).toHaveLength(1);
    expect((snapshot.sources[0] as WebSource).text).toBe("");
    expect(snapshot.cardPendingIds).toEqual([]);
    expect(problems).toEqual(["F1 is blocked (http: HTTP 403). Paste its text."]);
  });

  it("refuses a link that is not http and allocates no id", async () => {
    harness = await createHarness([], { loaders: [working] });
    const { snapshot, problems } = await addLinks(harness.ctx, { slug: harness.slug, urls: ["ftp://a.test/1"] });
    expect(snapshot.sources).toEqual([]);
    expect(problems).toEqual(["ftp://a.test/1: Only http and https links are supported."]);
  });

  it("stops when cancelled and keeps what was already extracted", async () => {
    harness = await createHarness([], { loaders: [working] });
    const { ctx, slug } = harness;
    const cancelling: PageLoader = {
      name: "http",
      load: async (url, signal) => {
        if (url.endsWith("/2")) {
          ctx.steps.cancel(slug);
          signal.throwIfAborted();
        }
        return articleHtml(url);
      },
    };
    ctx.loaders = [cancelling];
    await expect(addLinks(ctx, { slug, urls: ["https://a.test/1", "https://a.test/2"] })).rejects.toThrow(
      ConnectorError,
    );
    expect((await buildSnapshot(ctx, slug)).sources.map((source) => source.id)).toEqual(["F1"]);
  });
});

describe("pasteSourceText", () => {
  it("fills a blocked link and makes it ready for cards", async () => {
    harness = await createHarness([], { loaders: [failing] });
    const { ctx, slug } = harness;
    await addLinks(ctx, { slug, urls: ["https://a.test/1"] });
    const snapshot = await pasteSourceText(ctx, { slug, sourceId: "F1", title: "Pasted", text: "Pasted body" });
    const source = snapshot.sources[0] as WebSource;
    expect(source).toMatchObject({ title: "Pasted", text: "Pasted body", url: "https://a.test/1", accessedAt: NOW });
    expect(snapshot.cardPendingIds).toEqual(["F1"]);
  });

  it("refuses to replace text that was already extracted", async () => {
    harness = await createHarness([], { loaders: [working] });
    const { ctx, slug } = harness;
    await addLinks(ctx, { slug, urls: ["https://a.test/1"] });
    await expect(pasteSourceText(ctx, { slug, sourceId: "F1", title: "X", text: "Y" })).rejects.toThrow(
      "F1 already has text.",
    );
    expect(((await buildSnapshot(ctx, slug)).sources[0] as WebSource).title).toBe("Title of https://a.test/1");
  });
});

describe("personal tests", () => {
  it("allocates P ids and stores every field", async () => {
    harness = await createHarness();
    const { ctx, slug } = harness;
    await addTest(ctx, { slug, fields: FIELDS });
    const snapshot = await addTest(ctx, { slug, fields: { ...FIELDS, title: "Second" } });
    expect(snapshot.sources.map((source) => source.id)).toEqual(["P1", "P2"]);
    expect(snapshot.sources[0]).toMatchObject({ kind: "test", ...FIELDS, summary: "", keyPoints: [], discarded: false });
  });

  it("clears the card when the test content changes", async () => {
    harness = await createHarness([CARD]);
    const { ctx, slug } = harness;
    await addTest(ctx, { slug, fields: FIELDS });
    await generateCards(ctx, { slug });
    const snapshot = await editTest(ctx, { slug, sourceId: "P1", fields: { ...FIELDS, results: "50 t/s" } });
    expect(snapshot.sources[0]).toMatchObject({ results: "50 t/s", summary: "", keyPoints: [] });
    expect(snapshot.cardPendingIds).toEqual(["P1"]);
  });

  it("keeps the card when nothing citable changed", async () => {
    harness = await createHarness([CARD]);
    const { ctx, slug } = harness;
    await addTest(ctx, { slug, fields: FIELDS });
    await generateCards(ctx, { slug });
    const snapshot = await editTest(ctx, { slug, sourceId: "P1", fields: FIELDS });
    expect((snapshot.sources[0] as TestSource).summary).toBe("A summary.");
  });
});

describe("generateCards", () => {
  it("cards every pending source and records the run", async () => {
    harness = await createHarness([CARD], { loaders: [working] });
    const { ctx, slug } = harness;
    await addLinks(ctx, { slug, urls: ["https://a.test/1"] });
    const snapshot = await generateCards(ctx, { slug });
    expect(snapshot.sources[0]?.keyPoints.map((point) => [point.quoteStatus, point.selected])).toEqual([
      ["verified", true],
      ["unverified", false],
    ]);
    expect(snapshot.runs).toEqual([{ step: "cards", status: "done", startedAt: NOW }]);
    expect(snapshot.cardPendingIds).toEqual([]);
  });

  it("skips discarded and blocked sources", async () => {
    harness = await createHarness([CARD], { loaders: [working] });
    const { ctx, slug, connector } = harness;
    await addLinks(ctx, { slug, urls: ["https://a.test/1"] });
    await setSourceDiscarded(ctx, { slug, sourceId: "F1", discarded: true });
    await generateCards(ctx, { slug });
    expect(connector.requests).toEqual([]);
  });

  it("records a failed run and keeps cards already saved", async () => {
    harness = await createHarness([CARD, new ConnectorError("failed", "boom")], { loaders: [working] });
    const { ctx, slug } = harness;
    await addLinks(ctx, { slug, urls: ["https://a.test/1", "https://a.test/2"] });
    await expect(generateCards(ctx, { slug })).rejects.toThrow("boom");
    const snapshot = await buildSnapshot(ctx, slug);
    expect(snapshot.runs[0]?.status).toBe("failed");
    expect(snapshot.sources[0]?.keyPoints).toHaveLength(2);
    expect(snapshot.cardPendingIds).toEqual(["F2"]);
  });
});

describe("selection", () => {
  async function carded(): Promise<void> {
    harness = await createHarness([CARD], { loaders: [working] });
    await addLinks(harness.ctx, { slug: harness.slug, urls: ["https://a.test/1"] });
    await generateCards(harness.ctx, { slug: harness.slug });
  }

  it("discards and restores a source", async () => {
    await carded();
    const { ctx, slug } = harness;
    const off = await setSourceDiscarded(ctx, { slug, sourceId: "F1", discarded: true });
    expect(off.sources[0]?.discarded).toBe(true);
    const on = await setSourceDiscarded(ctx, { slug, sourceId: "F1", discarded: false });
    expect(on.sources[0]?.discarded).toBe(false);
  });

  it("toggles a verified point", async () => {
    await carded();
    const { ctx, slug } = harness;
    const input = { slug, sourceId: "F1", keyPointId: "F1-k1", selected: false, approveUnverified: false };
    expect((await setKeyPointSelected(ctx, input)).sources[0]?.keyPoints[0]?.selected).toBe(false);
  });

  it("refuses an unverified point without explicit approval and leaves it unselected", async () => {
    await carded();
    const { ctx, slug } = harness;
    const input = { slug, sourceId: "F1", keyPointId: "F1-k2", selected: true, approveUnverified: false };
    await expect(setKeyPointSelected(ctx, input)).rejects.toThrow(
      "This quote could not be found in the source. Approve it explicitly to use it.",
    );
    expect((await buildSnapshot(ctx, slug)).sources[0]?.keyPoints[1]?.selected).toBe(false);
  });

  it("selects an unverified point when explicitly approved", async () => {
    await carded();
    const { ctx, slug } = harness;
    const input = { slug, sourceId: "F1", keyPointId: "F1-k2", selected: true, approveUnverified: true };
    expect((await setKeyPointSelected(ctx, input)).sources[0]?.keyPoints[1]?.selected).toBe(true);
  });

  it("refuses an unknown point", async () => {
    await carded();
    const input = { slug: harness.slug, sourceId: "F1", keyPointId: "nope", selected: true, approveUnverified: false };
    await expect(setKeyPointSelected(harness.ctx, input)).rejects.toThrow("Unknown key point: nope");
  });
});
