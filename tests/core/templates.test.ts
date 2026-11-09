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
