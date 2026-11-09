// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { Skeleton } from "../../src/core/domain/schemas";
import { SkeletonStep } from "../../src/renderer/src/steps/SkeletonStep";
import { snapshot, stepProps, testSource, webSource } from "./fixtures";

const SKELETON: Skeleton = {
  blocks: [
    {
      id: "opening",
      title: "Opening",
      points: [
        { id: "a", text: "Point A", keyPointId: "F1-k1", sourceIds: ["F1"] },
        { id: "b", text: "Point B", keyPointId: null, sourceIds: [] },
      ],
    },
    { id: "body", title: "Body", points: [{ id: "c", text: "Point C", keyPointId: null, sourceIds: [] }] },
  ],
};

const edit = (value: object) => ["editSkeleton", { slug: "video", edit: value }];

afterEach(cleanup);

function renderStep(overrides = {}) {
  const result = stepProps(snapshot({ skeleton: SKELETON, sources: [webSource(), testSource()], ...overrides }));
  render(<SkeletonStep {...result.props} />);
  return { ...result, user: userEvent.setup() };
}

describe("SkeletonStep", () => {
  it("groups points under numbered template blocks with their marks", () => {
    renderStep();
    expect(screen.getByRole("heading", { name: "1 · Opening" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2 · Body" })).toBeTruthy();
    expect(screen.getByText("[F1]")).toBeTruthy();
  });

  it("moves a point down inside its block", async () => {
    const { act, user } = renderStep();
    await user.click(screen.getByRole("button", { name: "Move down: Point A" }));
    expect(act).toHaveBeenCalledWith(...edit({ op: "move-point", pointId: "a", toBlockId: "opening", toIndex: 1 }));
  });

  it("moves a point up inside its block", async () => {
    const { act, user } = renderStep();
    await user.click(screen.getByRole("button", { name: "Move up: Point B" }));
    expect(act).toHaveBeenCalledWith(...edit({ op: "move-point", pointId: "b", toBlockId: "opening", toIndex: 0 }));
  });

  it("disables moves past the ends of a block", () => {
    renderStep();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Move up: Point A" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Move down: Point B" }).disabled).toBe(true);
  });

  it("moves a point to the end of another block", async () => {
    const { act, user } = renderStep();
    await user.selectOptions(screen.getByLabelText("Move to block: Point A"), "body");
    expect(act).toHaveBeenCalledWith(...edit({ op: "move-point", pointId: "a", toBlockId: "body", toIndex: 1 }));
  });

  it("does not offer the point's own block as a destination", () => {
    renderStep();
    const options = [...screen.getByLabelText<HTMLSelectElement>("Move to block: Point C").options];
    expect(options.map((option) => option.value)).toEqual(["", "opening"]);
  });

  it("removes a point", async () => {
    const { act, user } = renderStep();
    await user.click(screen.getByRole("button", { name: "Remove: Point C" }));
    expect(act).toHaveBeenCalledWith(...edit({ op: "remove-point", pointId: "c" }));
  });

  it("edits a point's text", async () => {
    const { act, user } = renderStep();
    await user.click(screen.getByRole("button", { name: "Edit: Point C" }));
    const field = screen.getByLabelText("Point text");
    await user.clear(field);
    await user.type(field, "Changed");
    await user.click(screen.getByRole("button", { name: "Save point" }));
    expect(act).toHaveBeenCalledWith(...edit({ op: "edit-point", pointId: "c", text: "Changed" }));
  });

  it("adds a point of the user's own with citations", async () => {
    const { act, user } = renderStep();
    await user.click(screen.getByRole("button", { name: "Add a point to Body" }));
    await user.type(screen.getByLabelText("New point"), "Mine");
    await user.click(screen.getByRole("checkbox", { name: "P1" }));
    await user.click(screen.getByRole("button", { name: "Add point" }));
    expect(act).toHaveBeenCalledWith(...edit({ op: "add-point", blockId: "body", text: "Mine", sourceIds: ["P1"] }));
  });

  it("publishes the point's source for the side panel", async () => {
    const { onSupport, user } = renderStep();
    await user.click(screen.getByText("Point A"));
    expect(onSupport).toHaveBeenCalledWith({ label: "Point A", sourceIds: ["F1"], keyPointIds: ["F1-k1"] });
  });

  it("proposes directly when there is no skeleton yet", async () => {
    const { act, user } = renderStep({ skeleton: { blocks: [] } });
    await user.click(screen.getByRole("button", { name: "Propose skeleton" }));
    expect(act).toHaveBeenCalledWith("proposeSkeleton", { slug: "video" });
  });

  it("asks before replacing an existing skeleton", async () => {
    const { act, user } = renderStep();
    await user.click(screen.getByRole("button", { name: "Propose skeleton" }));
    expect(act).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Replace skeleton" }));
    expect(act).toHaveBeenCalledWith("proposeSkeleton", { slug: "video" });
  });

  it("says how many script blocks are out of date", () => {
    renderStep({ staleBlockIds: ["b-body"] });
    expect(screen.getByText("1 script block is out of date. Rewrite it in Review.")).toBeTruthy();
  });
});
