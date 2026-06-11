import { Download, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isDesktop, listenDesktop, type AppUpdateStatus } from "../services/desktop";

export function UpdatePrompt() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    let unsubscribe = () => {};
    let disposed = false;
    void listenDesktop<AppUpdateStatus>("app-update-status", ({ payload }) => {
      setStatus(payload);
      if (payload.status === "available") setVisible(true);
      if (payload.status === "error") setVisible(false);
    }).then((removeListener) => {
      if (disposed) {
        removeListener();
        return;
      }
      unsubscribe = removeListener;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  if (!visible || !status || !["available", "downloading", "downloaded"].includes(status.status)) {
    return null;
  }

  const version = "version" in status ? status.version : "";
  const downloading = status.status === "downloading";
  const downloaded = status.status === "downloaded";

  async function installUpdate() {
    try {
      await window.electronAPI?.downloadUpdate();
    } catch (error) {
      setStatus({
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      setVisible(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/76 p-6">
      <section className="w-[min(460px,calc(100vw-2rem))] rounded-[12px] border border-white/[0.08] bg-[#111] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.16)] text-[rgb(var(--accent))]">
            <Sparkles size={20} />
          </div>
          {!downloading && !downloaded ? (
            <button
              className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06] hover:text-white"
              onClick={() => setVisible(false)}
              title="Später"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>

        <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em]">
          {downloaded ? "Update wird installiert" : downloading ? "Update wird heruntergeladen" : "Neue Version verfügbar"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/55">
          {downloaded
            ? `LunaMail ${version} wurde heruntergeladen. Der Installer startet gleich.`
            : downloading
              ? `LunaMail ${version} wird vorbereitet. Bitte lasse die App geöffnet.`
              : `LunaMail ${version} ist verfügbar. Möchtest du das Update jetzt herunterladen und installieren?`}
        </p>

        {downloading ? (
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs text-white/45">
              <span>Download</span>
              <span>{Math.round(status.percent)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, status.percent))}%` }}
              />
            </div>
          </div>
        ) : null}

        {!downloading && !downloaded ? (
          <div className="mt-7 flex justify-end gap-3">
            <button
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 hover:bg-white/[0.06] hover:text-white"
              onClick={() => setVisible(false)}
            >
              Später
            </button>
            <button
              className="accent-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              onClick={() => void installUpdate()}
            >
              <Download size={16} />
              Update installieren
            </button>
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
