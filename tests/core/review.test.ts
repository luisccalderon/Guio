import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScriptBlock, Source } from "../../src/core/domain/schemas";
import { generateStyleProfile, runVerification } from "../../src/core/pipeline/review";
import { ProjectStore } from "../../src/core/store/projectStore";
import { fakeConnector, noSignal } from "../helpers/fakeConnector";

const source: Source = {
  kind: "web",
  id: "F1",
  url: null,
  title: "S",
  accessedAt: "2026-11-09T10:00:00.000Z",
  text: "It uses 16 GB.",
  summary: "",
  keyPoints: [
    { id: "F1-k1", text: "Memory", quote: "It uses 16 GB.", quoteStatus: "verified", selected: true },
    { id: "F1-k2", text: "Off", quote: "DISCARDED QUOTE", quoteStatus: "verified", selected: false },
  ],
  discarded: false,
};

function block(id: string, voiceover: string): ScriptBlock {
  return {
    id,
    skeletonBlockId: id,
    title: id,
    voiceover,
    onScreen: "",
    pointRefs: [],
    origin: "generated",
    humanizeStatus: "off",
  };
}

let root: string;
let store: ProjectStore;
let slug: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "guio-review-"));
  store = new ProjectStore(root);
  ({ slug } = await store.create({ title: "V", templateId: "t", language: "es", targetSeconds: 600 }));
  await store.saveSource(slug, source);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function verify(connector: ReturnType<typeof fakeConnector>) {
  return runVerification({
    store,
    slug,
    connector,
    timeoutMs: 1000,
    signal: noSignal,
    now: () => "2026-11-09T12:00:00.000Z",
  });
}

describe("runVerification", () => {
  it("reports numbers and unsupported claims together", async () => {
    await store.saveScript(slug, { blocks: [block("b1", "Usa 32 GB [F1].")] });
    const result = await verify(fakeConnector([JSON.stringify({ claims: [{ claim: "Es el mejor" }] })]));
    expect(result.findings.map((finding) => [finding.kind, finding.token])).toEqual([
      ["number", "32"],
      ["claim", "Es el mejor"],
    ]);
    expect(await store.getVerification(slug)).toEqual(result);
  });

  it("sends only quotes of selected points from cited sources", async () => {
    await store.saveScript(slug, { blocks: [block("b1", "Usa 16 GB [F1].")] });
    const connector = fakeConnector([JSON.stringify({ claims: [] })]);
    await verify(connector);
    expect(connector.requests[0]!.prompt).toContain("It uses 16 GB.");
    expect(connector.requests[0]!.prompt).not.toContain("DISCARDED QUOTE");
  });

  it("skips AI review for a block without citations", async () => {
    await store.saveScript(slug, { blocks: [block("b1", "Sin datos.")] });
    const connector = fakeConnector([JSON.stringify({ claims: [] })]);
    await verify(connector);
    expect(connector.requests).toHaveLength(0);
  });

  it("keeps earlier acceptances", async () => {
    await store.saveScript(slug, { blocks: [block("b1", "Usa 16 GB [F1].")] });
    const acceptances = [{ findingId: "b1:number:9", textHash: "h" }];
    await store.saveVerification(slug, { findings: [], acceptances });
    const result = await verify(fakeConnector([JSON.stringify({ claims: [] })]));
    expect(result.acceptances).toEqual(acceptances);
  });

  it("records the run", async () => {
    await store.saveScript(slug, { blocks: [] });
    await verify(fakeConnector(["{}"]));
    expect((await store.getRuns(slug)).runs[0]).toMatchObject({ step: "ai-review", status: "done" });
  });
});

describe("generateStyleProfile", () => {
  it("returns the description and sends scripts as untrusted data", async () => {
    const connector = fakeConnector(["Frases cortas."]);
    expect(await generateStyleProfile(connector, ["Guion uno"], 1000, noSignal)).toBe("Frases cortas.");
    expect(connector.requests[0]!.prompt).toContain('<untrusted_source id="script-1">');
  });
});
