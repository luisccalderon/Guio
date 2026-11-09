function normalize(text: string): string {
  return text
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteExistsIn(quote: string, sourceText: string): boolean {
  const needle = normalize(quote);
  return needle.length > 0 && normalize(sourceText).includes(needle);
}
