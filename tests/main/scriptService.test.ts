import { afterEach, describe, expect, it } from "vitest";
import { ConnectorError } from "../../src/core/connectors/types";
import type { Skeleton } from "../../src/core/domain/schemas";
import { computePointRefs } from "../../src/core/script/staleness";
import {
  draftScriptStep,
  editBlock,
  getBlockHistory,
  restoreVersion,
  retryHumanize,
  rewriteBlockStep,
} from "../../src/main/service/scriptService";
import { buildSnapshot } from "../../src/main/service/snapshot";
import { createHarness, NOW, type Harness } from "./serviceHarness";

const SKELETON: Skeleton = {
  blocks: [
    { id: "opening", title: "Opening", points: [{ id: "a", text: "A", keyPointId: null, sourceIds: [] }] },
    { id: "body", title: "Body", points: [{ id: "b", text: "B", keyPointId: null, sourceIds: [] }] },
  ],
};

const reply = (voiceover: string) => JSON.stringify({ voiceover, onScreen: "Chart" });

let harness: Harness;

afterEach(async () => {
  await harness.cleanup();
});

async function drafted(replies: (string | Error)[]): Promise<void> {
  harness = await createHarness([reply("First"), reply("Second"), ...replies]);
  await harness.store.saveSkeleton(harness.slug, SKELETON);
  await draftScriptStep(harness.ctx, { slug: harness.slug });
}

describe("draftScriptStep", () => {
  it("writes one block per skeleton block with timing and a run record", async () => {
    await drafted([]);
    const snapshot = await buildSnapshot(harness.ctx, harness.slug);
    expect(snapshot.script.blocks.map((block) => block.voiceover)).toEqual(["First", "Second"]);
    expect(snapshot.timing.blockSeconds).toEqual({ "b-opening": 0, "b-body": 0 });
    expect(snapshot.runs).toEqual([{ step: "draft", status: "done", startedAt: NOW }]);
  });

  it("keeps blocks it did not reach when a later block fails", async () => {
    await drafted([reply("Third"), new ConnectorError("failed", "boom")]);
    const { ctx, slug } = harness;
    await expect(draftScriptStep(ctx, { slug })).rejects.toThrow("boom");
    const snapshot = await buildSnapshot(ctx, slug);
    expect(snapshot.script.blocks.map((block) => block.voiceover)).toEqual(["Third", "Second"]);
    expect(snapshot.runs[0]?.status).toBe("failed");
  });

  it("records a cancelled draft as interrupted", async () => {
    await drafted([]);
    const { ctx, slug, store } = harness;
    ctx.createConnector = () => ({
      id: "cancelling",
      restricted: true,
      testConnection: async () => ({ ok: true, message: "" }),
      generate: async () => {
        ctx.steps.cancel(slug);
        throw new ConnectorError("cancelled", "The step was cancelled.");
      },
    });
    await expect(draftScriptStep(ctx, { slug })).rejects.toThrow("cancelled");
    expect((await store.getRuns(slug)).runs[0]?.status).toBe("interrupted");
    expect((await store.getScript(slug)).blocks).toHaveLength(2);
  });
});

describe("rewriteBlockStep", () => {
  it("replaces one block and leaves the others alone", async () => {
    await drafted([reply("Shorter")]);
    const { ctx, slug } = harness;
    const input = { slug, blockId: "b-opening", instruction: "Shorter", confirmOverwrite: false };
    const snapshot = await rewriteBlockStep(ctx, input);
    expect(snapshot.script.blocks.map((block) => block.voiceover)).toEqual(["Shorter", "Second"]);
    expect((await getBlockHistory(ctx, { slug, blockId: "b-opening" })).versions.at(-1)).toMatchObject({
      voiceover: "First",
      reason: "rewrite",
    });
  });

  it("refuses to replace an edited block without confirmation and keeps its text", async () => {
    await drafted([reply("Replaced")]);
    const { ctx, slug } = harness;
    await editBlock(ctx, { slug, blockId: "b-opening", voiceover: "Mine", onScreen: "" });
    const input = { slug, blockId: "b-opening", instruction: "X", confirmOverwrite: false };
    await expect(rewriteBlockStep(ctx, input)).rejects.toThrow("manually edited");
    expect((await buildSnapshot(ctx, slug)).script.blocks[0]?.voiceover).toBe("Mine");
  });

  it("replaces an edited block once confirmed", async () => {
    await drafted([reply("Replaced")]);
    const { ctx, slug } = harness;
    await editBlock(ctx, { slug, blockId: "b-opening", voiceover: "Mine", onScreen: "" });
    const input = { slug, blockId: "b-opening", instruction: "X", confirmOverwrite: true };
    const snapshot = await rewriteBlockStep(ctx, input);
    expect(snapshot.script.blocks[0]).toMatchObject({ voiceover: "Replaced", origin: "generated" });
  });
});

describe("editBlock", () => {
  it("marks the block as edited and stores the previous text", async () => {
    await drafted([]);
    const { ctx, slug } = harness;
    const snapshot = await editBlock(ctx, { slug, blockId: "b-body", voiceover: "Mine", onScreen: "Mine too" });
    expect(snapshot.script.blocks[1]).toMatchObject({ voiceover: "Mine", onScreen: "Mine too", origin: "edited" });
    expect((await getBlockHistory(ctx, { slug, blockId: "b-body" })).versions).toEqual([
      { savedAt: NOW, voiceover: "Second", onScreen: "Chart", reason: "edit" },
    ]);
  });

  it("does nothing when the text did not change", async () => {
    await drafted([]);
    const { ctx, slug } = harness;
    const snapshot = await editBlock(ctx, { slug, blockId: "b-body", voiceover: "Second", onScreen: "Chart" });
    expect(snapshot.script.blocks[1]?.origin).toBe("generated");
    expect((await getBlockHistory(ctx, { slug, blockId: "b-body" })).versions).toEqual([]);
  });

  it("refuses an unknown block", async () => {
    await drafted([]);
    await expect(
      editBlock(harness.ctx, { slug: harness.slug, blockId: "nope", voiceover: "x", onScreen: "" }),
    ).rejects.toThrow("Unknown block: nope");
  });
});

describe("restoreVersion", () => {
  it("restores a version and archives the current text", async () => {
    await drafted([]);
    const { ctx, slug } = harness;
    await editBlock(ctx, { slug, blockId: "b-body", voiceover: "Mine", onScreen: "" });
    const snapshot = await restoreVersion(ctx, { slug, blockId: "b-body", versionIndex: 0 });
    expect(snapshot.script.blocks[1]).toMatchObject({ voiceover: "Second", onScreen: "Chart", origin: "edited" });
    expect((await getBlockHistory(ctx, { slug, blockId: "b-body" })).versions.at(-1)).toEqual({
      savedAt: NOW,
      voiceover: "Mine",
      onScreen: "",
      reason: "restore",
    });
  });

  it("refuses a version that does not exist", async () => {
    await drafted([]);
    await expect(
      restoreVersion(harness.ctx, { slug: harness.slug, blockId: "b-body", versionIndex: 3 }),
    ).rejects.toThrow("Unknown version: 3");
  });
});

describe("humanize", () => {
  async function failedBlock(replies: (string | Error)[]): Promise<void> {
    harness = await createHarness(replies);
    const { store, slug, settings } = harness;
    await settings.save({ ...(await settings.get()), humanizeEnabled: true });
    await store.saveSkeleton(slug, SKELETON);
    await store.saveScript(slug, {
      blocks: [
        {
          id: "b-opening",
          skeletonBlockId: "opening",
          title: "Opening",
          voiceover: "Original text with 42 [F1]",
          onScreen: "",
          pointRefs: computePointRefs(SKELETON.blocks[0] as Skeleton["blocks"][number]),
          origin: "generated",
          humanizeStatus: "failed",
        },
      ],
    });
  }

  it("retries a failed block and stores the pre-humanize text", async () => {
    await failedBlock(["Better text with 42 [F1]"]);
    const { ctx, slug } = harness;
    const snapshot = await retryHumanize(ctx, { slug, blockId: "b-opening" });
    expect(snapshot.script.blocks[0]).toMatchObject({
      voiceover: "Better text with 42 [F1]",
      humanizeStatus: "done",
    });
    expect((await getBlockHistory(ctx, { slug, blockId: "b-opening" })).versions).toEqual([
      { savedAt: NOW, voiceover: "Original text with 42 [F1]", onScreen: "", reason: "humanize" },
    ]);
    expect(snapshot.runs).toEqual([{ step: "humanize", status: "done", startedAt: NOW }]);
  });

  it("keeps the text and the badge when the guard fails again", async () => {
    await failedBlock(["Changed the number to 43 [F1]"]);
    const { ctx, slug } = harness;
    const snapshot = await retryHumanize(ctx, { slug, blockId: "b-opening" });
    expect(snapshot.script.blocks[0]).toMatchObject({
      voiceover: "Original text with 42 [F1]",
      humanizeStatus: "failed",
    });
  });

  it("does nothing while humanize is off", async () => {
    await failedBlock(["Better text with 42 [F1]"]);
    const { ctx, slug, settings, connector } = harness;
    await settings.save({ ...(await settings.get()), humanizeEnabled: false });
    await retryHumanize(ctx, { slug, blockId: "b-opening" });
    expect(connector.requests).toEqual([]);
  });

  it("drafts through humanize when enabled", async () => {
    harness = await createHarness([reply("Text"), "Humanized"]);
    const { ctx, slug, settings, store } = harness;
    await settings.save({ ...(await settings.get()), humanizeEnabled: true });
    await store.saveSkeleton(slug, { blocks: [SKELETON.blocks[0] as Skeleton["blocks"][number]] });
    const snapshot = await draftScriptStep(ctx, { slug });
    expect(snapshot.script.blocks[0]).toMatchObject({ voiceover: "Humanized", humanizeStatus: "done" });
    expect(harness.connector.requests[1]?.system).toContain("bundled rules");
  });
});
