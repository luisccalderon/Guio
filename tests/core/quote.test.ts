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
