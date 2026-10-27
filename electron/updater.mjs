import { app } from "electron";
import updaterPackage from "electron-updater";

const { autoUpdater } = updaterPackage;

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Updates über die GitHub-Releases (latest.yml aus release.yml). Gesucht wird automatisch,
 * geladen und installiert wird erst, wenn man in der App auf „Installieren“ tippt.
 * electron-updater prüft die SHA-512-Prüfsumme aus latest.yml vor der Installation.
 */
export class AppUpdater {
  constructor(emit) {
    this.emit = emit;
    this.state = app.isPackaged ? { status: "idle" } : { status: "unsupported" };
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("checking-for-update", () => this.set({ status: "checking" }));
    autoUpdater.on("update-available", (info) => this.set({ status: "available", version: info.version }));
    autoUpdater.on("update-not-available", () => this.set({ status: "current", checkedAt: new Date().toISOString() }));
    autoUpdater.on("download-progress", (progress) => this.set({ ...this.state, status: "downloading", progress: Math.round(progress.percent) }));
    autoUpdater.on("update-downloaded", (info) => this.set({ status: "ready", version: info.version }));
    autoUpdater.on("error", (error) => this.set({ ...this.state, status: "error", error: shortError(error) }));
  }

  start() {
    if (!app.isPackaged) return;
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS).unref?.();
    setInterval(() => void this.check(), CHECK_INTERVAL_MS).unref?.();
  }

  set(state) {
    this.state = state;
    this.emit("update-status", state);
  }

  async check() {
    if (!app.isPackaged) return this.state;
    if (["checking", "downloading", "ready"].includes(this.state.status)) return this.state;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.set({ status: "error", error: shortError(error) });
    }
    return this.state;
  }

  async download() {
    if (this.state.status !== "available" && !(this.state.status === "error" && this.state.version)) return this.state;
    this.set({ status: "downloading", version: this.state.version, progress: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.set({ status: "error", version: this.state.version, error: shortError(error) });
    }
    return this.state;
  }

  install(prepareQuit) {
    if (this.state.status !== "ready") return false;
    prepareQuit();
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  }
}

function shortError(error) {
  const message = error instanceof Error ? error.message : String(error);
  // Direkt nach dem Veröffentlichen eines Releases baut GitHub die Installationsdatei noch
  // (rund drei Minuten); bis dahin fehlt latest.yml und der Abruf endet mit 404.
  if (/latest\.yml/.test(message) && /404/.test(message)) {
    return "Die neue Version wird gerade noch gebaut. Bitte in ein paar Minuten erneut suchen.";
  }
  return message.split("\n")[0].slice(0, 200);
}
