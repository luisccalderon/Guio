import { describe, expect, it } from "vitest";
import { channelFor, IPC_METHODS, ipcInputs } from "../../src/shared/ipc";

describe("channelFor", () => {
  it("namespaces every method", () => {
    expect(channelFor("listProjects")).toBe("guio:listProjects");
  });
});

describe("ipcInputs", () => {
  it("lists every operation the screens need", () => {
    expect(IPC_METHODS).toEqual([
      "listProjects",
      "listTemplates",
      "createProject",
      "getProject",
      "addLinks",
      "pasteSourceText",
      "addTest",
      "editTest",
      "generateCards",
      "setSourceDiscarded",
      "setKeyPointSelected",
      "proposeSkeleton",
      "editSkeleton",
      "draftScript",
      "rewriteBlock",
      "retryHumanize",
      "editBlock",
      "getBlockHistory",
      "restoreVersion",
      "runVerification",
      "acceptFinding",
      "removeFindingText",
      "cancelStep",
      "getSettings",
      "saveSettings",
      "testConnection",
    ]);
  });

  it("rejects a slug that could escape the projects folder", () => {
    expect(ipcInputs.getProject.safeParse({ slug: "../secrets" }).success).toBe(false);
    expect(ipcInputs.getProject.safeParse({ slug: "my-video" }).success).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(ipcInputs.getProject.safeParse({ slug: "a", extra: 1 }).success).toBe(false);
  });

  it("trims links and refuses an empty list", () => {
    expect(ipcInputs.addLinks.parse({ slug: "a", urls: [" http://x "] }).urls).toEqual(["http://x"]);
    expect(ipcInputs.addLinks.safeParse({ slug: "a", urls: [] }).success).toBe(false);
  });

  it("only accepts web source ids when pasting text", () => {
    const input = { slug: "a", sourceId: "P1", title: "T", text: "body" };
    expect(ipcInputs.pasteSourceText.safeParse(input).success).toBe(false);
    expect(ipcInputs.pasteSourceText.safeParse({ ...input, sourceId: "F1" }).success).toBe(true);
  });

  it("validates each skeleton edit shape", () => {
    const parse = (edit: unknown) => ipcInputs.editSkeleton.safeParse({ slug: "a", edit }).success;
    expect(parse({ op: "edit-point", pointId: "p", text: "New" })).toBe(true);
    expect(parse({ op: "edit-point", pointId: "p", text: "  " })).toBe(false);
    expect(parse({ op: "move-point", pointId: "p", toBlockId: "b", toIndex: 0 })).toBe(true);
    expect(parse({ op: "move-point", pointId: "p", toBlockId: "b", toIndex: -1 })).toBe(false);
    expect(parse({ op: "add-point", blockId: "b", text: "T", sourceIds: ["F1", "P2"] })).toBe(true);
    expect(parse({ op: "add-point", blockId: "b", text: "T", sourceIds: ["X1"] })).toBe(false);
    expect(parse({ op: "remove-point", pointId: "p" })).toBe(true);
    expect(parse({ op: "explode" })).toBe(false);
  });

  it("requires an explicit overwrite answer when rewriting", () => {
    const input = { slug: "a", blockId: "b", instruction: "Shorter" };
    expect(ipcInputs.rewriteBlock.safeParse(input).success).toBe(false);
    expect(ipcInputs.rewriteBlock.safeParse({ ...input, confirmOverwrite: false }).success).toBe(true);
  });

  it("applies the settings rules to saved settings", () => {
    const settings = { connector: { kind: "opencode-cli", model: "" } };
    const result = ipcInputs.saveSettings.safeParse({ settings });
    expect(result.error?.issues[0]?.message).toBe("Choose a model for OpenCode.");
  });
});
