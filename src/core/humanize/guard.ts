import { extractMarks } from "../verify/marks";
import { extractNumbers, numbersMatch, type NumberToken } from "../verify/numbers";

export interface GuardResult {
  ok: boolean;
  missingMarks: string[];
  addedMarks: string[];
  missingNumbers: string[];
  addedNumbers: string[];
}

function unmatched(tokens: NumberToken[], others: NumberToken[]): string[] {
  return tokens
    .filter((token) => !others.some((other) => numbersMatch(token, other)))
    .map((token) => token.raw);
}

export function compareProtectedTokens(before: string, after: string): GuardResult {
  const marksBefore = extractMarks(before);
  const marksAfter = extractMarks(after);
  const numbersBefore = extractNumbers(before);
  const numbersAfter = extractNumbers(after);

  const missingMarks = marksBefore.filter((mark) => !marksAfter.includes(mark));
  const addedMarks = marksAfter.filter((mark) => !marksBefore.includes(mark));
  const missingNumbers = unmatched(numbersBefore, numbersAfter);
  const addedNumbers = unmatched(numbersAfter, numbersBefore);

  return {
    ok:
      missingMarks.length === 0 &&
      addedMarks.length === 0 &&
      missingNumbers.length === 0 &&
      addedNumbers.length === 0,
    missingMarks,
    addedMarks,
    missingNumbers,
    addedNumbers,
  };
}
