import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConnectorError } from "../../src/core/connectors/types";
import { humanizeVoiceover } from "../../src/core/pipeline/humanize";
import { effectiveHumanizeRules, SettingsStore } from "../../src/core/store/settingsStore";
import { fakeConnector, noSignal } from "../helpers/fakeConnector";

const base = {
  voiceover: "Llegó a 42 tokens [P1].",
  previousVoiceover: "Bloque anterior.",
  language: "es",
  styleProfile: null,
  rules: "RULES",
  timeoutMs: 1000,
};

describe("humanizeVoiceover", () => {
  it("accepts a rewrite that keeps marks and numbers", async () => {
    const connector = fakeConnector(["Alcanzó 42 tokens [P1]."]);
    expect(await humanizeVoiceover({ ...base, connector }, noSignal)).toEqual({
      voiceover: "Alcanzó 42 tokens [P1].",
      status: "done",
    });
  });

  it("sends the rules, embedded mode, and read-only context", async () => {
    const connector = fakeConnector(["Alcanzó 42 tokens [P1]."]);
    await humanizeVoiceover({ ...base, connector }, noSignal);
    const request = connector.requests[0]!;
    expect(request.system).toContain("RULES");
    expect(request.system).toContain("embedded mode");
    expect(request.prompt).toContain("Bloque anterior.");
    expect(request.prompt).toContain("spoken video script");
  });

  it("passes the style profile as the writing sample", async () => {
    const connector = fakeConnector(["Alcanzó 42 tokens [P1]."]);
    await humanizeVoiceover({ ...base, styleProfile: "Frases cortas", connector }, noSignal);
    expect(connector.requests[0]!.prompt).toContain("Writing sample to match:\nFrases cortas");
  });

  it("retries once listing what changed", async () => {
    const connector = fakeConnector(["Llegó a 43 tokens.", "Alcanzó 42 tokens [P1]."]);
    const result = await humanizeVoiceover({ ...base, connector }, noSignal);
    expect(result.status).toBe("done");
    expect(connector.requests[1]!.prompt).toContain("43");
    expect(connector.requests[1]!.prompt).toContain("P1");
  });

  it("keeps the original text when the guard fails twice", async () => {
    const connector = fakeConnector(["Sin nada.", "Tampoco."]);
    expect(await humanizeVoiceover({ ...base, connector }, noSignal)).toEqual({
      voiceover: base.voiceover,
      status: "failed",
    });
    expect(connector.requests).toHaveLength(2);
  });

  it("keeps the original text on a connector failure", async () => {
    const connector = fakeConnector([new ConnectorError("failed", "down")]);
    expect((await humanizeVoiceover({ ...base, connector }, noSignal)).status).toBe("failed");
  });

  it("propagates cancellation", async () => {
    const connector = fakeConnector([new ConnectorError("cancelled", "stop")]);
    await expect(humanizeVoiceover({ ...base, connector }, noSignal)).rejects.toMatchObject({ kind: "cancelled" });
  });
});

describe("SettingsStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "guio-settings-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("has humanize off by default", async () => {
    expect(await new SettingsStore(dir).get()).toEqual({
      humanizeEnabled: false,
      humanizeRules: null,
      wordsPerMinute: 150,
      theme: "system",
    });
  });

  it("persists changes", async () => {
    const store = new SettingsStore(dir);
    await store.save({ humanizeEnabled: true, humanizeRules: "mine", wordsPerMinute: 160, theme: "system" });
    expect((await new SettingsStore(dir).get()).humanizeEnabled).toBe(true);
  });

  it("uses edited rules over the bundled copy, and the bundled copy after a reset", () => {
    expect(effectiveHumanizeRules({ humanizeEnabled: true, humanizeRules: "mine", wordsPerMinute: 150, theme: "system" }, "bundled")).toBe("mine");
    expect(effectiveHumanizeRules({ humanizeEnabled: true, humanizeRules: null, wordsPerMinute: 150, theme: "system" }, "bundled")).toBe("bundled");
  });
});

describe("bundled rules", () => {
  it("ships with the rules and the license", () => {
    expect(existsSync(join(process.cwd(), "resources/humanizer/SKILL.md"))).toBe(true);
    expect(existsSync(join(process.cwd(), "resources/humanizer/LICENSE"))).toBe(true);
  });
});
