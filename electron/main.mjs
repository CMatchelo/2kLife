import { app, BrowserWindow, dialog, session } from "electron";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateLegacyData } from "../server/data-directory.ts";
import {
  repositoryDataDirectory,
  startBackend,
} from "../server/runtime.ts";

const developmentUrl =
  process.env.TWO_KLIFE_RENDERER_URL === "http://127.0.0.1:5173"
    ? process.env.TWO_KLIFE_RENDERER_URL
    : undefined;
const staticRoot = fileURLToPath(new URL("../dist/", import.meta.url));
let backend;
let quitting = false;
let logFile;

app.setName("2kLife");
app.enableSandbox();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function logError(message, error) {
  const detail = error === undefined ? message : `${message}: ${errorMessage(error)}`;
  console.error(detail);
  if (!logFile) return;
  try {
    appendFileSync(logFile, `${new Date().toISOString()} ERROR ${detail}\n`, "utf8");
  } catch {
    // Logging must never prevent startup or shutdown.
  }
}

function showLoadError(error) {
  logError("The desktop interface could not load", error);
  dialog.showErrorBox(
    "2kLife could not load",
    "The desktop interface could not load. Restart 2kLife. If the problem continues, check the desktop log.",
  );
}

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: "#fff8de",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== new URL(url).origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("render-process-gone", (_event, details) => {
    logError(`Desktop renderer stopped (${details.reason})`);
  });
  window.on("unresponsive", () => logError("Desktop window became unresponsive"));
  void window.loadURL(url).catch(showLoadError);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });

  app.whenReady().then(async () => {
    try {
      const dataDirectory = join(app.getPath("userData"), "data");
      const logsDirectory = join(dataDirectory, "logs");
      mkdirSync(logsDirectory, { recursive: true });
      app.setAppLogsPath(logsDirectory);
      logFile = join(logsDirectory, "desktop.log");

      if (!developmentUrl && !existsSync(join(staticRoot, "index.html")))
        throw new Error(
          "The compiled application is missing. Run pnpm build before starting the desktop production runtime.",
        );
      const migration = await migrateLegacyData(
        repositoryDataDirectory,
        dataDirectory,
      );
      if (Object.values(migration).some(Boolean))
        console.log("Imported existing 2kLife data into desktop storage.");

      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      backend = await startBackend(
        developmentUrl
          ? { port: 4319, dataDirectory, onUnexpectedError: (error) => logError("Backend error", error) }
          : { port: 0, staticRoot, dataDirectory, onUnexpectedError: (error) => logError("Backend error", error) },
      );
      console.log(`2kLife desktop backend: ${backend.url}`);
      createWindow(developmentUrl ?? backend.url);
    } catch (error) {
      logError("2kLife could not start", error);
      dialog.showErrorBox(
        "2kLife could not start",
        errorMessage(error) || "The local backend could not start.",
      );
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && backend)
        createWindow(developmentUrl ?? backend.url);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", (event) => {
    if (quitting || !backend) return;
    event.preventDefault();
    quitting = true;
    void backend
      .close()
      .catch((error) => logError("Could not close the local backend", error))
      .finally(() => app.quit());
  });
}
