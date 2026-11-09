# Guio Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test Guio's framework-free core: domain schemas, every deterministic check, staleness, export gating, project storage, and default templates.

**Architecture:** All code lives in `src/core` and imports nothing from Electron or React, so later plans can call it from the main process. Each check is a pure function with one file and one test file. Storage is the only module that touches the disk, and every write is atomic and schema-validated.

**Tech Stack:** TypeScript 7, Vitest 5, Zod 4, Node 24.

**Spec:** `docs/superpowers/specs/2026-11-09-guio-design.md`

---

## Plan Series

The spec covers several subsystems, so it is delivered as four plans. Each one ends in software that can be tested on its own.

| Plan | Delivers | Spec sections |
|------|----------|---------------|
| **1. Core engine (this plan)** | Schemas, checks, staleness, export gate, storage, templates | 3, 4, 6, 8 (code checks) |
| 2. AI and sources | Connectors, Extractor, Pipeline, Humanize step | 5, 7, 8 (AI review), 10 |
| 3. Desktop app | Electron shell, typed IPC, three-pane UI, all screens | 2, 5, 9 |
| 4. Finish | Export to PDF and Markdown, settings, installer, end-to-end test | 11, 12 |

Facts confirmed while planning, for use in Plan 2:

- Claude CLI 2.1.319 documents `claude -p` with piped stdin, `--tools ""`, `--disallowedTools "mcp__*"`, `--strict-mcp-config`, `--no-session-persistence`, and `--system-prompt-file`. Use the file form, because the humanizer rules are too long for a Windows command line.
- `opencode run` has no flag that disables tools, and its `--auto` flag must never be used. Plan 2 must determine whether a restricted `--agent` can be supplied; if not, the spec's first-use warning applies.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/core/domain/schemas.ts` | Zod schemas and inferred types for all persisted data |
| `src/core/domain/sourceText.ts` | Searchable text of a web source or personal test |
| `src/core/hash.ts` | SHA-256 of a string |
| `src/core/verify/marks.ts` | Find and strip `[F1]` / `[P1]` reference marks |
| `src/core/verify/numbers.ts` | Numeric token extraction and locale-tolerant matching |
| `src/core/verify/quote.ts` | Literal quote check after normalization |
| `src/core/verify/numberCheck.ts` | Per-block number findings |
| `src/core/verify/exportGate.ts` | Decide whether export is allowed |
| `src/core/humanize/guard.ts` | Compare protected tokens before and after humanizing |
| `src/core/script/timing.ts` | Word count and duration |
| `src/core/script/staleness.ts` | Detect blocks whose skeleton points changed |
| `src/core/store/atomicWrite.ts` | Temp-file-then-rename writes |
| `src/core/store/projectStore.ts` | Project folders on disk |
| `src/core/templates/defaults.ts` | The three built-in templates |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Create the project files**

File: `package.json`

```json
{
  "name": "guio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@types/node": "^26.6.6",
    "typescript": "^7.0.2",
    "vitest": "^5.1.0"
  }
}
```

File: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

File: `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

File: `.gitignore`

```gitignore
node_modules/
out/
dist/
.superpowers/
```

- [ ] **Step 2: Install and confirm the runner works**

Run: `npm install`
Then run: `npx vitest run --passWithNoTests`
Expected: exits 0 and reports no test files.

- [ ] **Step 3: Initialize git and commit**

```bash
git init
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore docs
git commit -m "chore: scaffold project with spec and core plan"
```

---

### Task 2: Domain schemas and hashing

**Files:**
- Create: `src/core/hash.ts`, `src/core/domain/schemas.ts`, `src/core/domain/sourceText.ts`
- Test: `tests/core/domain.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/domain.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SourceSchema, ProjectMetaSchema } from "../../src/core/domain/schemas";
import { sourceSearchText } from "../../src/core/domain/sourceText";
import { hashText } from "../../src/core/hash";

const web = {
  kind: "web" as const,
  id: "F1",
  url: "https://example.com/a",
  title: "Launch",
  accessedAt: "2026-11-09T10:00:00.000Z",
  text: "The model has 16 GB of weights.",
  summary: "",
  keyPoints: [],
  discarded: false,
};

const test_ = {
  kind: "test" as const,
  id: "P1",
  title: "Speed",
  hardware: "RTX 4090",
  modelVersion: "1.2",
  quantization: "Q4",
  settings: "ctx 8192",
  results: "42 tokens per second",
  notes: "stable",
  summary: "",
  keyPoints: [],
  discarded: false,
};

describe("SourceSchema", () => {
  it("accepts web and test sources", () => {
    expect(SourceSchema.parse(web).id).toBe("F1");
    expect(SourceSchema.parse(test_).id).toBe("P1");
  });

  it("rejects a web source with a test id", () => {
    expect(() => SourceSchema.parse({ ...web, id: "P1" })).toThrow();
  });

  it("rejects an id that could escape a folder", () => {
    expect(() => SourceSchema.parse({ ...web, id: "../F1" })).toThrow();
  });
});

describe("ProjectMetaSchema", () => {
  it("rejects an unknown schema version", () => {
    expect(() =>
      ProjectMetaSchema.parse({
        schemaVersion: 2,
        slug: "a",
        title: "A",
        templateId: "news",
        language: "es",
        targetSeconds: 600,
        createdAt: "2026-11-09T10:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("sourceSearchText", () => {
  it("returns the extracted text of a web source", () => {
    expect(sourceSearchText(SourceSchema.parse(web))).toBe(web.text);
  });

  it("includes every factual field of a personal test", () => {
    const text = sourceSearchText(SourceSchema.parse(test_));
    for (const value of ["RTX 4090", "1.2", "Q4", "ctx 8192", "42 tokens per second", "stable"]) {
      expect(text).toContain(value);
    }
  });
});

describe("hashText", () => {
  it("is stable and sensitive to content", () => {
    expect(hashText("a")).toBe(hashText("a"));
    expect(hashText("a")).not.toBe(hashText("b"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/domain.test.ts`
Expected: FAIL because `src/core/domain/schemas` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/hash.ts`

```ts
import { createHash } from "node:crypto";

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
```

File: `src/core/domain/schemas.ts`

```ts
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
```

File: `src/core/domain/sourceText.ts`

```ts
import type { Source } from "./schemas";

export function sourceSearchText(source: Source): string {
  if (source.kind === "web") {
    return source.text;
  }
  return [
    source.title,
    source.hardware,
    source.modelVersion,
    source.quantization,
    source.settings,
    source.results,
    source.notes,
  ].join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/domain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/hash.ts src/core/domain tests/core/domain.test.ts
git commit -m "feat: add domain schemas and source text"
```

---

### Task 3: Reference marks and number matching

**Files:**
- Create: `src/core/verify/marks.ts`, `src/core/verify/numbers.ts`
- Test: `tests/core/numbers.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/numbers.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { extractMarks, stripMarks } from "../../src/core/verify/marks";
import { extractNumbers, numbersMatch } from "../../src/core/verify/numbers";

function only(text: string) {
  const tokens = extractNumbers(text);
  expect(tokens).toHaveLength(1);
  return tokens[0]!;
}

describe("marks", () => {
  it("finds unique marks in order", () => {
    expect(extractMarks("a [F2] b [P1] c [F2]")).toEqual(["F2", "P1"]);
  });

  it("ignores text that only resembles a mark", () => {
    expect(extractMarks("[X] [F0] [Q1]")).toEqual([]);
  });

  it("strips marks", () => {
    expect(stripMarks("a [F2] b")).toBe("a   b");
  });
});

describe("extractNumbers", () => {
  it("ignores digits inside reference marks", () => {
    expect(extractNumbers("Según la ficha [F12]")).toEqual([]);
  });

  it("captures a number attached to a unit", () => {
    expect(only("Usa 16GB de memoria").raw).toBe("16");
  });

  it("does not treat a label with a leading letter as a number", () => {
    expect(extractNumbers("Cuantización Q4 y versión v2.1")).toEqual([]);
  });

  it("does not include sentence punctuation", () => {
    expect(only("Llegó a 42.").raw).toBe("42");
  });

  it("reports a repeated number once", () => {
    expect(extractNumbers("42 y otra vez 42")).toHaveLength(1);
  });
});

describe("numbersMatch", () => {
  it("matches a decimal comma with a decimal point", () => {
    expect(numbersMatch(only("7,5"), only("7.5"))).toBe(true);
  });

  it("matches equal values with trailing zeros", () => {
    expect(numbersMatch(only("7,50"), only("7.5"))).toBe(true);
  });

  it("tries both readings of an ambiguous separator", () => {
    expect(numbersMatch(only("1,000"), only("1000"))).toBe(true);
    expect(numbersMatch(only("1,000"), only("1"))).toBe(true);
  });

  it("matches thousands in both locales", () => {
    expect(numbersMatch(only("1.234,56"), only("1,234.56"))).toBe(true);
    expect(numbersMatch(only("1.000.000"), only("1,000,000"))).toBe(true);
  });

  it("does not match different values", () => {
    expect(numbersMatch(only("7,5"), only("7.6"))).toBe(false);
  });

  it("treats a version string as literal", () => {
    expect(numbersMatch(only("3.5.1"), only("3.5.1"))).toBe(true);
    expect(numbersMatch(only("3.5.1"), only("3.5"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/numbers.test.ts`
Expected: FAIL because `src/core/verify/marks` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/verify/marks.ts`

```ts
const MARK_PATTERN = /\[([FP][1-9]\d*)\]/g;

export function extractMarks(text: string): string[] {
  const found = Array.from(text.matchAll(MARK_PATTERN), (match) => match[1] ?? "");
  return [...new Set(found)];
}

export function stripMarks(text: string): string {
  return text.replace(MARK_PATTERN, " ");
}
```

File: `src/core/verify/numbers.ts`

```ts
import { stripMarks } from "./marks";

export interface NumberToken {
  raw: string;
  readings: string[];
}

const NUMBER_PATTERN = /(?<![\p{L}\p{N}]|\d[.,])\d+(?:[.,]\d+)*/gu;

function canonical(numeric: string): string {
  return String(Number(numeric));
}

function readingsOf(raw: string): string[] {
  const separators = raw.match(/[.,]/g) ?? [];
  if (separators.length === 0) {
    return [canonical(raw)];
  }

  const parts = raw.split(/[.,]/);
  const last = parts.at(-1) ?? "";

  if (separators.length === 1) {
    const whole = parts[0] ?? "";
    const decimal = canonical(`${whole}.${last}`);
    return last.length === 3 ? [...new Set([canonical(whole + last), decimal])] : [decimal];
  }

  const finalSeparator = separators.at(-1);
  const isMixed = new Set(separators).size > 1;
  const middle = parts.slice(1, -1);

  if (!isMixed) {
    const isThousands = parts.slice(1).every((part) => part.length === 3);
    return isThousands ? [canonical(parts.join(""))] : [`literal:${raw}`];
  }

  const isDecimalLast =
    separators.slice(0, -1).every((separator) => separator !== finalSeparator) &&
    middle.every((part) => part.length === 3);
  return isDecimalLast ? [canonical(`${parts.slice(0, -1).join("")}.${last}`)] : [`literal:${raw}`];
}

export function extractNumbers(text: string): NumberToken[] {
  const byRaw = new Map<string, NumberToken>();
  for (const match of stripMarks(text).matchAll(NUMBER_PATTERN)) {
    const raw = match[0];
    if (!byRaw.has(raw)) {
      byRaw.set(raw, { raw, readings: readingsOf(raw) });
    }
  }
  return [...byRaw.values()];
}

export function numbersMatch(a: NumberToken, b: NumberToken): boolean {
  return a.readings.some((reading) => b.readings.includes(reading));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/numbers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/verify/marks.ts src/core/verify/numbers.ts tests/core/numbers.test.ts
git commit -m "feat: add reference marks and number matching"
```

---

### Task 4: Quote check

**Files:**
- Create: `src/core/verify/quote.ts`
- Test: `tests/core/quote.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/quote.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { quoteExistsIn } from "../../src/core/verify/quote";

const source = `The model   supports a "large"\ncontext window on Consumer GPUs.`;

describe("quoteExistsIn", () => {
  it("finds an exact quote", () => {
    expect(quoteExistsIn("supports a", source)).toBe(true);
  });

  it("ignores differences in whitespace and case", () => {
    expect(quoteExistsIn("MODEL supports", source)).toBe(true);
    expect(quoteExistsIn("large\" context window", source)).toBe(true);
  });

  it("treats typographic quotes as straight quotes", () => {
    expect(quoteExistsIn("a “large” context", source)).toBe(true);
  });

  it("rejects a paraphrase", () => {
    expect(quoteExistsIn("supports a big context window", source)).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(quoteExistsIn("   ", source)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/quote.test.ts`
Expected: FAIL because `src/core/verify/quote` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/verify/quote.ts`

```ts
function normalize(text: string): string {
  return text
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteExistsIn(quote: string, sourceText: string): boolean {
  const needle = normalize(quote);
  return needle.length > 0 && normalize(sourceText).includes(needle);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/quote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/verify/quote.ts tests/core/quote.test.ts
git commit -m "feat: add literal quote check"
```

---

### Task 5: Timing

**Files:**
- Create: `src/core/script/timing.ts`
- Test: `tests/core/timing.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/timing.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { countWords, estimateSeconds, formatDuration } from "../../src/core/script/timing";

describe("countWords", () => {
  it("counts words and skips reference marks", () => {
    expect(countWords("Llegó a 42 tokens [P1] por segundo")).toBe(6);
  });

  it("returns zero for blank text", () => {
    expect(countWords("  \n ")).toBe(0);
  });
});

describe("estimateSeconds", () => {
  it("defaults to 150 words per minute", () => {
    expect(estimateSeconds(Array(150).fill("palabra").join(" "))).toBe(60);
  });

  it("honors a custom rate", () => {
    expect(estimateSeconds(Array(100).fill("palabra").join(" "), 200)).toBe(30);
  });
});

describe("formatDuration", () => {
  it("formats minutes and padded seconds", () => {
    expect(formatDuration(80)).toBe("1:20");
    expect(formatDuration(9)).toBe("0:09");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/timing.test.ts`
Expected: FAIL because `src/core/script/timing` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/script/timing.ts`

```ts
import { stripMarks } from "../verify/marks";

export const DEFAULT_WORDS_PER_MINUTE = 150;

export function countWords(text: string): number {
  const trimmed = stripMarks(text).trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function estimateSeconds(text: string, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): number {
  return Math.round((countWords(text) / wordsPerMinute) * 60);
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/timing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/script/timing.ts tests/core/timing.test.ts
git commit -m "feat: add block timing"
```

---

### Task 6: Number check

**Files:**
- Create: `src/core/verify/numberCheck.ts`
- Test: `tests/core/numberCheck.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/numberCheck.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { checkBlockNumbers } from "../../src/core/verify/numberCheck";

const sources = {
  F1: "The card lists 128000 tokens and 7.5 GB.",
  P1: "Result: 42 tokens per second.",
};

function check(voiceover: string) {
  return checkBlockNumbers({ blockId: "b1", voiceover, sources });
}

describe("checkBlockNumbers", () => {
  it("passes a number found in a cited source", () => {
    expect(check("Llegó a 42 tokens [P1]")).toEqual([]);
  });

  it("passes a locale variant of a cited number", () => {
    expect(check("Pesa 7,5 GB [F1]")).toEqual([]);
  });

  it("flags a number missing from the cited source", () => {
    expect(check("Llegó a 50 tokens [P1]")).toEqual([
      { id: "b1:number:50", blockId: "b1", kind: "number", token: "50", reason: "not-in-source" },
    ]);
  });

  it("does not look in sources the block does not cite", () => {
    expect(check("Llegó a 42 tokens [F1]")[0]?.reason).toBe("not-in-source");
  });

  it("flags numbers in a block with no citations", () => {
    expect(check("Llegó a 42 tokens")[0]?.reason).toBe("no-citation");
  });

  it("treats a citation to an unknown source as not found", () => {
    expect(check("Llegó a 42 tokens [F9]")[0]?.reason).toBe("not-in-source");
  });

  it("returns nothing for text without numbers", () => {
    expect(check("Sin cifras aquí")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/numberCheck.test.ts`
Expected: FAIL because `src/core/verify/numberCheck` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/verify/numberCheck.ts`

```ts
import type { Finding } from "../domain/schemas";
import { extractMarks } from "./marks";
import { extractNumbers, numbersMatch } from "./numbers";

export interface BlockNumberInput {
  blockId: string;
  voiceover: string;
  sources: Readonly<Record<string, string>>;
}

export function checkBlockNumbers(input: BlockNumberInput): Finding[] {
  const cited = extractMarks(input.voiceover);
  const available = cited.flatMap((id) => extractNumbers(input.sources[id] ?? ""));

  return extractNumbers(input.voiceover)
    .filter((token) => !available.some((candidate) => numbersMatch(token, candidate)))
    .map((token) => ({
      id: `${input.blockId}:number:${token.raw}`,
      blockId: input.blockId,
      kind: "number" as const,
      token: token.raw,
      reason: cited.length === 0 ? ("no-citation" as const) : ("not-in-source" as const),
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/numberCheck.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/verify/numberCheck.ts tests/core/numberCheck.test.ts
git commit -m "feat: add per-block number check"
```

---

### Task 7: Humanize guard

**Files:**
- Create: `src/core/humanize/guard.ts`
- Test: `tests/core/humanizeGuard.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/humanizeGuard.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { compareProtectedTokens } from "../../src/core/humanize/guard";

describe("compareProtectedTokens", () => {
  it("accepts a rewrite that keeps marks and numbers", () => {
    const result = compareProtectedTokens("Llegó a 7,5 tokens [P1].", "Alcanzó 7.5 tokens [P1], sin más.");
    expect(result.ok).toBe(true);
  });

  it("reports a dropped reference mark", () => {
    const result = compareProtectedTokens("Dato [F1] y dato [P1]", "Dato [F1] y dato");
    expect(result.ok).toBe(false);
    expect(result.missingMarks).toEqual(["P1"]);
  });

  it("reports an added reference mark", () => {
    expect(compareProtectedTokens("Dato [F1]", "Dato [F1] [F2]").addedMarks).toEqual(["F2"]);
  });

  it("reports a changed number on both sides", () => {
    const result = compareProtectedTokens("Son 42 tokens [P1]", "Son 43 tokens [P1]");
    expect(result.ok).toBe(false);
    expect(result.missingNumbers).toEqual(["42"]);
    expect(result.addedNumbers).toEqual(["43"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/humanizeGuard.test.ts`
Expected: FAIL because `src/core/humanize/guard` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/humanize/guard.ts`

```ts
import { extractMarks } from "../verify/marks";
import { extractNumbers, numbersMatch, type NumberToken } from "../verify/numbers";

export interface GuardResult {
  ok: boolean;
  missingMarks: string[];
  addedMarks: string[];
  missingNumbers: string[];
  addedNumbers: string[];
}

function unmatched(tokens: NumberToken[], others: NumberToken[]): string[] {
  return tokens
    .filter((token) => !others.some((other) => numbersMatch(token, other)))
    .map((token) => token.raw);
}

export function compareProtectedTokens(before: string, after: string): GuardResult {
  const marksBefore = extractMarks(before);
  const marksAfter = extractMarks(after);
  const numbersBefore = extractNumbers(before);
  const numbersAfter = extractNumbers(after);

  const missingMarks = marksBefore.filter((mark) => !marksAfter.includes(mark));
  const addedMarks = marksAfter.filter((mark) => !marksBefore.includes(mark));
  const missingNumbers = unmatched(numbersBefore, numbersAfter);
  const addedNumbers = unmatched(numbersAfter, numbersBefore);

  return {
    ok:
      missingMarks.length === 0 &&
      addedMarks.length === 0 &&
      missingNumbers.length === 0 &&
      addedNumbers.length === 0,
    missingMarks,
    addedMarks,
    missingNumbers,
    addedNumbers,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/humanizeGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/humanize/guard.ts tests/core/humanizeGuard.test.ts
git commit -m "feat: add humanize guard"
```

---

### Task 8: Staleness

**Files:**
- Create: `src/core/script/staleness.ts`
- Test: `tests/core/staleness.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/staleness.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { Script, Skeleton, SkeletonBlock } from "../../src/core/domain/schemas";
import { computePointRefs, staleBlockIds } from "../../src/core/script/staleness";

function point(id: string, text: string) {
  return { id, text, keyPointId: null, sourceIds: ["F1"] };
}

function skeleton(): Skeleton {
  return {
    blocks: [
      { id: "s1", title: "One", points: [point("p1", "first"), point("p2", "second")] },
      { id: "s2", title: "Two", points: [point("p3", "third")] },
    ],
  };
}

function scriptFor(blocks: SkeletonBlock[]): Script {
  return {
    blocks: blocks.map((block) => ({
      id: `b-${block.id}`,
      skeletonBlockId: block.id,
      title: block.title,
      voiceover: "text",
      onScreen: "",
      pointRefs: computePointRefs(block),
      origin: "generated",
      humanizeStatus: "off",
    })),
  };
}

describe("staleBlockIds", () => {
  it("reports nothing when the skeleton is unchanged", () => {
    const current = skeleton();
    expect(staleBlockIds(scriptFor(current.blocks), current)).toEqual([]);
  });

  it("marks only the block whose point text changed", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    edited.blocks[1]!.points[0]!.text = "changed";
    expect(staleBlockIds(script, edited)).toEqual(["b-s2"]);
  });

  it("marks both blocks when a point moves between them", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    const moved = edited.blocks[0]!.points.pop()!;
    edited.blocks[1]!.points.push(moved);
    expect(staleBlockIds(script, edited)).toEqual(["b-s1", "b-s2"]);
  });

  it("marks a block when a point is added", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    edited.blocks[1]!.points.push(point("p4", "new"));
    expect(staleBlockIds(script, edited)).toEqual(["b-s2"]);
  });

  it("marks a block whose skeleton block was removed", () => {
    const original = skeleton();
    const script = scriptFor(original.blocks);
    const edited = skeleton();
    edited.blocks.pop();
    expect(staleBlockIds(script, edited)).toEqual(["b-s2"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/staleness.test.ts`
Expected: FAIL because `src/core/script/staleness` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/script/staleness.ts`

```ts
import type { PointRef, Script, Skeleton, SkeletonBlock, SkeletonPoint } from "../domain/schemas";
import { hashText } from "../hash";

function hashPoint(point: SkeletonPoint): string {
  return hashText(JSON.stringify([point.text, point.keyPointId, point.sourceIds]));
}

export function computePointRefs(block: SkeletonBlock): PointRef[] {
  return block.points.map((point) => ({ pointId: point.id, hash: hashPoint(point) }));
}

function sameRefs(a: PointRef[], b: PointRef[]): boolean {
  return (
    a.length === b.length &&
    a.every((ref, index) => ref.pointId === b[index]?.pointId && ref.hash === b[index]?.hash)
  );
}

export function staleBlockIds(script: Script, skeleton: Skeleton): string[] {
  return script.blocks
    .filter((block) => {
      const source = skeleton.blocks.find((candidate) => candidate.id === block.skeletonBlockId);
      return source === undefined || !sameRefs(block.pointRefs, computePointRefs(source));
    })
    .map((block) => block.id);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/staleness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/script/staleness.ts tests/core/staleness.test.ts
git commit -m "feat: add block staleness detection"
```

---

### Task 9: Export gate

**Files:**
- Create: `src/core/verify/exportGate.ts`
- Test: `tests/core/exportGate.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/exportGate.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { hashText } from "../../src/core/hash";
import { evaluateExport } from "../../src/core/verify/exportGate";

const sources = { P1: "Result: 42 tokens." };

describe("evaluateExport", () => {
  it("allows a script with supported numbers", () => {
    const result = evaluateExport({
      blocks: [{ id: "b1", voiceover: "Llegó a 42 [P1]" }],
      sources,
      acceptances: [],
    });
    expect(result).toEqual({ allowed: true, blocking: [] });
  });

  it("blocks on an unresolved number", () => {
    const result = evaluateExport({
      blocks: [{ id: "b1", voiceover: "Llegó a 50 [P1]" }],
      sources,
      acceptances: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.blocking.map((finding) => finding.token)).toEqual(["50"]);
  });

  it("allows a number the user accepted for this exact text", () => {
    const voiceover = "Llegó a 50 [P1]";
    const result = evaluateExport({
      blocks: [{ id: "b1", voiceover }],
      sources,
      acceptances: [{ findingId: "b1:number:50", textHash: hashText(voiceover) }],
    });
    expect(result.allowed).toBe(true);
  });

  it("voids an acceptance when the block text changes", () => {
    const result = evaluateExport({
      blocks: [{ id: "b1", voiceover: "Ahora llegó a 50 [P1]" }],
      sources,
      acceptances: [{ findingId: "b1:number:50", textHash: hashText("Llegó a 50 [P1]") }],
    });
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/exportGate.test.ts`
Expected: FAIL because `src/core/verify/exportGate` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/verify/exportGate.ts`

```ts
import type { Acceptance, Finding, ScriptBlock } from "../domain/schemas";
import { hashText } from "../hash";
import { checkBlockNumbers } from "./numberCheck";

export interface ExportInput {
  blocks: Pick<ScriptBlock, "id" | "voiceover">[];
  sources: Readonly<Record<string, string>>;
  acceptances: Acceptance[];
}

export interface ExportDecision {
  allowed: boolean;
  blocking: Finding[];
}

export function evaluateExport(input: ExportInput): ExportDecision {
  const blocking = input.blocks.flatMap((block) => {
    const textHash = hashText(block.voiceover);
    return checkBlockNumbers({
      blockId: block.id,
      voiceover: block.voiceover,
      sources: input.sources,
    }).filter(
      (finding) =>
        !input.acceptances.some(
          (acceptance) => acceptance.findingId === finding.id && acceptance.textHash === textHash,
        ),
    );
  });

  return { allowed: blocking.length === 0, blocking };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/exportGate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/verify/exportGate.ts tests/core/exportGate.test.ts
git commit -m "feat: add export gate"
```

---

### Task 10: Atomic writes

**Files:**
- Create: `src/core/store/atomicWrite.ts`
- Test: `tests/core/atomicWrite.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/atomicWrite.test.ts`

```ts
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../../src/core/store/atomicWrite";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "guio-atomic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("creates parent folders and writes the content", async () => {
    const target = join(dir, "a", "b.json");
    await writeFileAtomic(target, "hello");
    expect(await readFile(target, "utf8")).toBe("hello");
  });

  it("replaces existing content and leaves no temporary file", async () => {
    const target = join(dir, "b.json");
    await writeFileAtomic(target, "one");
    await writeFileAtomic(target, "two");
    expect(await readFile(target, "utf8")).toBe("two");
    expect(await readdir(dir)).toEqual(["b.json"]);
  });

  it("removes the temporary file when the rename fails", async () => {
    const target = join(dir, "occupied");
    await mkdir(target);
    await expect(writeFileAtomic(target, "x")).rejects.toThrow();
    expect(await readdir(dir)).toEqual(["occupied"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/atomicWrite.test.ts`
Expected: FAIL because `src/core/store/atomicWrite` cannot be resolved.

- [ ] **Step 3: Implement**

Windows can briefly lock a file for antivirus or indexing, so the rename retries on those specific errors.

File: `src/core/store/atomicWrite.ts`

```ts
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);
const MAX_ATTEMPTS = 5;

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!RETRYABLE.has(code) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      await delay(attempt * 50);
    }
  }
}

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await renameWithRetry(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/atomicWrite.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/store/atomicWrite.ts tests/core/atomicWrite.test.ts
git commit -m "feat: add atomic file writes"
```

---

### Task 11: Project store

**Files:**
- Create: `src/core/store/projectStore.ts`
- Test: `tests/core/projectStore.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/projectStore.test.ts`

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Source } from "../../src/core/domain/schemas";
import { ProjectStore } from "../../src/core/store/projectStore";

let root: string;
let store: ProjectStore;

const input = { title: "Prueba: Modelo Ñu", templateId: "model-test", language: "es", targetSeconds: 600 };

function web(id: string): Source {
  return {
    kind: "web",
    id,
    url: null,
    title: id,
    accessedAt: "2026-11-09T10:00:00.000Z",
    text: "text",
    summary: "",
    keyPoints: [],
    discarded: false,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "guio-store-"));
  store = new ProjectStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ProjectStore projects", () => {
  it("creates a project with a clean slug", async () => {
    const meta = await store.create(input);
    expect(meta.slug).toBe("prueba-modelo-nu");
    expect(await store.getMeta(meta.slug)).toEqual(meta);
  });

  it("keeps slugs unique", async () => {
    await store.create(input);
    expect((await store.create(input)).slug).toBe("prueba-modelo-nu-2");
  });

  it("falls back to a default slug", async () => {
    expect((await store.create({ ...input, title: "!!!" })).slug).toBe("video");
  });

  it("lists created projects and ignores unrelated folders", async () => {
    const meta = await store.create(input);
    await writeFile(join(root, "note.txt"), "x");
    expect(await store.list()).toEqual([meta]);
  });

  it("rejects a slug that escapes the root", async () => {
    await expect(store.getMeta("../outside")).rejects.toThrow();
  });
});

describe("ProjectStore documents", () => {
  it("returns empty documents for a new project", async () => {
    const { slug } = await store.create(input);
    expect(await store.getSkeleton(slug)).toEqual({ blocks: [] });
    expect(await store.getScript(slug)).toEqual({ blocks: [] });
    expect(await store.getVerification(slug)).toEqual({ findings: [], acceptances: [] });
    expect(await store.getRuns(slug)).toEqual({ runs: [] });
    expect(await store.getHistory(slug, "b1")).toEqual({ versions: [] });
  });

  it("orders sources with web first and numerically", async () => {
    const { slug } = await store.create(input);
    await store.saveSource(slug, web("F10"));
    await store.saveSource(slug, web("F2"));
    await store.saveSource(slug, {
      kind: "test",
      id: "P1",
      title: "t",
      hardware: "",
      modelVersion: "",
      quantization: "",
      settings: "",
      results: "",
      notes: "",
      summary: "",
      keyPoints: [],
      discarded: false,
    });
    expect((await store.listSources(slug)).map((source) => source.id)).toEqual(["F2", "F10", "P1"]);
  });

  it("refuses invalid data without touching the saved file", async () => {
    const { slug } = await store.create(input);
    await store.saveSkeleton(slug, { blocks: [] });
    const before = await readFile(join(root, slug, "skeleton.json"), "utf8");
    await expect(
      store.saveSkeleton(slug, { blocks: [{ id: "../x", title: "", points: [] }] }),
    ).rejects.toThrow();
    expect(await readFile(join(root, slug, "skeleton.json"), "utf8")).toBe(before);
  });

  it("appends block history in order", async () => {
    const { slug } = await store.create(input);
    const version = { savedAt: "2026-11-09T10:00:00.000Z", voiceover: "a", onScreen: "", reason: "draft" as const };
    await store.appendHistory(slug, "b1", version);
    await store.appendHistory(slug, "b1", { ...version, voiceover: "b", reason: "rewrite" });
    expect((await store.getHistory(slug, "b1")).versions.map((v) => v.voiceover)).toEqual(["a", "b"]);
  });

  it("rejects a block id that escapes the history folder", async () => {
    const { slug } = await store.create(input);
    await expect(store.getHistory(slug, "../../x")).rejects.toThrow();
  });
});

describe("ProjectStore runs", () => {
  it("replaces the run of the same step", async () => {
    const { slug } = await store.create(input);
    await store.recordRun(slug, { step: "draft", status: "running", startedAt: "a" });
    await store.recordRun(slug, { step: "draft", status: "done", startedAt: "a" });
    expect((await store.getRuns(slug)).runs).toEqual([{ step: "draft", status: "done", startedAt: "a" }]);
  });

  it("marks running steps as interrupted", async () => {
    const { slug } = await store.create(input);
    await store.recordRun(slug, { step: "draft", status: "running", startedAt: "a" });
    await store.recordRun(slug, { step: "cards", status: "done", startedAt: "b" });
    await store.markRunningAsInterrupted(slug);
    const { runs } = await store.getRuns(slug);
    expect(runs.find((run) => run.step === "draft")?.status).toBe("interrupted");
    expect(runs.find((run) => run.step === "cards")?.status).toBe("done");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/projectStore.test.ts`
Expected: FAIL because `src/core/store/projectStore` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/store/projectStore.ts`

```ts
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import {
  BlockHistorySchema,
  ProjectMetaSchema,
  ProjectSlugSchema,
  RunsSchema,
  SafeIdSchema,
  ScriptSchema,
  SkeletonSchema,
  SourceIdSchema,
  SourceSchema,
  VerificationSchema,
  type BlockHistory,
  type BlockVersion,
  type ProjectMeta,
  type Run,
  type Runs,
  type Script,
  type Skeleton,
  type Source,
  type Verification,
} from "../domain/schemas";
import { writeFileAtomic } from "./atomicWrite";

export interface NewProject {
  title: string;
  templateId: string;
  language: string;
  targetSeconds: number;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "video" : slug;
}

function sourceOrder(id: string): [number, number] {
  return [id.startsWith("F") ? 0 : 1, Number(id.slice(1))];
}

export class ProjectStore {
  constructor(private readonly root: string) {}

  private dir(slug: string): string {
    return join(this.root, ProjectSlugSchema.parse(slug));
  }

  private async read<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    return schema.parse(JSON.parse(await readFile(path, "utf8")));
  }

  private async readOr<S extends z.ZodType>(
    path: string,
    schema: S,
    fallback: z.infer<S>,
  ): Promise<z.infer<S>> {
    try {
      return await this.read(path, schema);
    } catch (error) {
      if (isMissing(error)) {
        return fallback;
      }
      throw error;
    }
  }

  private async write<S extends z.ZodType>(path: string, schema: S, value: z.infer<S>): Promise<void> {
    await writeFileAtomic(path, `${JSON.stringify(schema.parse(value), null, 2)}\n`);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title);
    const taken = new Set(await readdir(this.root));
    let candidate = base;
    for (let suffix = 2; taken.has(candidate); suffix += 1) {
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  async create(input: NewProject): Promise<ProjectMeta> {
    await mkdir(this.root, { recursive: true });
    const slug = await this.uniqueSlug(input.title);
    const meta: ProjectMeta = {
      schemaVersion: 1,
      slug,
      createdAt: new Date().toISOString(),
      ...input,
    };
    await this.write(join(this.dir(slug), "project.json"), ProjectMetaSchema, meta);
    return meta;
  }

  async getMeta(slug: string): Promise<ProjectMeta> {
    return this.read(join(this.dir(slug), "project.json"), ProjectMetaSchema);
  }

  async list(): Promise<ProjectMeta[]> {
    const entries = await readdir(this.root, { withFileTypes: true });
    const projects: ProjectMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !ProjectSlugSchema.safeParse(entry.name).success) {
        continue;
      }
      try {
        projects.push(await this.getMeta(entry.name));
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
    }
    return projects;
  }

  async saveSource(slug: string, source: Source): Promise<void> {
    const id = SourceIdSchema.parse(source.id);
    await this.write(join(this.dir(slug), "sources", `${id}.json`), SourceSchema, source);
  }

  async listSources(slug: string): Promise<Source[]> {
    const dir = join(this.dir(slug), "sources");
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }
    const sources = await Promise.all(
      names.filter((name) => name.endsWith(".json")).map((name) => this.read(join(dir, name), SourceSchema)),
    );
    return sources.sort((a, b) => {
      const [kindA, numberA] = sourceOrder(a.id);
      const [kindB, numberB] = sourceOrder(b.id);
      return kindA - kindB || numberA - numberB;
    });
  }

  async getSkeleton(slug: string): Promise<Skeleton> {
    return this.readOr(join(this.dir(slug), "skeleton.json"), SkeletonSchema, { blocks: [] });
  }

  async saveSkeleton(slug: string, skeleton: Skeleton): Promise<void> {
    await this.write(join(this.dir(slug), "skeleton.json"), SkeletonSchema, skeleton);
  }

  async getScript(slug: string): Promise<Script> {
    return this.readOr(join(this.dir(slug), "script.json"), ScriptSchema, { blocks: [] });
  }

  async saveScript(slug: string, script: Script): Promise<void> {
    await this.write(join(this.dir(slug), "script.json"), ScriptSchema, script);
  }

  async getVerification(slug: string): Promise<Verification> {
    return this.readOr(join(this.dir(slug), "verification.json"), VerificationSchema, {
      findings: [],
      acceptances: [],
    });
  }

  async saveVerification(slug: string, verification: Verification): Promise<void> {
    await this.write(join(this.dir(slug), "verification.json"), VerificationSchema, verification);
  }

  private historyPath(slug: string, blockId: string): string {
    return join(this.dir(slug), "history", `${SafeIdSchema.parse(blockId)}.json`);
  }

  async getHistory(slug: string, blockId: string): Promise<BlockHistory> {
    return this.readOr(this.historyPath(slug, blockId), BlockHistorySchema, { versions: [] });
  }

  async appendHistory(slug: string, blockId: string, version: BlockVersion): Promise<void> {
    const history = await this.getHistory(slug, blockId);
    await this.write(this.historyPath(slug, blockId), BlockHistorySchema, {
      versions: [...history.versions, version],
    });
  }

  async getRuns(slug: string): Promise<Runs> {
    return this.readOr(join(this.dir(slug), "runs.json"), RunsSchema, { runs: [] });
  }

  private async saveRuns(slug: string, runs: Runs): Promise<void> {
    await this.write(join(this.dir(slug), "runs.json"), RunsSchema, runs);
  }

  async recordRun(slug: string, run: Run): Promise<void> {
    const { runs } = await this.getRuns(slug);
    await this.saveRuns(slug, { runs: [...runs.filter((item) => item.step !== run.step), run] });
  }

  async markRunningAsInterrupted(slug: string): Promise<void> {
    const { runs } = await this.getRuns(slug);
    await this.saveRuns(slug, {
      runs: runs.map((run) => (run.status === "running" ? { ...run, status: "interrupted" } : run)),
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/projectStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/store/projectStore.ts tests/core/projectStore.test.ts
git commit -m "feat: add project store"
```

---

### Task 12: Default templates

**Files:**
- Create: `src/core/templates/defaults.ts`
- Test: `tests/core/templates.test.ts`

- [ ] **Step 1: Write the failing test**

File: `tests/core/templates.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { TemplateSchema } from "../../src/core/domain/schemas";
import { DEFAULT_TEMPLATES } from "../../src/core/templates/defaults";

describe("DEFAULT_TEMPLATES", () => {
  it("ships news, comparison, and model test templates", () => {
    expect(DEFAULT_TEMPLATES.map((template) => template.id)).toEqual(["news", "comparison", "model-test"]);
  });

  it("gives each template the five spec blocks with guidance", () => {
    for (const template of DEFAULT_TEMPLATES) {
      expect(TemplateSchema.parse(template)).toEqual(template);
      expect(template.blocks.map((block) => block.id)).toEqual([
        "opening",
        "context",
        "body",
        "own-value",
        "closing",
      ]);
      expect(template.blocks.every((block) => block.guidance.length > 0)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/templates.test.ts`
Expected: FAIL because `src/core/templates/defaults` cannot be resolved.

- [ ] **Step 3: Implement**

File: `src/core/templates/defaults.ts`

```ts
import type { Template } from "../domain/schemas";

function blocks(guidance: [string, string, string, string, string]): Template["blocks"] {
  const [opening, context, body, ownValue, closing] = guidance;
  return [
    { id: "opening", title: "Opening", guidance: opening },
    { id: "context", title: "Context", guidance: context },
    { id: "body", title: "Body", guidance: body },
    { id: "own-value", title: "Own value", guidance: ownValue },
    { id: "closing", title: "Closing", guidance: closing },
  ];
}

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "news",
    name: "News",
    blocks: blocks([
      "Hook with the main story.",
      "Explain why it matters.",
      "Cover 3 to 5 stories, each with an opinion.",
      "Explain what it means for people running local AI.",
      "Recap and close with a call to action.",
    ]),
  },
  {
    id: "comparison",
    name: "Comparison",
    blocks: blocks([
      "Pose the question: which one is worth it?",
      "Introduce the contenders and the criteria.",
      "Run one round per criterion.",
      "Give a verdict per use case.",
      "Name the winner and give a recommendation.",
    ]),
  },
  {
    id: "model-test",
    name: "Model test",
    blocks: blocks([
      "Set the model's promise against the doubt.",
      "Say what it is, its license, and its requirements.",
      "Walk through the tests with their results.",
      "Cover the good, the bad, and the odd.",
      "Answer whether it is worth installing.",
    ]),
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: all test files PASS.

Run: `npm run typecheck`
Expected: exits 0 with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/templates tests/core/templates.test.ts
git commit -m "feat: add default script templates"
```
