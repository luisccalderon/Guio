import { describe, expect, it } from "vitest";
import type { Script, Skeleton, SkeletonBlock } from "../../src/core/domain/schemas";
import { computePointRefs, staleBlockIds } from "../../src/core/script/staleness";

function point(id: string, text: string) {
  return { id, text, keyPointId: null, sourceIds: ["F1"] };
}

function skeleton(): Skeleton {
  return {
    blocks: [
      { id: "s1", title: "One", points: [point("p1", "first"), point("p2", "second")] },
      { id: "s2", title: "Two", points: [point("p3", "third")] },
    ],
  };
}

function scriptFor(blocks: SkeletonBlock[]): Script {
  return {
    blocks: blocks.map((block) => ({
      id: `b-${block.id}`,
      skeletonBlockId: block.id,
      title: block.title,
      voiceover: "text",
      onScreen: "",
      pointRefs: computePointRefs(block),
      origin: "generated",
      humanizeStatus: "off",
    })),
  };
}

describe("staleBlockIds", () => {
  it("reports nothing when the skeleton is unchanged", () => {
    const current = skeleton();
    expect(staleBlockIds(scriptFor(current.blocks), current)).toEqual([]);
  });

  it("marks only the block whose point text changed", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    edited.blocks[1]!.points[0]!.text = "changed";
    expect(staleBlockIds(script, edited)).toEqual(["b-s2"]);
  });

  it("marks both blocks when a point moves between them", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    const moved = edited.blocks[0]!.points.pop()!;
    edited.blocks[1]!.points.push(moved);
    expect(staleBlockIds(script, edited)).toEqual(["b-s1", "b-s2"]);
  });

  it("marks a block when a point is added", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    edited.blocks[1]!.points.push(point("p4", "new"));
    expect(staleBlockIds(script, edited)).toEqual(["b-s2"]);
  });

  it("marks a block whose skeleton block was removed", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    edited.blocks.pop();
    expect(staleBlockIds(script, edited)).toEqual(["b-s2"]);
  });
});
