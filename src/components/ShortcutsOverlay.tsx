import { X } from "lucide-react";
import { createPortal } from "react-dom";

export const SHORTCUT_GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: "Navigation",
    items: [
      [["J"], "Nächste Mail"],
      [["K"], "Vorherige Mail"],
      [["Esc"], "Mail schließen"],
      [["Strg", "F"], "Suchen"],
      [["Strg", "K"], "Befehle"],
      [["Leertaste"], "Schnellansicht"]
    ]
  },
  {
    title: "Mail",
    items: [
      [["N"], "Neue Mail"],
      [["R"], "Antworten"],
      [["A"], "Allen antworten"],
      [["F"], "Weiterleiten"],
      [["E"], "Archivieren"],
      [["Entf"], "Löschen"],
      [["S"], "Favorit an/aus"],
      [["U"], "Als ungelesen markieren"],
      [["H"], "Morgen früh erinnern"]
    ]
  },
  {
    title: "Verfassen",
    items: [
      [["Strg", "Enter"], "Senden"],
      [["Esc"], "Schließen (Entwurf bleibt)"]
    ]
  }
];

/** Übersicht aller Tastenkürzel, geöffnet mit „?“. */
export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="overlay-enter fixed inset-0 z-[2147483647] flex items-center justify-center bg-scrim/40 p-6 backdrop-blur-[4px]" onClick={onClose}>
      <section
        role="dialog"
        aria-label="Tastenkürzel"
        className="dialog-enter w-[min(760px,100%)] rounded-[14px] border border-line bg-canvas p-6 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[22px] font-extrabold">Tastenkürzel</h2>
            <p className="mt-0.5 text-[13px] text-label-2">Schneller durch den Posteingang, ohne Maus.</p>
          </div>
          <button className="reader-icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </header>
        <div className="grid gap-6 sm:grid-cols-3">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-label-3">{group.title}</div>
              <ul className="space-y-1.5">
                {group.items.map(([keys, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-ink/85">{label}</span>
                    <span className="flex shrink-0 gap-1">{keys.map((key) => <kbd key={key}>{key}</kbd>)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>,
    document.body
  );
}
