import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, session } from "electron";
import bundledHumanizeRules from "../../resources/humanizer/SKILL.md?raw";
import { createHttpPageLoader } from "../core/extractor/extract";
import { ProjectStore } from "../core/store/projectStore";
import { SettingsStore } from "../core/store/settingsStore";
import { registerIpc } from "./ipc/dispatch";
import {
  createHiddenWindowLoader,
  EXTRACTION_PARTITION,
  type HiddenSession,
  type HiddenWindow,
} from "./pageLoader/hiddenWindowLoader";
import { createAppService } from "./service/appService";
import { createConnector } from "./service/connectorFactory";
import { hardenContents, mainWindowOptions } from "./windowSecurity";

const rendererUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;

function openMainWindow(): void {
  const preload = join(import.meta.dirname, "../preload/index.cjs");
  const window = new BrowserWindow(mainWindowOptions(preload));
  mainWindow = window;
  hardenContents(window.webContents as never, rendererUrl ?? null);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    mainWindow = null;
  });
  if (rendererUrl === undefined) {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  } else {
    void window.loadURL(rendererUrl);
  }
}

async function launch(): Promise<void> {
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  const projectsRoot = join(app.getPath("documents"), "Guio");
  await mkdir(projectsRoot, { recursive: true });

  const hiddenWindowLoader = createHiddenWindowLoader({
    createWindow: (options) => new BrowserWindow(options) as unknown as HiddenWindow,
    session: session.fromPartition(EXTRACTION_PARTITION) as unknown as HiddenSession,
  });

  const { service, startup } = createAppService({
    store: new ProjectStore(projectsRoot),
    settings: new SettingsStore(app.getPath("userData")),
    createConnector,
    loaders: [createHttpPageLoader(), hiddenWindowLoader],
    bundledHumanizeRules,
    now: () => new Date().toISOString(),
  });

  await startup();
  registerIpc(
    { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    service,
    (sender) => sender === mainWindow?.webContents,
  );
  openMainWindow();
}

app.on("window-all-closed", () => app.quit());

// No top-level await: the ready event fires only after this module finishes loading.
launch().catch((error: unknown) => {
  console.error("Guio failed to start.", error);
  app.exit(1);
});
