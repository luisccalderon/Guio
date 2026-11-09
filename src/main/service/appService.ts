import { DEFAULT_TEMPLATES } from "../../core/templates/defaults";
import type { IpcService } from "../../shared/ipc";
import type { ServiceContext, ServiceDeps } from "./context";
import {
  draftScriptStep,
  editBlock,
  getBlockHistory,
  restoreVersion,
  retryHumanize,
  rewriteBlockStep,
} from "./scriptService";
import { editSkeleton, proposeSkeletonStep } from "./skeletonService";
import { buildSnapshot } from "./snapshot";
import {
  addLinks,
  addTest,
  editTest,
  generateCards,
  pasteSourceText,
  setKeyPointSelected,
  setSourceDiscarded,
} from "./sourcesService";
import { StepRegistry } from "./stepRegistry";
import { acceptFinding, removeFindingText, runVerificationStep } from "./verifyService";

export interface AppService {
  service: IpcService;
  /** Must run once at launch, before the window opens. */
  startup(): Promise<void>;
}

export function createAppService(deps: ServiceDeps | ServiceContext): AppService {
  const ctx: ServiceContext = "steps" in deps ? deps : { ...deps, steps: new StepRegistry() };

  const service: IpcService = {
    listProjects: () => ctx.store.list(),
    listTemplates: async () => DEFAULT_TEMPLATES,
    createProject: (input) => ctx.store.create(input),
    getProject: ({ slug }) => buildSnapshot(ctx, slug),
    addLinks: (input) => addLinks(ctx, input),
    pasteSourceText: (input) => pasteSourceText(ctx, input),
    addTest: (input) => addTest(ctx, input),
    editTest: (input) => editTest(ctx, input),
    generateCards: (input) => generateCards(ctx, input),
    setSourceDiscarded: (input) => setSourceDiscarded(ctx, input),
    setKeyPointSelected: (input) => setKeyPointSelected(ctx, input),
    proposeSkeleton: (input) => proposeSkeletonStep(ctx, input),
    editSkeleton: (input) => editSkeleton(ctx, input),
    draftScript: (input) => draftScriptStep(ctx, input),
    rewriteBlock: (input) => rewriteBlockStep(ctx, input),
    retryHumanize: (input) => retryHumanize(ctx, input),
    editBlock: (input) => editBlock(ctx, input),
    getBlockHistory: (input) => getBlockHistory(ctx, input),
    restoreVersion: (input) => restoreVersion(ctx, input),
    runVerification: (input) => runVerificationStep(ctx, input),
    acceptFinding: (input) => acceptFinding(ctx, input),
    removeFindingText: (input) => removeFindingText(ctx, input),
    cancelStep: async ({ slug }) => ({ cancelled: ctx.steps.cancel(slug) }),
    getSettings: () => ctx.settings.get(),
    saveSettings: async ({ settings }) => {
      await ctx.settings.save(settings);
      return ctx.settings.get();
    },
    testConnection: ({ connector }) => ctx.createConnector(connector).testConnection(),
  };

  return {
    service,
    async startup() {
      for (const project of await ctx.store.list()) {
        await ctx.store.markRunningAsInterrupted(project.slug);
      }
    },
  };
}
