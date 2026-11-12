import { AlarmClock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { snoozePresets } from "../stores/mailStore";

/** Knopf mit Menü „Später erinnern“: feste Zeitpunkte plus eigener Termin. */
export function SnoozeMenu({ onSnooze, align = "right", trigger, className }: {
  onSnooze: (until: Date) => void;
  align?: "left" | "right";
  trigger?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const presets = useMemo(() => (open ? snoozePresets() : []), [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function choose(until: Date) {
    setOpen(false);
    onSnooze(until);
  }

  const customDate = custom ? new Date(custom) : undefined;
  const customValid = Boolean(customDate && customDate.getTime() > Date.now());

  return (
    <div ref={ref} className={cn("relative", className)} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="reader-icon-button" title="Später erinnern (H)" aria-label="Später erinnern" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {trigger ?? <AlarmClock size={18} />}
      </button>
      {open ? (
        <div className={cn("menu-enter absolute top-full z-[80] mt-2 w-64 rounded-[12px] border border-line bg-canvas p-1.5 shadow-float", align === "right" ? "right-0" : "left-0")}>
          <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-label-3">Später erinnern</div>
          {presets.map((preset) => (
            <button key={preset.id} className="flex h-9 w-full items-center justify-between gap-3 rounded-[8px] px-2.5 text-left text-[14px] font-medium hover:bg-surface" onClick={() => choose(preset.until)}>
              <span>{preset.label}</span>
              <span className="text-[12px] tabular-nums text-label-2">{preset.detail}</span>
            </button>
          ))}
          <div className="mt-1 border-t border-line px-1 pb-0.5 pt-2">
            <div className="flex items-center gap-1.5">
              <input
                type="datetime-local"
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-[8px] bg-surface px-2 text-[13px] text-ink outline-none"
                aria-label="Eigener Zeitpunkt"
              />
              <button className="accent-primary h-8 rounded-[8px] px-2.5 text-[13px] font-bold disabled:opacity-30" disabled={!customValid} onClick={() => customDate && choose(customDate)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
