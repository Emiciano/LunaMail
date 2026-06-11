const { contextBridge, ipcRenderer } = require("electron");

const allowedEvents = new Set([
  "sync-account-complete",
  "sync-account-error",
  "email-hydrated",
  "window-maximized-changed",
  "app-update-status"
]);

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (command, args = {}) => ipcRenderer.invoke("lunamail:invoke", command, args),
  on: (event, callback) => {
    if (!allowedEvents.has(event)) throw new Error(`Unzulässiges Event: ${event}`);
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
  getVersion: () => ipcRenderer.invoke("lunamail:app-version"),
  checkForUpdates: () => ipcRenderer.invoke("lunamail:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("lunamail:download-update"),
  getReleaseHistory: () => ipcRenderer.invoke("lunamail:release-history"),
  openDialog: (options) => ipcRenderer.invoke("lunamail:open-dialog", options),
  saveDialog: (options) => ipcRenderer.invoke("lunamail:save-dialog", options),
  confirm: (message, options) => ipcRenderer.invoke("lunamail:confirm", message, options),
  window: {
    minimize: () => ipcRenderer.invoke("lunamail:window", "minimize"),
    toggleMaximize: () => ipcRenderer.invoke("lunamail:window", "toggle-maximize"),
    isMaximized: () => ipcRenderer.invoke("lunamail:window", "is-maximized"),
    startDragging: () => Promise.resolve(),
    setTheme: (theme) => ipcRenderer.invoke("lunamail:window", "set-theme", theme),
    show: () => ipcRenderer.invoke("lunamail:window", "show"),
    focus: () => ipcRenderer.invoke("lunamail:window", "focus"),
    onMaximizedChange: (callback) => {
      const listener = (_event, maximized) => callback(maximized);
      ipcRenderer.on("window-maximized-changed", listener);
      return () => ipcRenderer.removeListener("window-maximized-changed", listener);
    }
  }
});
