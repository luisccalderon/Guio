import { afterEach, describe, expect, it } from "vitest";
import { computePointRefs } from "../../src/core/script/staleness";
import type { Script, Skeleton } from "../../src/core/domain/schemas";
import { addTest } from "../../src/main/service/sourcesService";
import { applySkeletonEdit, editSkeleton, proposeSkeletonStep } from "../../src/main/service/skeletonService";
import { buildSnapshot } from "../../src/main/service/snapshot";
import { createHarness, NOW, type Harness } from "./serviceHarness";

const point = (id: string, text = id) => ({ id, text, keyPointId: null, sourceIds: [] });

const SKELETON: Skeleton = {
  blocks: [
    { id: "opening", title: "Opening", points: [point("a"), point("b")] },
    { id: "body", title: "Body", points: [point("c")] },
  ],
};

function scriptFor(skeleton: Skeleton): Script {
  return {
    blocks: skeleton.blocks.map((block) => ({
      id: `b-${block.id}`,
      skeletonBlockId: block.id,
      title: block.title,
      voiceover: "Text",
      onScreen: "",
      pointRefs: computePointRefs(block),
      origin: "generated" as const,
      humanizeStatus: "off" as const,
    })),
  };
}

const ids = (skeleton: Skeleton) => skeleton.blocks.map((block) => block.points.map((item) => item.id));

let harness: Harness;

afterEach(async () => {
  await harness?.cleanup();
});

describe("applySkeletonEdit", () => {
  it("edits a point's text and keeps its references", () => {
    const result = applySkeletonEdit(SKELETON, { op: "edit-point", pointId: "c", text: "New" });
    expect(result.blocks[1]?.points[0]).toEqual({ ...point("c"), text: "New" });
  });

  it("reorders within a block", () => {
    const result = applySkeletonEdit(SKELETON, { op: "move-point", pointId: "a", toBlockId: "opening", toIndex: 1 });
    expect(ids(result)).toEqual([["b", "a"], ["c"]]);
  });

  it("moves between blocks and clamps the index", () => {
    const result = applySkeletonEdit(SKELETON, { op: "move-point", pointId: "a", toBlockId: "body", toIndex: 99 });
    expect(ids(result)).toEqual([["b"], ["c", "a"]]);
  });

  it("adds a user point with its citations and a fresh id", () => {
    const first = applySkeletonEdit(SKELETON, { op: "add-point", blockId: "body", text: "Mine", sourceIds: ["P1"] });
    const second = applySkeletonEdit(first, { op: "add-point", blockId: "body", text: "Two", sourceIds: [] });
    expect(second.blocks[1]?.points.slice(1)).toEqual([
      { id: "pt-u-1", text: "Mine", keyPointId: null, sourceIds: ["P1"] },
      { id: "pt-u-2", text: "Two", keyPointId: null, sourceIds: [] },
    ]);
  });

  it("removes a point", () => {
    expect(ids(applySkeletonEdit(SKELETON, { op: "remove-point", pointId: "b" }))).toEqual([["a"], ["c"]]);
  });

  it("refuses unknown targets and leaves the input untouched", () => {
    expect(() => applySkeletonEdit(SKELETON, { op: "remove-point", pointId: "x" })).toThrow("Unknown point: x");
    expect(() => applySkeletonEdit(SKELETON, { op: "add-point", blockId: "x", text: "T", sourceIds: [] })).toThrow(
      "Unknown block: x",
    );
    expect(() =>
      applySkeletonEdit(SKELETON, { op: "move-point", pointId: "a", toBlockId: "x", toIndex: 0 }),
    ).toThrow("Unknown block: x");
    expect(ids(SKELETON)).toEqual([["a", "b"], ["c"]]);
  });
});

describe("editSkeleton", () => {
  it("returns only the blocks that used the changed point as stale", async () => {
    harness = await createHarness();
    const { ctx, slug, store } = harness;
    await store.saveSkeleton(slug, SKELETON);
    await store.saveScript(slug, scriptFor(SKELETON));
    const snapshot = await editSkeleton(ctx, { slug, edit: { op: "edit-point", pointId: "c", text: "New" } });
    expect(snapshot.staleBlockIds).toEqual(["b-body"]);
    expect(snapshot.script.blocks[1]?.voiceover).toBe("Text");
  });

  it("marks both blocks of a move as stale", async () => {
    harness = await createHarness();
    const { ctx, slug, store } = harness;
    await store.saveSkeleton(slug, SKELETON);
    await store.saveScript(slug, scriptFor(SKELETON));
    const edit = { op: "move-point", pointId: "a", toBlockId: "body", toIndex: 0 } as const;
    expect((await editSkeleton(ctx, { slug, edit })).staleBlockIds).toEqual(["b-opening", "b-body"]);
  });
});

describe("proposeSkeletonStep", () => {
  it("arranges selected points into the project's template and records the run", async () => {
    const reply = JSON.stringify({ blocks: [{ blockId: "opening", keyPointIds: ["P1-k1"] }] });
    harness = await createHarness([reply]);
    const { ctx, slug, store } = harness;
    await addTest(ctx, {
      slug,
      fields: {
        title: "T",
        hardware: "",
        modelVersion: "",
        quantization: "",
        settings: "",
        results: "",
        notes: "",
      },
    });
    const source = (await store.listSources(slug))[0];
    if (source === undefined) {
      throw new Error("missing source");
    }
    await store.saveSource(slug, {
      ...source,
      keyPoints: [{ id: "P1-k1", text: "Point", quote: "T", quoteStatus: "verified", selected: true }],
    });
    const snapshot = await proposeSkeletonStep(ctx, { slug });
    expect(snapshot.skeleton.blocks.map((block) => block.id)).toEqual([
      "opening",
      "context",
      "body",
      "own-value",
      "closing",
    ]);
    expect(snapshot.skeleton.blocks[0]?.points[0]?.sourceIds).toEqual(["P1"]);
    expect(snapshot.runs).toEqual([{ step: "skeleton", status: "done", startedAt: NOW }]);
  });

  it("keeps the previous skeleton when the model fails", async () => {
    harness = await createHarness(["not json"]);
    const { ctx, slug, store } = harness;
    await store.saveSkeleton(slug, SKELETON);
    await expect(proposeSkeletonStep(ctx, { slug })).rejects.toThrow("invalid output");
    const snapshot = await buildSnapshot(ctx, slug);
    expect(ids(snapshot.skeleton)).toEqual([["a", "b"], ["c"]]);
    expect(snapshot.runs[0]?.status).toBe("failed");
  });
});
