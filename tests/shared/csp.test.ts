import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../../src/shared/csp";

describe("contentSecurityPolicy", () => {
  it("denies by default and allows only same-origin scripts and styles in production", () => {
    expect(contentSecurityPolicy("production")).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  it("never allows inline scripts, even in development", () => {
    const policy = contentSecurityPolicy("development");
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toMatch(/script-src[^;]*unsafe/);
  });

  it("opens only the dev server socket and injected styles in development", () => {
    const policy = contentSecurityPolicy("development");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self' ws://localhost:* ws://127.0.0.1:*");
  });
});
