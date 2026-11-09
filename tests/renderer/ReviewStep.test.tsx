// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DraftStep } from "../../src/renderer/src/steps/DraftStep";
import { ReviewStep } from "../../src/renderer/src/steps/ReviewStep";
import { scriptBlock, snapshot, stepProps } from "./fixtures";
import { stubGuio } from "./guioStub";

afterEach(cleanup);

function renderReview(block = scriptBlock(), overrides = {}) {
  const result = stepProps(
    snapshot({
      script: { blocks: [block] },
      timing: { blockSeconds: { [block.id]: 80 }, totalSeconds: 80 },
      ...overrides,
    }),
  );
  render(<ReviewStep {...result.props} />);
  return { ...result, user: userEvent.setup() };
}

const rewrite = (instruction: string, confirmOverwrite: boolean) => [
  "rewriteBlock",
  { slug: "video", blockId: "b-body", instruction, confirmOverwrite },
];

const SHORTER = "Make this block noticeably shorter. Keep every fact, number, and reference mark.";
const FIX_DATA = "Correct the data so every number and claim matches the cited quotes exactly. Keep the reference marks.";

describe("ReviewStep", () => {
  it("shows the two columns, duration, and reference marks", () => {
    renderReview();
    expect(screen.getByText("BLOCK 1 · BODY")).toBeTruthy();
    expect(screen.getByText("~1:20")).toBeTruthy();
    expect(screen.getByText("Voiceover")).toBeTruthy();
    expect(screen.getByText("On screen")).toBeTruthy();
    expect(screen.getByText("[F1]").className).toBe("ref");
    expect(screen.getByText("Terminal capture")).toBeTruthy();
  });

  it("renders script text as text, never as HTML", () => {
    const { user } = renderReview(scriptBlock({ voiceover: "<img src=x onerror=alert(1)>" }));
    expect(user).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows the stale badge only for stale blocks", () => {
    renderReview(scriptBlock(), { staleBlockIds: ["b-body"] });
    expect(screen.getByText("Out of date")).toBeTruthy();
    cleanup();
    renderReview();
    expect(screen.queryByText("Out of date")).toBeNull();
  });

  it("shows no humanize badge while humanize is off", () => {
    renderReview(scriptBlock({ humanizeStatus: "failed" }), { humanizeEnabled: false });
    expect(screen.queryByText("Not humanized")).toBeNull();
  });

  it("offers a retry on a block that could not be humanized", async () => {
    const { act, user } = renderReview(scriptBlock({ humanizeStatus: "failed" }), { humanizeEnabled: true });
    expect(screen.getByText("Not humanized")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry humanize" }));
    expect(act).toHaveBeenCalledWith("retryHumanize", { slug: "video", blockId: "b-body" });
  });

  it("sends Shorter and Fix data as rewrites", async () => {
    const { act, user } = renderReview();
    await user.click(screen.getByRole("button", { name: "Shorter" }));
    await user.click(screen.getByRole("button", { name: "Fix data" }));
    expect(act).toHaveBeenNthCalledWith(1, ...rewrite(SHORTER, false));
    expect(act).toHaveBeenNthCalledWith(2, ...rewrite(FIX_DATA, false));
  });

  it("rewrites with the user's instruction", async () => {
    const { act, user } = renderReview();
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
    await user.type(screen.getByLabelText("Instruction"), "More direct");
    await user.click(screen.getByRole("button", { name: "Rewrite block" }));
    expect(act).toHaveBeenCalledWith(...rewrite("More direct", false));
  });

  it("asks before replacing a block edited by hand", async () => {
    const { act, user } = renderReview(scriptBlock({ origin: "edited" }));
    await user.click(screen.getByRole("button", { name: "Shorter" }));
    expect(act).not.toHaveBeenCalled();
    expect(screen.getByText("You edited this block by hand. Replace your text?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(act).toHaveBeenCalledWith(...rewrite(SHORTER, true));
  });

  it("keeps an edited block when the user declines", async () => {
    const { act, user } = renderReview(scriptBlock({ origin: "edited" }));
    await user.click(screen.getByRole("button", { name: "Shorter" }));
    await user.click(screen.getByRole("button", { name: "Keep my text" }));
    expect(act).not.toHaveBeenCalled();
    expect(screen.queryByText("You edited this block by hand. Replace your text?")).toBeNull();
  });

  it("saves a manual edit of both columns", async () => {
    const { act, user } = renderReview();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const voiceover = screen.getByLabelText("Voiceover");
    await user.clear(voiceover);
    await user.type(voiceover, "Mine");
    await user.click(screen.getByRole("button", { name: "Save edit" }));
    expect(act).toHaveBeenCalledWith("editBlock", {
      slug: "video",
      blockId: "b-body",
      voiceover: "Mine",
      onScreen: "Terminal capture",
    });
  });

  it("lists history newest first and restores by original position", async () => {
    stubGuio({
      getBlockHistory: {
        versions: [
          { savedAt: "2026-11-09T10:00:00.000Z", voiceover: "Oldest", onScreen: "", reason: "draft" },
          { savedAt: "2026-11-09T11:00:00.000Z", voiceover: "Newest", onScreen: "", reason: "edit" },
        ],
      },
    });
    const { act, user } = renderReview();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText("Newest")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Restore" })[1] as HTMLElement);
    expect(act).toHaveBeenCalledWith("restoreVersion", { slug: "video", blockId: "b-body", versionIndex: 0 });
  });

  it("publishes the block's cited sources for the side panel", async () => {
    const { onSupport, user } = renderReview();
    await user.click(screen.getByText("Terminal capture"));
    expect(onSupport).toHaveBeenCalledWith({ label: "Body", sourceIds: ["F1"], keyPointIds: [] });
  });

  it("explains itself before there is a script", () => {
    render(<ReviewStep {...stepProps(snapshot()).props} />);
    expect(screen.getByText("Draft the script first.")).toBeTruthy();
  });
});

describe("DraftStep", () => {
  it("drafts the script and compares the total with the target", async () => {
    const value = snapshot({
      skeleton: { blocks: [{ id: "body", title: "Body", points: [] }] },
      script: { blocks: [scriptBlock({ origin: "edited" })] },
      timing: { blockSeconds: { "b-body": 90 }, totalSeconds: 90 },
    });
    const { props, act } = stepProps(value);
    render(<DraftStep {...props} />);
    expect(screen.getByText("1:30 of 10:00 target")).toBeTruthy();
    expect(screen.getByText("Blocks you edited by hand are kept.")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Draft script" }));
    expect(act).toHaveBeenCalledWith("draftScript", { slug: "video" });
  });

  it("needs a skeleton first", () => {
    render(<DraftStep {...stepProps(snapshot()).props} />);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Draft script" }).disabled).toBe(true);
  });
});
