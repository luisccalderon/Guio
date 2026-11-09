import { stripMarks } from "../verify/marks";

export const DEFAULT_WORDS_PER_MINUTE = 150;

export function countWords(text: string): number {
  const trimmed = stripMarks(text).trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function estimateSeconds(text: string, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): number {
  return Math.round((countWords(text) / wordsPerMinute) * 60);
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
