import { app } from "electron";
import { autoUpdater } from "electron-updater";

const STARTUP_CHECK_DELAY_MS = 8_000;

/**
 * @param {{ emit: (event: string, payload: unknown) => void }} options
 */
export function setupAutoUpdater({ emit }) {
  if (!app.isPackaged) {
    return {
      checkForUpdates: async () => ({ skipped: true, reason: "development" }),
      scheduleStartupCheck: () => {}
    };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    emit("app-update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    emit("app-update-status", {
      status: "available",
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    emit("app-update-status", {
      status: "not-available",
      version: info.version
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    emit("app-update-status", {
      status: "downloading",
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    emit("app-update-status", {
      status: "downloaded",
      version: info.version
    });
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 2_000);
  });

  autoUpdater.on("error", (error) => {
    emit("app-update-status", {
      status: "error",
      message: error?.message || String(error)
    });
  });

  async function checkForUpdates() {
    return autoUpdater.checkForUpdates();
  }

  function scheduleStartupCheck() {
    setTimeout(() => {
      checkForUpdates().catch((error) => {
        emit("app-update-status", {
          status: "error",
          message: error?.message || String(error)
        });
      });
    }, STARTUP_CHECK_DELAY_MS);
  }

  return { checkForUpdates, scheduleStartupCheck };
}
