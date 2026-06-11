import { app } from "electron";
import updaterPackage from "electron-updater";

const { autoUpdater } = updaterPackage;

const STARTUP_CHECK_DELAY_MS = 8_000;
const RELEASES_URL = "https://api.github.com/repos/Emiciano/LunaMail/releases?per_page=8";

/**
 * @param {{ emit: (event: string, payload: unknown) => void }} options
 */
export function setupAutoUpdater({ emit }) {
  if (!app.isPackaged) {
    return {
      checkForUpdates: async () => ({ skipped: true, reason: "development" }),
      downloadUpdate: async () => ({ skipped: true, reason: "development" }),
      getReleaseHistory,
      scheduleStartupCheck: () => {}
    };
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  let updateAvailable = false;
  let downloadRequested = false;
  let availableVersion = "";

  autoUpdater.on("checking-for-update", () => {
    emit("app-update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    updateAvailable = true;
    availableVersion = info.version;
    emit("app-update-status", {
      status: "available",
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    updateAvailable = false;
    availableVersion = "";
    emit("app-update-status", {
      status: "not-available",
      version: info.version
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    emit("app-update-status", {
      status: "downloading",
      version: availableVersion,
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
    if (downloadRequested) {
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 1_500);
    }
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

  async function downloadUpdate() {
    if (!updateAvailable) {
      throw new Error("Es ist kein Update zum Herunterladen verfügbar.");
    }
    downloadRequested = true;
    try {
      return await autoUpdater.downloadUpdate();
    } catch (error) {
      downloadRequested = false;
      throw error;
    }
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

  return { checkForUpdates, downloadUpdate, getReleaseHistory, scheduleStartupCheck };
}

async function getReleaseHistory() {
  const response = await fetch(RELEASES_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "LunaMail-Updater"
    }
  });
  if (!response.ok) {
    throw new Error(`Versionsliste konnte nicht geladen werden (${response.status}).`);
  }
  const releases = await response.json();
  return releases
    .filter((release) => !release.draft)
    .slice(0, 6)
    .map((release) => ({
      version: String(release.tag_name || release.name || "").replace(/^v/i, ""),
      name: String(release.name || release.tag_name || "LunaMail"),
      publishedAt: release.published_at || release.created_at,
      url: release.html_url,
      prerelease: Boolean(release.prerelease)
    }));
}
