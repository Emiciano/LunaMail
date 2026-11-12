import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";

/** Kleiner Bestätigungsdialog im App-Design, optional mit Zusatz-Häkchen. */
export function ConfirmDialog({ title, message, confirmLabel, danger = false, option, onConfirm, onCancel, icon }: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  option?: { label: string; defaultChecked?: boolean };
  icon?: ReactNode;
  onConfirm: (optionChecked: boolean) => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(option?.defaultChecked ?? false);

  useEffect(() => {
    // Solange der Dialog offen ist, greifen die Tastenkürzel der App nicht.
    function onKey(event: KeyboardEvent) {
      event.stopImmediatePropagation();
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return createPortal(
    <div className="overlay-enter fixed inset-0 z-[2147483647] flex items-center justify-center bg-scrim/40 p-6 backdrop-blur-[3px]" onClick={onCancel}>
      <section role="alertdialog" aria-label={title} className="dialog-enter w-[min(420px,100%)] rounded-[14px] border border-line bg-canvas p-6 shadow-float" onClick={(event) => event.stopPropagation()}>
        {icon ? <div className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-[12px]", danger ? "bg-danger/10 text-danger" : "bg-surface text-ink")}>{icon}</div> : null}
        <h2 className="font-display text-[20px] font-extrabold leading-6">{title}</h2>
        <div className="mt-2 text-[14px] leading-[21px] text-label-2">{message}</div>
        {option ? (
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[14px] font-medium">
            <input type="checkbox" className="mail-checkbox h-[18px] w-[18px]" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            {option.label}
          </label>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button className="pressable h-10 rounded-[10px] px-4 text-[14px] font-semibold text-label-2 hover:bg-surface hover:text-ink" onClick={onCancel}>Abbrechen</button>
          <button
            autoFocus
            className={cn("pressable h-10 rounded-[10px] px-4 text-[14px] font-bold", danger ? "bg-danger text-white hover:bg-danger/90" : "accent-primary")}
            onClick={() => onConfirm(checked)}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
