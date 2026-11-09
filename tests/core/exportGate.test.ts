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
