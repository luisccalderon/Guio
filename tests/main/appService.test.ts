import { afterEach, describe, expect, it } from "vitest";
import { connectorWithTest, ConnectorError } from "../../src/core/connectors/types";
import { createAppService, type AppService } from "../../src/main/service/appService";
import { IPC_METHODS } from "../../src/shared/ipc";
import { createHarness, NOW, type Harness } from "./serviceHarness";

let harness: Harness;
let app: AppService;

afterEach(async () => {
  await harness.cleanup();
});

async function setup(): Promise<void> {
  harness = await createHarness();
  app = createAppService(harness.ctx);
}

describe("createAppService", () => {
  it("implements every IPC method", async () => {
    await setup();
    expect(Object.keys(app.service).sort()).toEqual([...IPC_METHODS].sort());
  });

  it("marks steps left running as interrupted for every project at launch", async () => {
    await setup();
    const { store, slug } = harness;
    const other = await store.create({ title: "Other", templateId: "news", language: "es", targetSeconds: 60 });
    await store.recordRun(slug, { step: "cards", status: "running", startedAt: NOW });
    await store.recordRun(other.slug, { step: "draft", status: "running", startedAt: NOW });
    await app.startup();
    expect((await store.getRuns(slug)).runs[0]?.status).toBe("interrupted");
    expect((await store.getRuns(other.slug)).runs[0]?.status).toBe("interrupted");
  });

  it("creates and lists projects", async () => {
    await setup();
    const created = await app.service.createProject({
      title: "New one",
      templateId: "comparison",
      language: "es",
      targetSeconds: 300,
    });
    const list = await app.service.listProjects({});
    expect(list.map((item) => item.slug)).toContain(created.slug);
  });

  it("lists the three templates", async () => {
    await setup();
    expect((await app.service.listTemplates({})).map((item) => item.id)).toEqual(["news", "comparison", "model-test"]);
  });

  it("persists settings and returns the normalized value", async () => {
    await setup();
    const settings = await app.service.getSettings({});
    const saved = await app.service.saveSettings({ settings: { ...settings, wordsPerMinute: 170 } });
    expect(saved.wordsPerMinute).toBe(170);
    expect((await app.service.getSettings({})).wordsPerMinute).toBe(170);
  });

  it("tests the connector described by the form, not the saved one", async () => {
    await setup();
    harness.ctx.createConnector = (settings) =>
      connectorWithTest(settings.kind, true, async () => (settings.kind === "ollama" ? "OK" : ""));
    const result = await app.service.testConnection({ connector: { kind: "ollama", model: "m", baseUrl: "" } });
    expect(result).toEqual({ ok: true, message: "Connected." });
  });

  it("runs one AI step per project and cancels it", async () => {
    await setup();
    const { ctx, slug, store } = harness;
    ctx.createConnector = () =>
      connectorWithTest(
        "hang",
        true,
        (_request, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new ConnectorError("cancelled", "The step was cancelled.")));
          }),
      );
    await store.saveSource(slug, {
      kind: "web",
      id: "F1",
      url: null,
      title: "T",
      accessedAt: NOW,
      text: "Body",
      summary: "",
      keyPoints: [],
      discarded: false,
    });

    const running = app.service.generateCards({ slug });
    while ((await app.service.getProject({ slug })).runs[0]?.status !== "running") {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await expect(app.service.proposeSkeleton({ slug })).rejects.toThrow("already running");
    await expect(app.service.setSourceDiscarded({ slug, sourceId: "F1", discarded: true })).rejects.toThrow(
      "already running",
    );
    expect((await app.service.getProject({ slug })).activeStep).toBe("cards");
    await expect(app.service.cancelStep({ slug })).resolves.toEqual({ cancelled: true });
    await expect(running).rejects.toThrow("The step was cancelled.");

    const after = await app.service.getProject({ slug });
    expect(after.activeStep).toBeNull();
    expect(after.runs[0]?.status).toBe("interrupted");
    expect(after.cardPendingIds).toEqual(["F1"]);
  });
});
