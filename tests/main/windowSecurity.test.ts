import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { hardenContents, mainWindowOptions } from "../../src/main/windowSecurity";

class FakeContents extends EventEmitter {
  denied = false;
  setWindowOpenHandler(handler: () => { action: "deny" }): void {
    this.denied = handler().action === "deny";
  }
}

describe("mainWindowOptions", () => {
  it("turns on every renderer protection", () => {
    expect(mainWindowOptions("C:/app/preload.cjs").webPreferences).toEqual({
      preload: "C:/app/preload.cjs",
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    });
  });
});

describe("hardenContents", () => {
  it("denies every window.open", () => {
    const contents = new FakeContents();
    hardenContents(contents, null);
    expect(contents.denied).toBe(true);
  });

  it("blocks all navigation in a packaged app", () => {
    const contents = new FakeContents();
    hardenContents(contents, null);
    const event = { preventDefault: vi.fn() };
    contents.emit("will-navigate", event, "https://example.com/");
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("allows only the dev server origin in development", () => {
    const contents = new FakeContents();
    hardenContents(contents, "http://localhost:5173");
    const own = { preventDefault: vi.fn() };
    const other = { preventDefault: vi.fn() };
    contents.emit("will-navigate", own, "http://localhost:5173/index.html");
    contents.emit("will-navigate", other, "http://localhost:5173.evil.test/");
    expect(own.preventDefault).not.toHaveBeenCalled();
    expect(other.preventDefault).toHaveBeenCalledOnce();
  });

  it("blocks embedded webviews", () => {
    const contents = new FakeContents();
    hardenContents(contents, null);
    const event = { preventDefault: vi.fn() };
    contents.emit("will-attach-webview", event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
