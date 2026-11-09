const MARK_PATTERN = /\[([FP][1-9]\d*)\]/g;

export function extractMarks(text: string): string[] {
  const found = Array.from(text.matchAll(MARK_PATTERN), (match) => match[1] ?? "");
  return [...new Set(found)];
}

export function stripMarks(text: string): string {
  return text.replace(MARK_PATTERN, " ");
}
