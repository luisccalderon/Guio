import { describe, expect, it } from "vitest";
import type { KeyPoint, Source, Template } from "../../src/core/domain/schemas";
import { proposeSkeleton } from "../../src/core/pipeline/skeleton";
import { fakeConnector, noSignal } from "../helpers/fakeConnector";

const template: Template = {
  id: "t",
  name: "T",
  blocks: [
    { id: "opening", title: "Opening", guidance: "g" },
    { id: "body", title: "Body", guidance: "g" },
  ],
};

function point(id: string, selected = true): KeyPoint {
  return { id, text: `text ${id}`, quote: "q", quoteStatus: "verified", selected };
}

function source(id: string, keyPoints: KeyPoint[], discarded = false): Source {
  return {
    kind: "web",
    id,
    url: null,
    title: id,
    accessedAt: "2026-11-09T10:00:00.000Z",
    text: "x",
    summary: "",
    keyPoints,
    discarded,
  };
}

function run(sources: Source[], blocks: unknown) {
  const connector = fakeConnector([JSON.stringify({ blocks })]);
  return { connector, result: proposeSkeleton({ sources, template, connector, timeoutMs: 1000, signal: noSignal }) };
}

describe("proposeSkeleton", () => {
  it("creates one block per template block and links points to sources", async () => {
    const { result } = run(
      [source("F1", [point("F1-k1"), point("F1-k2")])],
      [
        { blockId: "opening", keyPointIds: ["F1-k2"] },
        { blockId: "body", keyPointIds: ["F1-k1"] },
      ],
    );
    expect(await result).toEqual({
      blocks: [
        {
          id: "opening",
          title: "Opening",
          points: [{ id: "pt-F1-k2", text: "text F1-k2", keyPointId: "F1-k2", sourceIds: ["F1"] }],
        },
        {
          id: "body",
          title: "Body",
          points: [{ id: "pt-F1-k1", text: "text F1-k1", keyPointId: "F1-k1", sourceIds: ["F1"] }],
        },
      ],
    });
  });

  it("sends only selected points from kept sources", async () => {
    const { connector, result } = run(
      [source("F1", [point("F1-k1"), point("F1-k2", false)]), source("F2", [point("F2-k1")], true)],
      [{ blockId: "body", keyPointIds: ["F1-k1"] }],
    );
    await result;
    expect(connector.requests[0]!.prompt).toContain("F1-k1");
    expect(connector.requests[0]!.prompt).not.toContain("F1-k2");
    expect(connector.requests[0]!.prompt).not.toContain("F2-k1");
  });

  it("ignores ids the model invented", async () => {
    const { result } = run([source("F1", [point("F1-k1")])], [{ blockId: "body", keyPointIds: ["F1-k1", "F9-k9"] }]);
    expect((await result).blocks[1]?.points.map((item) => item.id)).toEqual(["pt-F1-k1"]);
  });

  it("uses a point only once", async () => {
    const { result } = run(
      [source("F1", [point("F1-k1")])],
      [
        { blockId: "opening", keyPointIds: ["F1-k1"] },
        { blockId: "body", keyPointIds: ["F1-k1"] },
      ],
    );
    const skeleton = await result;
    expect(skeleton.blocks[0]?.points).toHaveLength(1);
    expect(skeleton.blocks[1]?.points).toHaveLength(0);
  });

  it("places points the model forgot into the body block", async () => {
    const { result } = run([source("F1", [point("F1-k1"), point("F1-k2")])], [{ blockId: "opening", keyPointIds: ["F1-k1"] }]);
    expect((await result).blocks[1]?.points.map((item) => item.id)).toEqual(["pt-F1-k2"]);
  });
});
