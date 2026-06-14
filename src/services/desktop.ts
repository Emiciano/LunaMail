export type DesktopEvent<T> = { payload: T };

export type AppRelease = {
  version: string;
  name: string;
  publishedAt?: string;
  url: string;
  prerelease: boolean;
};

type ElectronBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  on<T>(event: string, callback: (payload: T) => void): () => void;
  getVersion(): Promise<string>;
  getReleaseHistory(): Promise<AppRelease[]>;
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

export function openExternalLink(url: string) {
  return invokeDesktop<void>("open_external_link", { url });
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
