import type { Source } from "./schemas";

export function sourceSearchText(source: Source): string {
  if (source.kind === "web") {
    return source.text;
  }
  return [
    source.title,
    source.hardware,
    source.modelVersion,
    source.quantization,
    source.settings,
    source.results,
    source.notes,
  ].join("\n");
}
