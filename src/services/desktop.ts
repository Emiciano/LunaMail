export type DesktopEvent<T> = { payload: T };

export type AppUpdateStatus =
  | { status: "checking" }
  | { status: "available"; version: string; releaseNotes?: string }
  | { status: "not-available"; version?: string }
  | { status: "downloading"; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

type ElectronBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  on<T>(event: string, callback: (payload: T) => void): () => void;
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<unknown>;
  openDialog(options: Record<string, unknown>): Promise<string | string[] | null>;
  saveDialog(options: Record<string, unknown>): Promise<string | null>;
  confirm(message: string, options?: Record<string, unknown>): Promise<boolean>;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    isMaximized(): Promise<boolean>;
    startDragging(): Promise<void>;
    setTheme(theme: "light" | "dark"): Promise<void>;
    show(): Promise<void>;
    focus(): Promise<void>;
    onMaximizedChange(callback: (maximized: boolean) => void): () => void;
  };
};

declare global {
  interface Window {
    electronAPI?: ElectronBridge;
  }
}

export const isDesktop = Boolean(window.electronAPI);

export function invokeDesktop<T>(command: string, args: Record<string, unknown> = {}) {
  if (!window.electronAPI) {
    return Promise.reject(new Error("Desktop-Bridge ist nicht verfügbar."));
  }
  return window.electronAPI.invoke<T>(command, args);
}

export function listenDesktop<T>(
  event: string,
  callback: (event: DesktopEvent<T>) => void
): Promise<() => void> {
  if (!window.electronAPI) return Promise.resolve(() => undefined);
  return Promise.resolve(
    window.electronAPI.on<T>(event, (payload) => callback({ payload }))
  );
}

export const desktopDialog = {
  open: (options: Record<string, unknown>) =>
    window.electronAPI?.openDialog(options) ?? Promise.resolve(null),
  save: (options: Record<string, unknown>) =>
    window.electronAPI?.saveDialog(options) ?? Promise.resolve(null),
  confirm: (message: string, options?: Record<string, unknown>) =>
    window.electronAPI?.confirm(message, options) ?? Promise.resolve(window.confirm(message))
};
