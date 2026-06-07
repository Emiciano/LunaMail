import { invokeDesktop, isDesktop } from "./desktop";

export type NotificationTarget = {
  emailId: number;
  accountId: number;
  folderId: number;
};

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    return result === "granted";
  }
  return false;
}

export async function showDesktopNotification(options: {
  title: string;
  body: string;
  silent: boolean;
  target: NotificationTarget;
  onOpen: (target: NotificationTarget) => void | Promise<void>;
}) {
  if (typeof Notification === "undefined") return;

  const notification = new Notification(options.title, {
    body: options.body,
    silent: options.silent
  });

  notification.onclick = () => {
    void (async () => {
      if (isDesktop) {
        await invokeDesktop("show_main_window_cmd");
        await window.electronAPI?.window.show();
        await window.electronAPI?.window.focus();
      } else {
        window.focus();
      }
      await options.onOpen(options.target);
    })();
  };
}
