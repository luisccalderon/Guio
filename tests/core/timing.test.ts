import { describe, expect, it } from "vitest";
import { countWords, estimateSeconds, formatDuration } from "../../src/core/script/timing";

describe("countWords", () => {
  it("counts words and skips reference marks", () => {
    expect(countWords("Llegó a 42 tokens [P1] por segundo")).toBe(6);
  });

  it("returns zero for blank text", () => {
    expect(countWords("  \n ")).toBe(0);
  });
});

describe("estimateSeconds", () => {
  it("defaults to 150 words per minute", () => {
    expect(estimateSeconds(Array(150).fill("palabra").join(" "))).toBe(60);
  });

  it("honors a custom rate", () => {
    expect(estimateSeconds(Array(100).fill("palabra").join(" "), 200)).toBe(30);
  });
});

describe("formatDuration", () => {
  it("formats minutes and padded seconds", () => {
    expect(formatDuration(80)).toBe("1:20");
    expect(formatDuration(9)).toBe("0:09");
  });
});
