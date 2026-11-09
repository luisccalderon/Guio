import { stripMarks } from "./marks";

export interface NumberToken {
  raw: string;
  readings: string[];
}

const NUMBER_PATTERN = /(?<![\p{L}\p{N}]|\d[.,])\d+(?:[.,]\d+)*/gu;

function canonical(numeric: string): string {
  return String(Number(numeric));
}

function readingsOf(raw: string): string[] {
  const separators = raw.match(/[.,]/g) ?? [];
  if (separators.length === 0) {
    return [canonical(raw)];
  }

  const parts = raw.split(/[.,]/);
  const last = parts.at(-1) ?? "";

  if (separators.length === 1) {
    const whole = parts[0] ?? "";
    const decimal = canonical(`${whole}.${last}`);
    return last.length === 3 ? [...new Set([canonical(whole + last), decimal])] : [decimal];
  }

  const finalSeparator = separators.at(-1);
  const isMixed = new Set(separators).size > 1;
  const middle = parts.slice(1, -1);

  if (!isMixed) {
    const isThousands = parts.slice(1).every((part) => part.length === 3);
    return isThousands ? [canonical(parts.join(""))] : [`literal:${raw}`];
  }

  const isDecimalLast =
    separators.slice(0, -1).every((separator) => separator !== finalSeparator) &&
    middle.every((part) => part.length === 3);
  return isDecimalLast ? [canonical(`${parts.slice(0, -1).join("")}.${last}`)] : [`literal:${raw}`];
}

export function extractNumbers(text: string): NumberToken[] {
  const byRaw = new Map<string, NumberToken>();
  for (const match of stripMarks(text).matchAll(NUMBER_PATTERN)) {
    const raw = match[0];
    if (!byRaw.has(raw)) {
      byRaw.set(raw, { raw, readings: readingsOf(raw) });
    }
  }
  return [...byRaw.values()];
}

export function numbersMatch(a: NumberToken, b: NumberToken): boolean {
  return a.readings.some((reading) => b.readings.includes(reading));
}
