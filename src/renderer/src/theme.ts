import type { Theme } from "../../core/store/settingsSchema";

export type ResolvedTheme = "light" | "dark";

/** A concrete theme for the document: `system` follows the OS preference. */
export function resolveTheme(preference: Theme, prefersDark: boolean): ResolvedTheme {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return prefersDark ? "dark" : "light";
}

function systemPrefersDark(): boolean {
  // jsdom has no matchMedia; treating it as light keeps tests and older runtimes simple.
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

let preference: Theme = "system";

/** Applies the preference now and remembers it so OS changes can re-resolve `system`. */
export function applyTheme(next: Theme): void {
  preference = next;
  document.documentElement.dataset.theme = resolveTheme(next, systemPrefersDark());
}

/** Paints the system theme first, then the stored preference, and follows later OS changes. */
export async function initTheme(load: () => Promise<{ theme: Theme }>): Promise<void> {
  applyTheme("system");
  if (typeof window.matchMedia === "function") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(preference));
  }
  try {
    applyTheme((await load()).theme);
  } catch {
    // A settings failure must not block the window; the system theme stays in place.
  }
}
