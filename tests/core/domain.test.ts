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
