// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, initTheme, resolveTheme } from "../../src/renderer/src/theme";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe("resolveTheme", () => {
  it.each([
    ["system", true, "dark"],
    ["system", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
  ] as const)("%s with prefers-dark %s resolves to %s", (preference, prefersDark, expected) => {
    expect(resolveTheme(preference, prefersDark)).toBe(expected);
  });
});

describe("applyTheme", () => {
  it("writes the resolved theme on the document element", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("follows the system preference when the choice is system", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => undefined }));
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("initTheme", () => {
  it("applies the stored preference once settings load", async () => {
    await initTheme(async () => ({ theme: "dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps the system default when settings cannot be read", async () => {
    await initTheme(async () => {
      throw new Error("boom");
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
