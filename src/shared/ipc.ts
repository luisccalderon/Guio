import { z } from "zod";
import type { ConnectionResult } from "../core/connectors/types";
import {
  ProjectSlugSchema,
  SafeIdSchema,
  SourceIdSchema,
  TestSourceIdSchema,
  WebSourceIdSchema,
  type BlockHistory,
  type Finding,
  type ProjectMeta,
  type Run,
  type Script,
  type Skeleton,
  type Source,
  type Template,
  type Verification,
} from "../core/domain/schemas";
import { AppSettingsSchema, ConnectorSettingsSchema, type AppSettings } from "../core/store/settingsSchema";

const NonEmpty = z.string().trim().min(1);
const WithSlug = { slug: ProjectSlugSchema };

export const TestFieldsSchema = z.strictObject({
  title: NonEmpty,
  hardware: z.string(),
  modelVersion: z.string(),
  quantization: z.string(),
  settings: z.string(),
  results: z.string(),
  notes: z.string(),
});

export const SkeletonEditSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("edit-point"), pointId: SafeIdSchema, text: NonEmpty }),
  z.strictObject({
    op: z.literal("move-point"),
    pointId: SafeIdSchema,
    toBlockId: SafeIdSchema,
    toIndex: z.number().int().nonnegative(),
  }),
  z.strictObject({
    op: z.literal("add-point"),
    blockId: SafeIdSchema,
    text: NonEmpty,
    sourceIds: z.array(SourceIdSchema),
  }),
  z.strictObject({ op: z.literal("remove-point"), pointId: SafeIdSchema }),
]);

export const ipcInputs = {
  listProjects: z.strictObject({}),
  listTemplates: z.strictObject({}),
  createProject: z.strictObject({
    title: NonEmpty,
    templateId: SafeIdSchema,
    language: NonEmpty,
    targetSeconds: z.number().int().positive(),
  }),
  getProject: z.strictObject(WithSlug),
  addLinks: z.strictObject({ ...WithSlug, urls: z.array(NonEmpty).min(1).max(50) }),
  pasteSourceText: z.strictObject({ ...WithSlug, sourceId: WebSourceIdSchema, title: NonEmpty, text: NonEmpty }),
  addTest: z.strictObject({ ...WithSlug, fields: TestFieldsSchema }),
  editTest: z.strictObject({ ...WithSlug, sourceId: TestSourceIdSchema, fields: TestFieldsSchema }),
  generateCards: z.strictObject(WithSlug),
  setSourceDiscarded: z.strictObject({ ...WithSlug, sourceId: SourceIdSchema, discarded: z.boolean() }),
  setKeyPointSelected: z.strictObject({
    ...WithSlug,
    sourceId: SourceIdSchema,
    keyPointId: SafeIdSchema,
    selected: z.boolean(),
    approveUnverified: z.boolean(),
  }),
  proposeSkeleton: z.strictObject(WithSlug),
  editSkeleton: z.strictObject({ ...WithSlug, edit: SkeletonEditSchema }),
  draftScript: z.strictObject(WithSlug),
  rewriteBlock: z.strictObject({
    ...WithSlug,
    blockId: SafeIdSchema,
    instruction: NonEmpty,
    confirmOverwrite: z.boolean(),
  }),
  retryHumanize: z.strictObject({ ...WithSlug, blockId: SafeIdSchema }),
  editBlock: z.strictObject({ ...WithSlug, blockId: SafeIdSchema, voiceover: z.string(), onScreen: z.string() }),
  getBlockHistory: z.strictObject({ ...WithSlug, blockId: SafeIdSchema }),
  restoreVersion: z.strictObject({
    ...WithSlug,
    blockId: SafeIdSchema,
    versionIndex: z.number().int().nonnegative(),
  }),
  runVerification: z.strictObject(WithSlug),
  acceptFinding: z.strictObject({ ...WithSlug, findingId: NonEmpty }),
  removeFindingText: z.strictObject({ ...WithSlug, findingId: NonEmpty }),
  cancelStep: z.strictObject(WithSlug),
  getSettings: z.strictObject({}),
  saveSettings: z.strictObject({ settings: AppSettingsSchema }),
  testConnection: z.strictObject({ connector: ConnectorSettingsSchema }),
} as const;

export type ActiveStep = "links" | Run["step"];

export interface ExportGateState {
  allowed: boolean;
  blocking: Finding[];
}

export interface ProjectSnapshot {
  meta: ProjectMeta;
  sources: Source[];
  skeleton: Skeleton;
  script: Script;
  verification: Verification;
  runs: Run[];
  activeStep: ActiveStep | null;
  /** Sources that "Generate cards" would process. */
  cardPendingIds: string[];
  staleBlockIds: string[];
  /** Live number findings plus AI review findings the user has not accepted. */
  openFindings: Finding[];
  exportGate: ExportGateState;
  timing: { blockSeconds: Record<string, number>; totalSeconds: number };
  humanizeEnabled: boolean;
}

export interface AddLinksOutput {
  snapshot: ProjectSnapshot;
  /** One message per link that was refused or needs its text pasted. */
  problems: string[];
}

export interface IpcOutputs {
  listProjects: ProjectMeta[];
  listTemplates: Template[];
  createProject: ProjectMeta;
  getProject: ProjectSnapshot;
  addLinks: AddLinksOutput;
  pasteSourceText: ProjectSnapshot;
  addTest: ProjectSnapshot;
  editTest: ProjectSnapshot;
  generateCards: ProjectSnapshot;
  setSourceDiscarded: ProjectSnapshot;
  setKeyPointSelected: ProjectSnapshot;
  proposeSkeleton: ProjectSnapshot;
  editSkeleton: ProjectSnapshot;
  draftScript: ProjectSnapshot;
  rewriteBlock: ProjectSnapshot;
  retryHumanize: ProjectSnapshot;
  editBlock: ProjectSnapshot;
  getBlockHistory: BlockHistory;
  restoreVersion: ProjectSnapshot;
  runVerification: ProjectSnapshot;
  acceptFinding: ProjectSnapshot;
  removeFindingText: ProjectSnapshot;
  cancelStep: { cancelled: boolean };
  getSettings: AppSettings;
  saveSettings: AppSettings;
  testConnection: ConnectionResult;
}

export type IpcMethod = keyof typeof ipcInputs;
export type IpcInput<M extends IpcMethod> = z.input<(typeof ipcInputs)[M]>;
export type IpcParsedInput<M extends IpcMethod> = z.output<(typeof ipcInputs)[M]>;
export type IpcOutput<M extends IpcMethod> = IpcOutputs[M];
export type SkeletonEdit = z.output<typeof SkeletonEditSchema>;
export type TestFields = z.output<typeof TestFieldsSchema>;

/** Methods whose result updates the open project. */
export type SnapshotMethod = {
  [M in IpcMethod]: IpcOutputs[M] extends ProjectSnapshot | AddLinksOutput ? M : never;
}[IpcMethod];

export type IpcService = {
  [M in IpcMethod]: (input: IpcParsedInput<M>) => Promise<IpcOutput<M>>;
};

export interface IpcError {
  kind: "invalid-input" | "busy" | "cancelled" | "failed";
  message: string;
  /** The model's last reply, when its output failed validation. */
  raw?: string;
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError };

export interface GuioBridge {
  invoke<M extends IpcMethod>(method: M, input: IpcInput<M>): Promise<IpcResult<IpcOutput<M>>>;
}

export const IPC_METHODS = Object.keys(ipcInputs) as IpcMethod[];

export function channelFor(method: IpcMethod): string {
  return `guio:${method}`;
}
