import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PageLoader } from "../../src/core/extractor/extract";
import { ProjectStore } from "../../src/core/store/projectStore";
import { SettingsStore } from "../../src/core/store/settingsStore";
import type { Connector } from "../../src/core/connectors/types";
import type { ServiceContext } from "../../src/main/service/context";
import { StepRegistry } from "../../src/main/service/stepRegistry";
import { fakeConnector, type FakeConnector } from "../helpers/fakeConnector";

export interface Harness {
  ctx: ServiceContext;
  store: ProjectStore;
  settings: SettingsStore;
  connector: FakeConnector;
  slug: string;
  cleanup(): Promise<void>;
}

export const NOW = "2026-11-09T10:00:00.000Z";

export function articleHtml(title: string): string {
  const paragraph = "The new model runs well on consumer hardware and reaches 42 tokens per second in this review. ";
  return `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${paragraph.repeat(12)}</p></article></body></html>`;
}

export async function createHarness(
  replies: (string | Error)[] = [],
  options: { loaders?: PageLoader[]; connector?: Connector } = {},
): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "guio-service-"));
  const projects = join(root, "projects");
  const user = join(root, "user");
  await mkdir(projects, { recursive: true });
  await mkdir(user, { recursive: true });
  const store = new ProjectStore(projects);
  const settings = new SettingsStore(user);
  const connector = fakeConnector(replies);
  const ctx: ServiceContext = {
    store,
    settings,
    createConnector: () => options.connector ?? connector,
    loaders: options.loaders ?? [],
    bundledHumanizeRules: "bundled rules",
    now: () => NOW,
    steps: new StepRegistry(),
  };
  const meta = await store.create({ title: "Test video", templateId: "news", language: "es", targetSeconds: 600 });
  return {
    ctx,
    store,
    settings,
    connector,
    slug: meta.slug,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
