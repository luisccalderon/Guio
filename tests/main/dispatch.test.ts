import { describe, expect, it, vi } from "vitest";
import { ConnectorError } from "../../src/core/connectors/types";
import { InvalidOutputError } from "../../src/core/pipeline/structured";
import { dispatch, registerIpc } from "../../src/main/ipc/dispatch";
import { BusyError } from "../../src/main/service/stepRegistry";
import { channelFor, IPC_METHODS, type IpcService } from "../../src/shared/ipc";

function serviceWith(partial: Partial<IpcService>): IpcService {
  return partial as IpcService;
}

describe("dispatch", () => {
  it("passes validated input to the service and returns its value", async () => {
    const getProject = vi.fn(async () => "snapshot" as never);
    const result = await dispatch(serviceWith({ getProject }), "getProject", { slug: "video" });
    expect(result).toEqual({ ok: true, value: "snapshot" });
    expect(getProject).toHaveBeenCalledWith({ slug: "video" });
  });

  it("refuses invalid input before the service runs", async () => {
    const getProject = vi.fn();
    const result = await dispatch(serviceWith({ getProject }), "getProject", { slug: "../etc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-input");
    }
    expect(getProject).not.toHaveBeenCalled();
  });

  it("reports the schema's own message", async () => {
    const saveSettings = vi.fn();
    const settings = { connector: { kind: "opencode-cli", model: "" } };
    const result = await dispatch(serviceWith({ saveSettings }), "saveSettings", { settings });
    expect(result).toEqual({ ok: false, error: { kind: "invalid-input", message: "Choose a model for OpenCode." } });
  });

  it.each([
    [new BusyError("cards"), "busy"],
    [new ConnectorError("cancelled", "The step was cancelled."), "cancelled"],
    [new ConnectorError("timeout", "No reply"), "failed"],
    [new Error("boom"), "failed"],
  ])("maps %s", async (error, kind) => {
    const getProject = vi.fn(async () => {
      throw error;
    });
    const result = await dispatch(serviceWith({ getProject }), "getProject", { slug: "video" });
    expect(result).toEqual({ ok: false, error: { kind, message: error.message } });
  });

  it("carries the raw model output of an invalid reply", async () => {
    const generateCards = vi.fn(async () => {
      throw new InvalidOutputError("bad", "raw text");
    });
    const result = await dispatch(serviceWith({ generateCards }), "generateCards", { slug: "video" });
    expect(result).toEqual({ ok: false, error: { kind: "failed", message: "bad", raw: "raw text" } });
  });
});

describe("registerIpc", () => {
  function registered(trusted: boolean) {
    const handlers = new Map<string, (event: { sender: unknown }, input: unknown) => Promise<unknown>>();
    const getProject = vi.fn(async () => "snapshot" as never);
    registerIpc({ handle: (channel, listener) => handlers.set(channel, listener) }, serviceWith({ getProject }), () => trusted);
    return { handlers, getProject };
  }

  it("registers one namespaced channel per method", () => {
    expect([...registered(true).handlers.keys()]).toEqual(IPC_METHODS.map(channelFor));
  });

  it("serves the trusted window", async () => {
    const { handlers } = registered(true);
    const handler = handlers.get(channelFor("getProject"));
    await expect(handler?.({ sender: {} }, { slug: "video" })).resolves.toEqual({ ok: true, value: "snapshot" });
  });

  it("refuses any other sender", async () => {
    const { handlers, getProject } = registered(false);
    const handler = handlers.get(channelFor("getProject"));
    await expect(handler?.({ sender: {} }, { slug: "video" })).resolves.toEqual({
      ok: false,
      error: { kind: "failed", message: "Unknown caller." },
    });
    expect(getProject).not.toHaveBeenCalled();
  });
});
