import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createHttpPageLoader,
  createSourceFromText,
  extractFromLink,
  parseArticle,
  type PageLoader,
} from "../../src/core/extractor/extract";

const paragraph =
  "The new open-weight model ships with a permissive license and runs on consumer graphics cards. ".repeat(8);
const ARTICLE = `<html><head><title>Launch day</title></head><body>
  <nav>Home About Contact</nav>
  <article><h1>Launch day</h1><p>${paragraph}</p><p>${paragraph}</p><p>${paragraph}</p></article>
  <script>window.bad = 1</script>
</body></html>`;

const signal = new AbortController().signal;

function loader(name: string, load: PageLoader["load"]): PageLoader {
  return { name, load };
}

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

async function serve(status: number, contentType: string, body: string): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": contentType });
    res.end(body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/a`;
}

describe("parseArticle", () => {
  it("returns the title and clean text", () => {
    const article = parseArticle(ARTICLE, "https://example.com/a");
    expect(article?.title).toBe("Launch day");
    expect(article?.text).toContain("permissive license");
    expect(article?.text).not.toContain("window.bad");
    expect(article?.text).not.toMatch(/\s{3,}/);
  });

  it("returns null for a page with no real content", () => {
    expect(parseArticle("<html><body><p>Subscribe</p></body></html>", "https://example.com")).toBeNull();
  });
});

describe("extractFromLink", () => {
  it("rejects links that are not http or https", async () => {
    const result = await extractFromLink("file:///c:/secret.txt", [], signal);
    expect(result.status).toBe("invalid");
  });

  it("falls back to the next loader when one fails", async () => {
    const result = await extractFromLink(
      "https://example.com/a",
      [
        loader("http", async () => {
          throw new Error("403");
        }),
        loader("browser", async () => ARTICLE),
      ],
      signal,
    );
    expect(result).toMatchObject({ status: "ok", title: "Launch day" });
  });

  it("falls back when a page has no article", async () => {
    const result = await extractFromLink(
      "https://example.com/a",
      [loader("http", async () => "<html><body>app</body></html>"), loader("browser", async () => ARTICLE)],
      signal,
    );
    expect(result.status).toBe("ok");
  });

  it("reports blocked with each reason when every loader fails", async () => {
    const result = await extractFromLink(
      "https://example.com/a",
      [
        loader("http", async () => {
          throw new Error("HTTP 403");
        }),
      ],
      signal,
    );
    expect(result).toEqual({ status: "blocked", reason: "http: HTTP 403" });
  });

  it("stops trying loaders once cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractFromLink("https://example.com/a", [loader("http", async () => ARTICLE)], controller.signal),
    ).rejects.toMatchObject({ kind: "cancelled" });
  });
});

describe("createHttpPageLoader", () => {
  it("loads an HTML page", async () => {
    const url = await serve(200, "text/html; charset=utf-8", ARTICLE);
    expect(await createHttpPageLoader().load(url, signal)).toContain("Launch day");
  });

  it("fails on an error status", async () => {
    const url = await serve(403, "text/html", "no");
    await expect(createHttpPageLoader().load(url, signal)).rejects.toThrow("403");
  });

  it("fails on content that is not HTML", async () => {
    const url = await serve(200, "application/pdf", "x");
    await expect(createHttpPageLoader().load(url, signal)).rejects.toThrow("application/pdf");
  });
});

describe("createSourceFromText", () => {
  it("builds a web source with its access date", () => {
    const source = createSourceFromText({
      id: "F3",
      url: null,
      title: "Pasted",
      text: "body",
      accessedAt: "2026-11-09T10:00:00.000Z",
    });
    expect(source).toMatchObject({ kind: "web", id: "F3", url: null, keyPoints: [], discarded: false });
  });
});
