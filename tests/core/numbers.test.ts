import { describe, expect, it } from "vitest";
import { extractMarks, stripMarks } from "../../src/core/verify/marks";
import { extractNumbers, numbersMatch } from "../../src/core/verify/numbers";

function only(text: string) {
  const tokens = extractNumbers(text);
  expect(tokens).toHaveLength(1);
  return tokens[0]!;
}

describe("marks", () => {
  it("finds unique marks in order", () => {
    expect(extractMarks("a [F2] b [P1] c [F2]")).toEqual(["F2", "P1"]);
  });

  it("ignores text that only resembles a mark", () => {
    expect(extractMarks("[X] [F0] [Q1]")).toEqual([]);
  });

  it("strips marks", () => {
    expect(stripMarks("a [F2] b")).toBe("a   b");
  });
});

describe("extractNumbers", () => {
  it("ignores digits inside reference marks", () => {
    expect(extractNumbers("Según la ficha [F12]")).toEqual([]);
  });

  it("captures a number attached to a unit", () => {
    expect(only("Usa 16GB de memoria").raw).toBe("16");
  });

  it("does not treat a label with a leading letter as a number", () => {
    expect(extractNumbers("Cuantización Q4 y versión v2.1")).toEqual([]);
  });

  it("does not include sentence punctuation", () => {
    expect(only("Llegó a 42.").raw).toBe("42");
  });

  it("reports a repeated number once", () => {
    expect(extractNumbers("42 y otra vez 42")).toHaveLength(1);
  });
});

describe("numbersMatch", () => {
  it("matches a decimal comma with a decimal point", () => {
    expect(numbersMatch(only("7,5"), only("7.5"))).toBe(true);
  });

  it("matches equal values with trailing zeros", () => {
    expect(numbersMatch(only("7,50"), only("7.5"))).toBe(true);
  });

  it("tries both readings of an ambiguous separator", () => {
    expect(numbersMatch(only("1,000"), only("1000"))).toBe(true);
    expect(numbersMatch(only("1,000"), only("1"))).toBe(true);
  });

  it("matches thousands in both locales", () => {
    expect(numbersMatch(only("1.234,56"), only("1,234.56"))).toBe(true);
    expect(numbersMatch(only("1.000.000"), only("1,000,000"))).toBe(true);
  });

  it("does not match different values", () => {
    expect(numbersMatch(only("7,5"), only("7.6"))).toBe(false);
  });

  it("treats a version string as literal", () => {
    expect(numbersMatch(only("3.5.1"), only("3.5.1"))).toBe(true);
    expect(numbersMatch(only("3.5.1"), only("3.5"))).toBe(false);
  });
});
