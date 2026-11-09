import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createHiddenWindowLoader,
  EXTRACTION_PARTITION,
  hiddenWindowOptions,
  type HiddenSession,
  type HiddenWindow,
} from "../../src/main/pageLoader/hiddenWindowLoader";

class FakeContents extends EventEmitter {
  denied = false;
  html: unknown = "<html></html>";
  setWindowOpenHandler(handler: () => { action: "deny" }): void {
    this.denied = handler().action === "deny";
  }
  executeJavaScript = async (): Promise<unknown> => this.html;
}

class FakeWindow implements HiddenWindow {
  webContents = new FakeContents();
  destroyed = false;
  loadURL = vi.fn(async (_url: string) => undefined);
  destroy(): void {
    this.destroyed = true;
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

function setup(timeoutMs = 1000) {
  const window = new FakeWindow();
  const listeners: Record<string, (event: { preventDefault(): void }) => void> = {};
  let permission: Parameters<HiddenSession["setPermissionRequestHandler"]>[0] | undefined;
  const session: HiddenSession = {
    on: (event, listener) => {
      listeners[event] = listener;
    },
    setPermissionRequestHandler: (handler) => {
      permission = handler;
    },
  };
  const createWindow = vi.fn(() => window);
  const loader = createHiddenWindowLoader({ createWindow, session, timeoutMs });
  return { window, listeners, permission: () => permission, createWindow, loader };
}

const signal = new AbortController().signal;

describe("hiddenWindowOptions", () => {
  it("is hidden, sandboxed, and has no preload script", () => {
    expect(hiddenWindowOptions).toEqual({
      show: false,
      webPreferences: {
        partition: EXTRACTION_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
      },
    });
    expect(hiddenWindowOptions.webPreferences).not.toHaveProperty("preload");
    expect(EXTRACTION_PARTITION.startsWith("persist:")).toBe(false);
  });
});

describe("createHiddenWindowLoader", () => {
  it("returns the page HTML and destroys the window", async () => {
    const { window, loader, createWindow } = setup();
    window.webContents.html = "<html>page</html>";
    const page = loader.load("https://a.test", signal);
    window.webContents.emit("did-finish-load");
    await expect(page).resolves.toBe("<html>page</html>");
    expect(createWindow).toHaveBeenCalledWith(hiddenWindowOptions);
    expect(window.loadURL).toHaveBeenCalledWith("https://a.test");
    expect(window.destroyed).toBe(true);
  });

  it("denies popups", async () => {
    const { window, loader } = setup();
    const page = loader.load("https://a.test", signal);
    expect(window.webContents.denied).toBe(true);
    window.webContents.emit("did-finish-load");
    await page;
  });

  it("cancels every download and denies every permission", () => {
    const { listeners, permission } = setup();
    const event = { preventDefault: vi.fn() };
    listeners["will-download"]?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    const callback = vi.fn();
    permission()?.({}, "media", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("blocks navigation to anything but the web", async () => {
    const { window, loader } = setup();
    const page = loader.load("https://a.test", signal);
    const bad = { preventDefault: vi.fn() };
    const good = { preventDefault: vi.fn() };
    window.webContents.emit("will-navigate", bad, "file:///C:/secret.txt");
    window.webContents.emit("will-redirect", good, "https://b.test/");
    expect(bad.preventDefault).toHaveBeenCalledOnce();
    expect(good.preventDefault).not.toHaveBeenCalled();
    window.webContents.emit("did-finish-load");
    await page;
  });

  it("fails on a main-frame load error and destroys the window", async () => {
    const { window, loader } = setup();
    const page = loader.load("https://a.test", signal);
    window.webContents.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", "https://a.test", true);
    await expect(page).rejects.toThrow("Could not load the page: NAME_NOT_RESOLVED");
    expect(window.destroyed).toBe(true);
  });

  it("ignores subframe errors and aborted navigations", async () => {
    const { window, loader } = setup();
    window.loadURL.mockRejectedValueOnce(new Error("ERR_ABORTED (-3) loading"));
    const page = loader.load("https://a.test", signal);
    window.webContents.emit("did-fail-load", {}, -105, "ad", "https://ad.test", false);
    window.webContents.emit("did-fail-load", {}, -3, "ABORTED", "https://a.test", true);
    window.webContents.emit("did-finish-load");
    await expect(page).resolves.toBe("<html></html>");
  });

  it("times out and destroys the window", async () => {
    const { window, loader } = setup(5);
    await expect(loader.load("https://a.test", signal)).rejects.toThrow("The page took too long to load.");
    expect(window.destroyed).toBe(true);
  });

  it("stops when cancelled and destroys the window", async () => {
    const { window, loader } = setup();
    const controller = new AbortController();
    const page = loader.load("https://a.test", controller.signal);
    controller.abort();
    await expect(page).rejects.toThrow("The step was cancelled.");
    expect(window.destroyed).toBe(true);
  });

  it("refuses a page that is too large", async () => {
    const { window, loader } = setup();
    window.webContents.html = "x".repeat(10 * 1024 * 1024 + 1);
    const page = loader.load("https://a.test", signal);
    window.webContents.emit("did-finish-load");
    await expect(page).rejects.toThrow("The page is too large.");
  });
});
