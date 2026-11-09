import { afterEach, describe, expect, it } from "vitest";
import { computePointRefs } from "../../src/core/script/staleness";
import type { ScriptBlock, Skeleton } from "../../src/core/domain/schemas";
import { hashText } from "../../src/core/hash";
import { editBlock, getBlockHistory } from "../../src/main/service/scriptService";
import { buildSnapshot } from "../../src/main/service/snapshot";
import {
  acceptFinding,
  removeFindingText,
  removeSentenceContaining,
  runVerificationStep,
} from "../../src/main/service/verifyService";
import { createHarness, NOW, type Harness } from "./serviceHarness";

const SKELETON: Skeleton = {
  blocks: [{ id: "body", title: "Body", points: [{ id: "a", text: "A", keyPointId: null, sourceIds: ["F1"] }] }],
};

const FINDING = "b-body:number:99";
const VOICEOVER = "It reaches 42 tokens [F1]. It also uses 99 GB [F1]. Nothing else.";

let harness: Harness;

afterEach(async () => {
  await harness?.cleanup();
});

async function withScript(replies: string[] = [JSON.stringify({ claims: [] })], voiceover = VOICEOVER): Promise<void> {
  harness = await createHarness(replies);
  const { store, slug } = harness;
  await store.saveSource(slug, {
    kind: "web",
    id: "F1",
    url: "https://a.test",
    title: "Article",
    accessedAt: NOW,
    text: "The model reaches 42 tokens per second.",
    summary: "S",
    keyPoints: [{ id: "F1-k1", text: "Fast", quote: "reaches 42 tokens", quoteStatus: "verified", selected: true }],
    discarded: false,
  });
  await store.saveSkeleton(slug, SKELETON);
  const block: ScriptBlock = {
    id: "b-body",
    skeletonBlockId: "body",
    title: "Body",
    voiceover,
    onScreen: "",
    pointRefs: computePointRefs(SKELETON.blocks[0] as Skeleton["blocks"][number]),
    origin: "generated",
    humanizeStatus: "off",
  };
  await store.saveScript(slug, { blocks: [block] });
}

describe("removeSentenceContaining", () => {
  it("removes only the sentence holding the token", () => {
    expect(removeSentenceContaining(VOICEOVER, "99")).toBe("It reaches 42 tokens [F1]. Nothing else.");
  });

  it("does not match a digit inside a longer number", () => {
    expect(removeSentenceContaining("Uses 199 GB. Uses 99 GB.", "99")).toBe("Uses 199 GB.");
  });

  it("keeps a decimal token whole", () => {
    expect(removeSentenceContaining("Now 7.5 GB. Later 8 GB.", "7.5")).toBe("Later 8 GB.");
  });

  it("returns null when the token is gone", () => {
    expect(removeSentenceContaining("Nothing here.", "99")).toBeNull();
  });
});

describe("runVerificationStep", () => {
  it("flags unsupported numbers and records the run", async () => {
    await withScript();
    const snapshot = await runVerificationStep(harness.ctx, { slug: harness.slug });
    expect(snapshot.verification.findings.map((finding) => finding.id)).toEqual([FINDING]);
    expect(snapshot.exportGate.allowed).toBe(false);
    expect(snapshot.runs).toEqual([{ step: "ai-review", status: "done", startedAt: NOW }]);
  });

  it("warns on AI findings without blocking export", async () => {
    await withScript([JSON.stringify({ claims: [{ claim: "Overstated" }] })], "It reaches 42 tokens [F1].");
    const snapshot = await runVerificationStep(harness.ctx, { slug: harness.slug });
    expect(snapshot.exportGate.allowed).toBe(true);
    expect(snapshot.openFindings.map((finding) => finding.kind)).toEqual(["claim"]);
  });
});

describe("acceptFinding", () => {
  it("stores the block text hash and opens the gate", async () => {
    await withScript();
    const { ctx, slug } = harness;
    await runVerificationStep(ctx, { slug });
    const snapshot = await acceptFinding(ctx, { slug, findingId: FINDING });
    expect(snapshot.verification.acceptances).toEqual([{ findingId: FINDING, textHash: hashText(VOICEOVER) }]);
    expect(snapshot.exportGate.allowed).toBe(true);
    expect(snapshot.openFindings).toEqual([]);
  });

  it("is voided when the block text changes", async () => {
    await withScript();
    const { ctx, slug } = harness;
    await runVerificationStep(ctx, { slug });
    await acceptFinding(ctx, { slug, findingId: FINDING });
    const snapshot = await editBlock(ctx, { slug, blockId: "b-body", voiceover: `${VOICEOVER} More.`, onScreen: "" });
    expect(snapshot.exportGate.allowed).toBe(false);
    expect(snapshot.exportGate.blocking.map((finding) => finding.id)).toEqual([FINDING]);
  });

  it("replaces an older acceptance instead of piling up", async () => {
    await withScript();
    const { ctx, slug } = harness;
    await runVerificationStep(ctx, { slug });
    await acceptFinding(ctx, { slug, findingId: FINDING });
    await editBlock(ctx, { slug, blockId: "b-body", voiceover: `${VOICEOVER} More.`, onScreen: "" });
    const snapshot = await acceptFinding(ctx, { slug, findingId: FINDING });
    expect(snapshot.verification.acceptances).toHaveLength(1);
    expect(snapshot.exportGate.allowed).toBe(true);
  });

  it("refuses an unknown finding", async () => {
    await withScript();
    await expect(acceptFinding(harness.ctx, { slug: harness.slug, findingId: "nope" })).rejects.toThrow(
      "This finding is no longer open.",
    );
  });
});

describe("removeFindingText", () => {
  it("removes the sentence, marks the block edited, and clears the gate", async () => {
    await withScript();
    const { ctx, slug } = harness;
    await runVerificationStep(ctx, { slug });
    const snapshot = await removeFindingText(ctx, { slug, findingId: FINDING });
    expect(snapshot.script.blocks[0]).toMatchObject({
      voiceover: "It reaches 42 tokens [F1]. Nothing else.",
      origin: "edited",
    });
    expect(snapshot.exportGate.allowed).toBe(true);
    expect((await getBlockHistory(ctx, { slug, blockId: "b-body" })).versions[0]?.voiceover).toBe(VOICEOVER);
  });

  it("explains when a claim cannot be located verbatim and changes nothing", async () => {
    await withScript([JSON.stringify({ claims: [{ claim: "A paraphrase" }] })], "It reaches 42 tokens [F1].");
    const { ctx, slug } = harness;
    const { openFindings } = await runVerificationStep(ctx, { slug });
    await expect(removeFindingText(ctx, { slug, findingId: openFindings[0]?.id ?? "" })).rejects.toThrow(
      "This text was not found in the block. Correct it by hand.",
    );
    expect((await buildSnapshot(ctx, slug)).script.blocks[0]?.origin).toBe("generated");
  });
});
