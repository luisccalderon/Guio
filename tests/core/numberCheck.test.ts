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
