import type { Source } from "../core/domain/schemas";

/** A link the extractor could not read is stored with empty text until the user pastes it. */
export function isBlockedSource(source: Source): boolean {
  return source.kind === "web" && source.text === "";
}
