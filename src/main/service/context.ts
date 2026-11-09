import type { Connector } from "../../core/connectors/types";
import type { Run } from "../../core/domain/schemas";
import type { PageLoader } from "../../core/extractor/extract";
import type { ProjectStore } from "../../core/store/projectStore";
import { connectorOf, type ConnectorSettings } from "../../core/store/settingsSchema";
import type { SettingsStore } from "../../core/store/settingsStore";
import type { StepRegistry } from "./stepRegistry";

export const AI_TIMEOUT_MS = 600_000;

export interface ServiceDeps {
  store: ProjectStore;
  settings: SettingsStore;
  createConnector(settings: ConnectorSettings): Connector;
  loaders: PageLoader[];
  bundledHumanizeRules: string;
  now(): string;
}

export interface ServiceContext extends ServiceDeps {
  steps: StepRegistry;
}

export async function configuredConnector(ctx: ServiceContext): Promise<Connector> {
  return ctx.createConnector(connectorOf(await ctx.settings.get()));
}

/** Runs one cancellable AI step and records it. A cancelled step is stored as interrupted so it can be rerun. */
export function trackedStep<T>(
  ctx: ServiceContext,
  slug: string,
  step: Run["step"],
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return ctx.steps.runStep(slug, step, async (signal) => {
    const startedAt = ctx.now();
    await ctx.store.recordRun(slug, { step, status: "running", startedAt });
    try {
      const result = await work(signal);
      await ctx.store.recordRun(slug, { step, status: "done", startedAt });
      return result;
    } catch (error) {
      await ctx.store.recordRun(slug, { step, status: signal.aborted ? "interrupted" : "failed", startedAt });
      throw error;
    }
  });
}
