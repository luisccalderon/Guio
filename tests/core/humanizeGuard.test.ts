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
