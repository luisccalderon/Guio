import { z } from "zod";

export const WebSourceIdSchema = z.string().regex(/^F[1-9]\d*$/);
export const TestSourceIdSchema = z.string().regex(/^P[1-9]\d*$/);
export const SourceIdSchema = z.union([WebSourceIdSchema, TestSourceIdSchema]);
export const SafeIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const KeyPointSchema = z.object({
  id: SafeIdSchema,
  text: z.string(),
  quote: z.string(),
  quoteStatus: z.enum(["verified", "unverified"]),
  selected: z.boolean(),
});

const sourceBase = {
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(KeyPointSchema),
  discarded: z.boolean(),
};

export const WebSourceSchema = z.object({
  ...sourceBase,
  kind: z.literal("web"),
  id: WebSourceIdSchema,
  url: z.string().nullable(),
  accessedAt: z.string(),
  text: z.string(),
});

export const TestSourceSchema = z.object({
  ...sourceBase,
  kind: z.literal("test"),
  id: TestSourceIdSchema,
  hardware: z.string(),
  modelVersion: z.string(),
  quantization: z.string(),
  settings: z.string(),
  results: z.string(),
  notes: z.string(),
});

export const SourceSchema = z.discriminatedUnion("kind", [WebSourceSchema, TestSourceSchema]);

export const SkeletonPointSchema = z.object({
  id: SafeIdSchema,
  text: z.string(),
  keyPointId: SafeIdSchema.nullable(),
  sourceIds: z.array(SourceIdSchema),
});

export const SkeletonBlockSchema = z.object({
  id: SafeIdSchema,
  title: z.string(),
  points: z.array(SkeletonPointSchema),
});

export const SkeletonSchema = z.object({ blocks: z.array(SkeletonBlockSchema) });

export const PointRefSchema = z.object({ pointId: SafeIdSchema, hash: z.string() });

export const ScriptBlockSchema = z.object({
  id: SafeIdSchema,
  skeletonBlockId: SafeIdSchema,
  title: z.string(),
  voiceover: z.string(),
  onScreen: z.string(),
  pointRefs: z.array(PointRefSchema),
  origin: z.enum(["generated", "edited"]),
  humanizeStatus: z.enum(["off", "done", "failed"]),
});

export const ScriptSchema = z.object({ blocks: z.array(ScriptBlockSchema) });

export const BlockVersionSchema = z.object({
  savedAt: z.string(),
  voiceover: z.string(),
  onScreen: z.string(),
  reason: z.enum(["draft", "rewrite", "humanize", "edit", "restore"]),
});

export const BlockHistorySchema = z.object({ versions: z.array(BlockVersionSchema) });

export const FindingSchema = z.object({
  id: z.string(),
  blockId: SafeIdSchema,
  kind: z.enum(["number", "claim"]),
  token: z.string(),
  reason: z.enum(["no-citation", "not-in-source", "claim-unsupported"]),
});

export const AcceptanceSchema = z.object({ findingId: z.string(), textHash: z.string() });

export const VerificationSchema = z.object({
  findings: z.array(FindingSchema),
  acceptances: z.array(AcceptanceSchema),
});

export const RunSchema = z.object({
  step: z.enum(["cards", "skeleton", "draft", "rewrite", "humanize", "ai-review", "style-profile"]),
  status: z.enum(["running", "done", "failed", "interrupted"]),
  startedAt: z.string(),
});

export const RunsSchema = z.object({ runs: z.array(RunSchema) });

export const ProjectSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

export const ProjectMetaSchema = z.object({
  schemaVersion: z.literal(1),
  slug: ProjectSlugSchema,
  title: z.string(),
  templateId: SafeIdSchema,
  language: z.string(),
  targetSeconds: z.number().int().positive(),
  createdAt: z.string(),
});

export const TemplateBlockSchema = z.object({
  id: SafeIdSchema,
  title: z.string(),
  guidance: z.string(),
});

export const TemplateSchema = z.object({
  id: SafeIdSchema,
  name: z.string(),
  blocks: z.array(TemplateBlockSchema),
});

export type KeyPoint = z.infer<typeof KeyPointSchema>;
export type WebSource = z.infer<typeof WebSourceSchema>;
export type TestSource = z.infer<typeof TestSourceSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type SkeletonPoint = z.infer<typeof SkeletonPointSchema>;
export type SkeletonBlock = z.infer<typeof SkeletonBlockSchema>;
export type Skeleton = z.infer<typeof SkeletonSchema>;
export type PointRef = z.infer<typeof PointRefSchema>;
export type ScriptBlock = z.infer<typeof ScriptBlockSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type BlockVersion = z.infer<typeof BlockVersionSchema>;
export type BlockHistory = z.infer<typeof BlockHistorySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Acceptance = z.infer<typeof AcceptanceSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Runs = z.infer<typeof RunsSchema>;
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;
export type Template = z.infer<typeof TemplateSchema>;
