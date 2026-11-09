interface PreventableEvent {
  preventDefault(): void;
}

export interface HardenableContents {
  setWindowOpenHandler(handler: () => { action: "deny" }): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export function mainWindowOptions(preload: string) {
  return {
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  };
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** `devOrigin` is the Vite dev server, which reloads the page. It is null in a packaged build. */
export function hardenContents(contents: HardenableContents, devOrigin: string | null): void {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event: PreventableEvent, url: string) => {
    if (devOrigin === null || !sameOrigin(url, devOrigin)) {
      event.preventDefault();
    }
  });
  contents.on("will-attach-webview", (event: PreventableEvent) => event.preventDefault());
}
