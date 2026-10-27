import { Download, RotateCw } from "lucide-react";
import { useAppUpdate } from "../hooks/useAppUpdate";

/** Hinweis unten in der Seitenleiste, sobald eine neue Version bereitsteht. */
export function UpdateBanner() {
  const { state, download, install } = useAppUpdate();
  if (!["available", "downloading", "ready"].includes(state.status) && !(state.status === "error" && state.version)) return null;

  const ready = state.status === "ready";
  const downloading = state.status === "downloading";
  return (
    <div className="rise-in mb-3 rounded-[14px] bg-ink p-3 text-canvas">
      <div className="text-[13px] font-semibold">
        {ready ? "Update bereit" : state.status === "error" ? "Update fehlgeschlagen" : "Neue Version verfügbar"}
      </div>
      <div className="mt-0.5 text-[12px] opacity-70">
        {downloading ? `LunaMail ${state.version} wird geladen … ${state.progress ?? 0} %` : ready ? `LunaMail ${state.version} wird beim Neustart installiert.` : `LunaMail ${state.version}`}
      </div>
      {downloading ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas/20">
          <div className="h-full rounded-full bg-canvas transition-[width] duration-300" style={{ width: `${state.progress ?? 0}%` }} />
        </div>
      ) : (
        <button
          className="pressable mt-2.5 inline-flex h-8 w-full items-center justify-center gap-2 rounded-full bg-canvas text-[13px] font-bold text-ink hover:opacity-90"
          onClick={ready ? install : download}
        >
          {ready ? <RotateCw size={14} /> : <Download size={14} />}
          {ready ? "Neu starten und installieren" : state.status === "error" ? "Erneut versuchen" : "Jetzt installieren"}
        </button>
      )}
    </div>
  );
}
