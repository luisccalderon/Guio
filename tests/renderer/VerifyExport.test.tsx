// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { Finding } from "../../src/core/domain/schemas";
import { ExportStep } from "../../src/renderer/src/steps/ExportStep";
import { VerifyStep } from "../../src/renderer/src/steps/VerifyStep";
import { scriptBlock, snapshot, stepProps } from "./fixtures";

const NUMBER: Finding = {
  id: "b-body:number:99",
  blockId: "b-body",
  kind: "number",
  token: "99",
  reason: "not-in-source",
};

const CLAIM: Finding = {
  id: "b-body:claim:abc",
  blockId: "b-body",
  kind: "claim",
  token: "Best model ever",
  reason: "claim-unsupported",
};

afterEach(cleanup);

function renderVerify(openFindings: Finding[] = [NUMBER, CLAIM]) {
  const result = stepProps(
    snapshot({
      script: { blocks: [scriptBlock({ voiceover: "It uses 99 GB [F1]." })] },
      openFindings,
      exportGate: { allowed: false, blocking: openFindings.filter((item) => item.kind === "number") },
    }),
  );
  render(<VerifyStep {...result.props} />);
  return { ...result, user: userEvent.setup() };
}

describe("VerifyStep", () => {
  it("runs verification", async () => {
    const { act, user } = renderVerify([]);
    await user.click(screen.getByRole("button", { name: "Run verification" }));
    expect(act).toHaveBeenCalledWith("runVerification", { slug: "video" });
  });

  it("lists number and claim findings with the block and an explanation", () => {
    renderVerify();
    expect(screen.getByText("2 open")).toBeTruthy();
    expect(screen.getByText("Number check")).toBeTruthy();
    expect(screen.getByText("AI review")).toBeTruthy();
    expect(screen.getByText("99")).toBeTruthy();
    expect(screen.getByText("This number does not appear in a cited source.")).toBeTruthy();
    expect(screen.getByText("May overstate what the source says.")).toBeTruthy();
  });

  it("explains a number in a block with no citations", () => {
    renderVerify([{ ...NUMBER, reason: "no-citation" }]);
    expect(screen.getByText("This block cites no source for this number.")).toBeTruthy();
  });

  it("accepts a finding", async () => {
    const { act, user } = renderVerify([NUMBER]);
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(act).toHaveBeenCalledWith("acceptFinding", { slug: "video", findingId: NUMBER.id });
  });

  it("removes the text of a finding", async () => {
    const { act, user } = renderVerify([NUMBER]);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(act).toHaveBeenCalledWith("removeFindingText", { slug: "video", findingId: NUMBER.id });
  });

  it("corrects through the block's voiceover and keeps on-screen text", async () => {
    const { act, user } = renderVerify([NUMBER]);
    await user.click(screen.getByRole("button", { name: "Correct" }));
    const field = screen.getByLabelText("Voiceover");
    await user.clear(field);
    await user.type(field, "It uses 42 GB.");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(act).toHaveBeenCalledWith("editBlock", {
      slug: "video",
      blockId: "b-body",
      voiceover: "It uses 42 GB.",
      onScreen: "Terminal capture",
    });
  });

  it("publishes the cited sources for the side panel", async () => {
    const { onSupport, user } = renderVerify([NUMBER]);
    await user.click(screen.getByText("This number does not appear in a cited source."));
    expect(onSupport).toHaveBeenCalledWith({ label: "Body", sourceIds: ["F1"], keyPointIds: [] });
  });

  it("says when nothing needs attention", () => {
    renderVerify([]);
    expect(screen.getByText("Nothing needs your attention.")).toBeTruthy();
  });
});

describe("ExportStep", () => {
  it("shows a blocked gate with its findings and the next-plan note", () => {
    const value = snapshot({
      script: { blocks: [scriptBlock()] },
      exportGate: { allowed: false, blocking: [NUMBER] },
    });
    render(<ExportStep {...stepProps(value).props} />);
    expect(screen.getByText("Export is blocked: 1 number needs a decision in Verify.")).toBeTruthy();
    expect(screen.getByText("Body: 99")).toBeTruthy();
    expect(screen.getByText("PDF and Markdown output arrive in the next version.")).toBeTruthy();
  });

  it("shows an open gate", () => {
    render(<ExportStep {...stepProps(snapshot({ script: { blocks: [scriptBlock()] } })).props} />);
    expect(screen.getByText("Ready to export.")).toBeTruthy();
  });

  it("warns without blocking when a block is not humanized and humanize is on", () => {
    const blocks = [scriptBlock({ humanizeStatus: "failed" })];
    render(<ExportStep {...stepProps(snapshot({ script: { blocks }, humanizeEnabled: true })).props} />);
    expect(screen.getByText("Ready to export.")).toBeTruthy();
    expect(screen.getByText("1 block is not humanized.")).toBeTruthy();
  });

  it("warns about open AI review findings without blocking", () => {
    render(
      <ExportStep
        {...stepProps(snapshot({ script: { blocks: [scriptBlock()] }, openFindings: [CLAIM] })).props}
      />,
    );
    expect(screen.getByText("Ready to export.")).toBeTruthy();
    expect(screen.getByText("1 AI review warning is open.")).toBeTruthy();
  });

  it("says when there is nothing to export", () => {
    render(<ExportStep {...stepProps(snapshot()).props} />);
    expect(screen.getByText("Draft the script first.")).toBeTruthy();
  });
});
