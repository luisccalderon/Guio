import { ConnectorError } from "../../core/connectors/types";
import type { Source, TestSource } from "../../core/domain/schemas";
import { sourceSearchText } from "../../core/domain/sourceText";
import { createSourceFromText, extractFromLink } from "../../core/extractor/extract";
import { generateCard } from "../../core/pipeline/cards";
import type { AddLinksOutput, IpcParsedInput, ProjectSnapshot } from "../../shared/ipc";
import { AI_TIMEOUT_MS, configuredConnector, trackedStep, type ServiceContext } from "./context";
import { buildSnapshot } from "./snapshot";

function nextSourceId(sources: Source[], prefix: "F" | "P"): string {
  const used = sources.filter((source) => source.id.startsWith(prefix)).map((source) => Number(source.id.slice(1)));
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

async function requireSource(ctx: ServiceContext, slug: string, sourceId: string): Promise<Source> {
  const source = (await ctx.store.listSources(slug)).find((item) => item.id === sourceId);
  if (source === undefined) {
    throw new Error(`Unknown source: ${sourceId}`);
  }
  return source;
}

export async function addLinks(ctx: ServiceContext, input: IpcParsedInput<"addLinks">): Promise<AddLinksOutput> {
  const { slug, urls } = input;
  const problems = await ctx.steps.runStep(slug, "links", async (signal) => {
    const sources = await ctx.store.listSources(slug);
    const found: string[] = [];
    for (const url of urls) {
      const result = await extractFromLink(url, ctx.loaders, signal);
      if (result.status === "invalid") {
        found.push(`${url}: ${result.reason}`);
        continue;
      }
      const id = nextSourceId(sources, "F");
      const article = result.status === "ok" ? { title: result.title, text: result.text } : { title: url, text: "" };
      const source = createSourceFromText({ id, url, accessedAt: ctx.now(), ...article });
      await ctx.store.saveSource(slug, source);
      sources.push(source);
      if (result.status === "blocked") {
        found.push(`${id} is blocked (${result.reason}). Paste its text.`);
      }
    }
    return found;
  });
  return { snapshot: await buildSnapshot(ctx, slug), problems };
}

export async function pasteSourceText(
  ctx: ServiceContext,
  input: IpcParsedInput<"pasteSourceText">,
): Promise<ProjectSnapshot> {
  const { slug, sourceId, title, text } = input;
  await ctx.steps.mutate(slug, async () => {
    const source = await requireSource(ctx, slug, sourceId);
    if (source.kind !== "web") {
      throw new Error(`${sourceId} is not a web source.`);
    }
    if (source.text !== "") {
      throw new Error(`${sourceId} already has text.`);
    }
    await ctx.store.saveSource(slug, { ...source, title, text, accessedAt: ctx.now() });
  });
  return buildSnapshot(ctx, slug);
}

export async function addTest(ctx: ServiceContext, input: IpcParsedInput<"addTest">): Promise<ProjectSnapshot> {
  const { slug, fields } = input;
  await ctx.steps.mutate(slug, async () => {
    const id = nextSourceId(await ctx.store.listSources(slug), "P");
    await ctx.store.saveSource(slug, { kind: "test", id, summary: "", keyPoints: [], discarded: false, ...fields });
  });
  return buildSnapshot(ctx, slug);
}

export async function editTest(ctx: ServiceContext, input: IpcParsedInput<"editTest">): Promise<ProjectSnapshot> {
  const { slug, sourceId, fields } = input;
  await ctx.steps.mutate(slug, async () => {
    const source = await requireSource(ctx, slug, sourceId);
    if (source.kind !== "test") {
      throw new Error(`${sourceId} is not a personal test.`);
    }
    const updated: TestSource = { ...source, ...fields };
    // Quotes must stay exact, so a change to the citable text invalidates the card.
    const changed = sourceSearchText(updated) !== sourceSearchText(source);
    await ctx.store.saveSource(slug, changed ? { ...updated, summary: "", keyPoints: [] } : updated);
  });
  return buildSnapshot(ctx, slug);
}

export async function generateCards(
  ctx: ServiceContext,
  input: IpcParsedInput<"generateCards">,
): Promise<ProjectSnapshot> {
  const { slug } = input;
  await trackedStep(ctx, slug, "cards", async (signal) => {
    const connector = await configuredConnector(ctx);
    const { cardPendingIds, sources } = await buildSnapshot(ctx, slug);
    for (const source of sources.filter((item) => cardPendingIds.includes(item.id))) {
      await ctx.store.saveSource(slug, await generateCard(source, connector, AI_TIMEOUT_MS, signal));
    }
  });
  return buildSnapshot(ctx, slug);
}

export async function setSourceDiscarded(
  ctx: ServiceContext,
  input: IpcParsedInput<"setSourceDiscarded">,
): Promise<ProjectSnapshot> {
  const { slug, sourceId, discarded } = input;
  await ctx.steps.mutate(slug, async () => {
    await ctx.store.saveSource(slug, { ...(await requireSource(ctx, slug, sourceId)), discarded });
  });
  return buildSnapshot(ctx, slug);
}

export async function setKeyPointSelected(
  ctx: ServiceContext,
  input: IpcParsedInput<"setKeyPointSelected">,
): Promise<ProjectSnapshot> {
  const { slug, sourceId, keyPointId, selected, approveUnverified } = input;
  await ctx.steps.mutate(slug, async () => {
    const source = await requireSource(ctx, slug, sourceId);
    const point = source.keyPoints.find((item) => item.id === keyPointId);
    if (point === undefined) {
      throw new Error(`Unknown key point: ${keyPointId}`);
    }
    if (selected && point.quoteStatus === "unverified" && !approveUnverified) {
      throw new Error("This quote could not be found in the source. Approve it explicitly to use it.");
    }
    await ctx.store.saveSource(slug, {
      ...source,
      keyPoints: source.keyPoints.map((item) => (item.id === keyPointId ? { ...item, selected } : item)),
    });
  });
  return buildSnapshot(ctx, slug);
}

export function isCancelled(error: unknown): boolean {
  return error instanceof ConnectorError && error.kind === "cancelled";
}
