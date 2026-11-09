// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MyTests } from "../../src/renderer/src/components/MyTests";
import { SupportPanel } from "../../src/renderer/src/components/SupportPanel";
import { CardsStep } from "../../src/renderer/src/steps/CardsStep";
import { InboxStep } from "../../src/renderer/src/steps/InboxStep";
import { keyPoint, snapshot, stepProps, testSource, webSource } from "./fixtures";

afterEach(cleanup);

describe("InboxStep", () => {
  it("adds one link per non-empty line", async () => {
    const { props, act } = stepProps(snapshot());
    render(<InboxStep {...props} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Links, one per line"), "https://a.test{enter}{enter}https://b.test");
    await user.click(screen.getByRole("button", { name: "Add links" }));
    expect(act).toHaveBeenCalledWith("addLinks", { slug: "video", urls: ["https://a.test", "https://b.test"] });
  });

  it("offers a paste form for a blocked link", async () => {
    const { props, act } = stepProps(snapshot({ sources: [webSource({ text: "", title: "https://a.test", summary: "", keyPoints: [] })] }));
    render(<InboxStep {...props} />);
    expect(screen.getByText("Blocked · paste text")).toBeTruthy();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Title for F1"), "Real title");
    await user.type(screen.getByLabelText("Text for F1"), "Article body");
    await user.click(screen.getByRole("button", { name: "Save text" }));
    expect(act).toHaveBeenCalledWith("pasteSourceText", {
      slug: "video",
      sourceId: "F1",
      title: "Real title",
      text: "Article body",
    });
  });

  it("shows the status of ready and discarded sources", () => {
    const sources = [webSource(), webSource({ id: "F2", discarded: true })];
    render(<InboxStep {...stepProps(snapshot({ sources })).props} />);
    expect(screen.getByText("Ready · 1 key point")).toBeTruthy();
    expect(screen.getByText("Discarded")).toBeTruthy();
  });

  it("renders page titles as text, never as HTML", () => {
    const title = '<img src=x onerror="alert(1)">';
    const { container } = render(<InboxStep {...stepProps(snapshot({ sources: [webSource({ title })] })).props} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(title)).toBeTruthy();
  });
});

describe("MyTests", () => {
  it("adds a test with all fields", async () => {
    const { props, act } = stepProps(snapshot());
    render(<MyTests snapshot={props.snapshot} act={props.act} busy={false} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add test" }));
    await user.type(screen.getByLabelText("Title"), "Speed");
    await user.type(screen.getByLabelText("Hardware"), "GPU");
    await user.type(screen.getByLabelText("Results"), "42 t/s");
    await user.click(screen.getByRole("button", { name: "Save test" }));
    expect(act).toHaveBeenCalledWith("addTest", {
      slug: "video",
      fields: {
        title: "Speed",
        hardware: "GPU",
        modelVersion: "",
        quantization: "",
        settings: "",
        results: "42 t/s",
        notes: "",
      },
    });
  });

  it("edits an existing test under its own id", async () => {
    const { props, act } = stepProps(snapshot({ sources: [testSource()] }));
    render(<MyTests snapshot={props.snapshot} act={props.act} busy={false} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit P1" }));
    await user.click(screen.getByRole("button", { name: "Save test" }));
    expect(act).toHaveBeenCalledWith("editTest", expect.objectContaining({ sourceId: "P1" }));
  });
});

describe("CardsStep", () => {
  it("generates cards for the pending sources", async () => {
    const { props, act } = stepProps(snapshot({ cardPendingIds: ["F1", "F2"] }));
    render(<CardsStep {...props} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Generate cards (2)" }));
    expect(act).toHaveBeenCalledWith("generateCards", { slug: "video" });
  });

  it("toggles a verified point without approval", async () => {
    const { props, act } = stepProps(snapshot({ sources: [webSource()] }));
    render(<CardsStep {...props} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Fast" }));
    expect(act).toHaveBeenCalledWith("setKeyPointSelected", {
      slug: "video",
      sourceId: "F1",
      keyPointId: "F1-k1",
      selected: false,
      approveUnverified: false,
    });
  });

  it("requires explicit approval for an unverified point", async () => {
    const point = keyPoint({ quoteStatus: "unverified", selected: false, text: "Invented" });
    const { props, act } = stepProps(snapshot({ sources: [webSource({ keyPoints: [point] })] }));
    render(<CardsStep {...props} />);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Invented" }).disabled).toBe(true);
    expect(screen.getByText("Quote not found in the source")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Approve anyway" }));
    expect(act).toHaveBeenCalledWith("setKeyPointSelected", {
      slug: "video",
      sourceId: "F1",
      keyPointId: "F1-k1",
      selected: true,
      approveUnverified: true,
    });
  });

  it("discards a source", async () => {
    const { props, act } = stepProps(snapshot({ sources: [webSource()] }));
    render(<CardsStep {...props} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Discard F1" }));
    expect(act).toHaveBeenCalledWith("setSourceDiscarded", { slug: "video", sourceId: "F1", discarded: true });
  });

  it("publishes the point's source for the side panel", async () => {
    const { props, onSupport } = stepProps(snapshot({ sources: [webSource()] }));
    render(<CardsStep {...props} />);
    await userEvent.setup().click(screen.getByText("reaches 42"));
    expect(onSupport).toHaveBeenCalledWith({ label: "F1", sourceIds: ["F1"], keyPointIds: ["F1-k1"] });
  });
});

describe("SupportPanel", () => {
  it("shows the exact passage and shows the link as text", () => {
    const value = snapshot({ sources: [webSource()] });
    const { container } = render(
      <SupportPanel snapshot={value} support={{ label: "F1", sourceIds: ["F1"], keyPointIds: ["F1-k1"] }} />,
    );
    expect(screen.getByText("reaches 42")).toBeTruthy();
    expect(screen.getByText("https://a.test/article")).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows the full setup of a personal test", () => {
    const value = snapshot({ sources: [testSource()] });
    render(<SupportPanel snapshot={value} support={{ label: "P1", sourceIds: ["P1"], keyPointIds: [] }} />);
    expect(screen.getByText("RTX 4090")).toBeTruthy();
    expect(screen.getByText("42 t/s")).toBeTruthy();
  });

  it("invites a selection when nothing is active", () => {
    render(<SupportPanel snapshot={snapshot()} support={null} />);
    expect(screen.getByText("Select an item to see where it comes from.")).toBeTruthy();
  });
});
