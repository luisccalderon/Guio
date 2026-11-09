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
