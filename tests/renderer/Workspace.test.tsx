// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "../../src/renderer/src/screens/Workspace";
import type { GuioBridge, IpcResult } from "../../src/shared/ipc";
import { snapshot, testSource, webSource } from "./fixtures";
import { stubGuio } from "./guioStub";

afterEach(cleanup);

function open() {
  render(<Workspace slug="video" onBack={vi.fn()} />);
  return userEvent.setup();
}

describe("Workspace", () => {
  it("shows the seven steps and starts on Inbox", async () => {
    stubGuio({ getProject: snapshot() });
    open();
    await screen.findByText("Video");
    expect(screen.getAllByRole("button", { name: /^(Inbox|Cards|Skeleton|Draft|Review|Verify|Export)/ })).toHaveLength(7);
    expect(screen.getByLabelText("Links, one per line")).toBeTruthy();
    expect(screen.getByText("My tests")).toBeTruthy();
  });

  it("switches step and shows the support panel outside the Inbox", async () => {
    stubGuio({ getProject: snapshot({ sources: [webSource(), testSource()] }) });
    const user = open();
    await user.click(await screen.findByRole("button", { name: "Cards" }));
    expect(screen.getByRole("button", { name: "Generate cards (0)" })).toBeTruthy();
    expect(screen.getByText("Select an item to see where it comes from.")).toBeTruthy();
    await user.click(screen.getByText("reaches 42"));
    expect(screen.getByText("Support for F1")).toBeTruthy();
  });

  it("flags an interrupted step so it can be rerun", async () => {
    stubGuio({
      getProject: snapshot({ runs: [{ step: "cards", status: "interrupted", startedAt: "2026-11-09T10:00:00.000Z" }] }),
    });
    open();
    expect(await screen.findByRole("button", { name: "Cards, Interrupted" })).toBeTruthy();
  });

  it("shows the error and the raw model output of a failed step, then refreshes", async () => {
    const invoke = vi.fn(async (method: string): Promise<IpcResult<unknown>> => {
      if (method === "generateCards") {
        return { ok: false, error: { kind: "failed", message: "Invalid output", raw: "not json" } };
      }
      return { ok: true, value: snapshot({ cardPendingIds: ["F1"], sources: [webSource({ keyPoints: [], summary: "" })] }) };
    });
    window.guio = { invoke } as unknown as GuioBridge;
    const user = open();
    await user.click(await screen.findByRole("button", { name: "Cards" }));
    await user.click(screen.getByRole("button", { name: "Generate cards (1)" }));
    expect(await screen.findByText("Invalid output")).toBeTruthy();
    expect(screen.getByText("not json")).toBeTruthy();
    expect(invoke.mock.calls.filter(([method]) => method === "getProject")).toHaveLength(2);
  });

  it("shows a running step with Cancel and blocks other actions", async () => {
    let finish: (result: IpcResult<unknown>) => void = () => undefined;
    const invoke = vi.fn((method: string): Promise<IpcResult<unknown>> => {
      if (method === "generateCards") {
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      if (method === "cancelStep") {
        return Promise.resolve({ ok: true, value: { cancelled: true } });
      }
      return Promise.resolve({ ok: true, value: snapshot({ cardPendingIds: ["F1"] }) });
    });
    window.guio = { invoke } as unknown as GuioBridge;
    const user = open();
    await user.click(await screen.findByRole("button", { name: "Cards" }));
    await user.click(screen.getByRole("button", { name: "Generate cards (1)" }));
    expect(await screen.findByText("Generating cards...")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Generate cards (1)" }).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(invoke).toHaveBeenCalledWith("cancelStep", { slug: "video" });

    finish({ ok: false, error: { kind: "cancelled", message: "The step was cancelled." } });
    expect(await screen.findByText("Cancelled. Your existing work was kept.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Generating cards...")).toBeNull());
  });

  it("lists problems reported while adding links", async () => {
    stubGuio({
      getProject: snapshot(),
      addLinks: { snapshot: snapshot(), problems: ["F1 is blocked (http: HTTP 403). Paste its text."] },
    });
    const user = open();
    await user.type(await screen.findByLabelText("Links, one per line"), "https://a.test");
    await user.click(screen.getByRole("button", { name: "Add links" }));
    expect(await screen.findByText("F1 is blocked (http: HTTP 403). Paste its text.")).toBeTruthy();
  });

  it("shows the running step after reopening a project", async () => {
    stubGuio({ getProject: snapshot({ activeStep: "draft" }) });
    open();
    expect(await screen.findByText("Drafting script...")).toBeTruthy();
  });
});
