import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LunaBackend } from "./backend.mjs";
import { setupAutoUpdater } from "./updater.mjs";

app.commandLine.appendSwitch("js-flags", "--max-old-space-size=128");
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isDev = !app.isPackaged;
let mainWindow;
let tray;
let quitting = false;
let backend;
let appUpdater;

function emit(event, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, payload);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "LunaMail",
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    backgroundColor: "#0f1216",
    show: false,
    icon: path.join(root, "src-tauri", "icons", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:1420");
  } else {
    mainWindow.loadFile(path.join(root, "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("maximize", () => emit("window-maximized-changed", true));
  mainWindow.on("unmaximize", () => emit("window-maximized-changed", false));
  mainWindow.on("close", (event) => {
    if (quitting || !backend?.settings.runInBackground) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(root, "src-tauri", "icons", "icon.ico"));
  tray = new Tray(icon);
  tray.setToolTip("LunaMail");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "LunaMail öffnen", click: showWindow },
    { label: "Jetzt synchronisieren", click: () => void backend.invoke("sync_all_messages", {}).catch(() => undefined) },
    { type: "separator" },
    { label: "Beenden", click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on("double-click", showWindow);
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

function registerIpc() {
  ipcMain.handle("lunamail:invoke", async (_event, command, args) => {
    if (command === "show_main_window_cmd") return showWindow();
    if (command === "request_close") {
      if (backend.settings.runInBackground) mainWindow.hide();
      else mainWindow.close();
      return;
    }
    if (command === "open_external_link") {
      const url = new URL(String(args.url));
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw new Error("Link-Schema ist nicht erlaubt.");
      await shell.openExternal(url.toString());
      return;
    }
    return backend.invoke(command, args || {});
  });
  ipcMain.handle("lunamail:app-version", () => app.getVersion());
  ipcMain.handle("lunamail:open-dialog", async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title,
      properties: options.multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: options.filters
    });
    if (result.canceled) return null;
    return options.multiple ? result.filePaths : result.filePaths[0] || null;
  });
  ipcMain.handle("lunamail:save-dialog", async (_event, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters
    });
    return result.canceled ? null : result.filePath || null;
  });
  ipcMain.handle("lunamail:confirm", async (_event, message, options = {}) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: options.kind === "warning" ? "warning" : "question",
      title: options.title || "LunaMail",
      message,
      buttons: [options.okLabel || "OK", options.cancelLabel || "Abbrechen"],
      defaultId: 0,
      cancelId: 1
    });
    return result.response === 0;
  });
  ipcMain.handle("lunamail:check-for-updates", async () => {
    if (!appUpdater) return { skipped: true, reason: "development" };
    return appUpdater.checkForUpdates();
  });
  ipcMain.handle("lunamail:download-update", async () => {
    if (!appUpdater) return { skipped: true, reason: "development" };
    return appUpdater.downloadUpdate();
  });
  ipcMain.handle("lunamail:release-history", async () => {
    if (!appUpdater) return [];
    return appUpdater.getReleaseHistory();
  });
  ipcMain.handle("lunamail:window", (_event, action, value) => {
    if (!mainWindow) return false;
    if (action === "minimize") mainWindow.minimize();
    if (action === "toggle-maximize") mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    if (action === "set-theme") nativeTheme.themeSource = value;
    if (action === "show") mainWindow.show();
    if (action === "focus") mainWindow.focus();
    return action === "is-maximized" ? mainWindow.isMaximized() : true;
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.lunamail.app");
  backend = new LunaBackend({
    dataDir: app.getPath("userData"),
    emit,
    showWindow,
    openExternal: (url) => shell.openExternal(url)
  });
  await backend.init();
  registerIpc();
  appUpdater = setupAutoUpdater({ emit });
  createWindow();
  createTray();
  appUpdater.scheduleStartupCheck();
});

app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", (event) => {
  event?.preventDefault?.();
});
app.on("activate", showWindow);
