export type BuildMode = "development" | "production";

/**
 * The policy is injected as a meta tag at build time because response-header
 * hooks do not cover pages loaded from file URLs.
 * Development needs inline styles (Vite injects CSS) and the HMR socket.
 * It still forbids inline scripts, which is why the React Fast Refresh plugin is not used.
 */
export function contentSecurityPolicy(mode: BuildMode): string {
  const development = mode === "development";
  return [
    "default-src 'none'",
    "script-src 'self'",
    development ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    development ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:*" : "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}
