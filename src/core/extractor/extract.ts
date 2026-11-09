import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { ConnectorError } from "../connectors/types";
import type { WebSource } from "../domain/schemas";

export interface PageLoader {
  name: string;
  load(url: string, signal: AbortSignal): Promise<string>;
}

export interface Article {
  title: string;
  text: string;
}

export type ExtractResult =
  | ({ status: "ok" } & Article)
  | { status: "blocked"; reason: string }
  | { status: "invalid"; reason: string };

const MIN_ARTICLE_CHARS = 200;
const LOAD_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 10 * 1024 * 1024;

function cleanText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

export function parseArticle(html: string, url: string): Article | null {
  const dom = new JSDOM(html, { url });
  const parsed = new Readability(dom.window.document).parse();
  const text = cleanText(parsed?.textContent ?? "");
  if (text.length < MIN_ARTICLE_CHARS) {
    return null;
  }
  return { title: parsed?.title?.trim() || url, text };
}

function isWebUrl(url: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export async function extractFromLink(
  url: string,
  loaders: PageLoader[],
  signal: AbortSignal,
): Promise<ExtractResult> {
  if (!isWebUrl(url)) {
    return { status: "invalid", reason: "Only http and https links are supported." };
  }

  const reasons: string[] = [];
  for (const loader of loaders) {
    if (signal.aborted) {
      throw new ConnectorError("cancelled", "The step was cancelled.");
    }
    try {
      const article = parseArticle(await loader.load(url, signal), url);
      if (article !== null) {
        return { status: "ok", ...article };
      }
      reasons.push(`${loader.name}: no article found`);
    } catch (error) {
      reasons.push(`${loader.name}: ${(error as Error).message}`);
    }
  }
  if (signal.aborted) {
    throw new ConnectorError("cancelled", "The step was cancelled.");
  }
  return { status: "blocked", reason: reasons.join("; ") };
}

export function createHttpPageLoader(): PageLoader {
  return {
    name: "http",
    async load(url, signal) {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; Guio/0.1)", accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.any([signal, AbortSignal.timeout(LOAD_TIMEOUT_MS)]),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!/html/i.test(contentType)) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }
      const html = await response.text();
      if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
        throw new Error("The page is too large.");
      }
      return html;
    },
  };
}

export function createSourceFromText(input: {
  id: string;
  url: string | null;
  title: string;
  text: string;
  accessedAt: string;
}): WebSource {
  return { kind: "web", summary: "", keyPoints: [], discarded: false, ...input };
}
