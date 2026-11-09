import type { PageLoader } from "../../core/extractor/extract";

export const EXTRACTION_PARTITION = "guio-extraction";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 10 * 1024 * 1024;
const ERR_ABORTED = -3;

export const hiddenWindowOptions = {
  show: false,
  webPreferences: {
    partition: EXTRACTION_PARTITION,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
  },
};

interface PreventableEvent {
  preventDefault(): void;
}

export interface HiddenContents {
  setWindowOpenHandler(handler: () => { action: "deny" }): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
  executeJavaScript(code: string): Promise<unknown>;
}

export interface HiddenWindow {
  webContents: HiddenContents;
  loadURL(url: string): Promise<unknown>;
  destroy(): void;
  isDestroyed(): boolean;
}

export interface HiddenSession {
  on(event: "will-download", listener: (event: PreventableEvent) => void): unknown;
  setPermissionRequestHandler(
    handler: (contents: unknown, permission: string, callback: (granted: boolean) => void) => void,
  ): void;
}

export interface HiddenWindowDeps {
  createWindow(options: typeof hiddenWindowOptions): HiddenWindow;
  session: HiddenSession;
  timeoutMs?: number;
}

function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function createHiddenWindowLoader(deps: HiddenWindowDeps): PageLoader {
  deps.session.on("will-download", (event) => event.preventDefault());
  deps.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  return {
    name: "hidden window",
    load(url, signal) {
      const window = deps.createWindow(hiddenWindowOptions);
      const contents = window.webContents;

      return new Promise<string>((resolve, reject) => {
        let settled = false;
        const settle = (finish: () => void): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          if (!window.isDestroyed()) {
            window.destroy();
          }
          finish();
        };
        const fail = (message: string): void => settle(() => reject(new Error(message)));
        const onAbort = (): void => fail("The step was cancelled.");
        const timer = setTimeout(() => fail("The page took too long to load."), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });

        const guardNavigation = (event: PreventableEvent, target: string): void => {
          if (!isWebUrl(target)) {
            event.preventDefault();
          }
        };
        contents.setWindowOpenHandler(() => ({ action: "deny" }));
        contents.on("will-navigate", guardNavigation);
        contents.on("will-redirect", guardNavigation);
        contents.on(
          "did-fail-load",
          (_event: unknown, code: number, description: string, _url: string, isMainFrame: boolean) => {
            if (isMainFrame && code !== ERR_ABORTED) {
              fail(`Could not load the page: ${description}`);
            }
          },
        );
        contents.on("did-finish-load", () => {
          contents.executeJavaScript("document.documentElement.outerHTML").then(
            (html) => {
              if (typeof html !== "string") {
                fail("The page returned no document.");
              } else if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
                fail("The page is too large.");
              } else {
                settle(() => resolve(html));
              }
            },
            (error: Error) => fail(error.message),
          );
        });

        window.loadURL(url).catch((error: Error) => {
          if (!error.message.includes("ERR_ABORTED")) {
            fail(error.message);
          }
        });
      });
    },
  };
}
