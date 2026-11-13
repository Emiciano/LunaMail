import { AlertCircle, Check, Info, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";

/**
 * Kleine schwarze Insel unten in der Mitte, wie die ActionIsland der Android-App:
 * bestätigt Aktionen, zeigt Fehler und bietet „Rückgängig“ an.
 */
export function ActionIsland() {
  const { island: current, dismissIsland } = useMailStore(useShallow((state) => ({ island: state.island, dismissIsland: state.dismissIsland })));
  const [now, setNow] = useState(Date.now());
  // Die letzte Insel bleibt kurz stehen, damit sie sichtbar abtauchen kann.
  const [shown, setShown] = useState(current);
  useEffect(() => {
    if (current) {
      setShown(current);
      return;
    }
    const timer = window.setTimeout(() => setShown(undefined), 200);
    return () => window.clearTimeout(timer);
  }, [current]);
  const island = current ?? shown;
  const leaving = !current;

  useEffect(() => {
    if (!island?.endsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [island?.endsAt]);

  if (!island) return null;
  const secondsLeft = island.endsAt ? Math.max(0, Math.ceil((island.endsAt - now) / 1000)) : undefined;
  const Icon = island.kind === "error" ? AlertCircle : island.kind === "sending" ? Send : island.kind === "success" ? Check : Info;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483646] flex justify-center px-4">
      <div
        key={island.id}
        role={island.kind === "error" ? "alert" : "status"}
        className={cn(leaving ? "island-leave" : "island-enter", "pointer-events-auto relative flex min-h-11 max-w-[min(560px,100%)] items-center gap-3 rounded-[12px] bg-ink py-1.5 pl-4 pr-1.5 text-[14px] font-medium text-canvas shadow-[0_16px_40px_rgb(0_0_0/0.28)]")}
      >
        <Icon size={16} className={cn("pop-in shrink-0", island.kind === "error" ? "text-danger" : "text-canvas/70")} />
        <span className="min-w-0 flex-1 truncate">
          {island.message}
          {secondsLeft !== undefined ? <span className="ml-1.5 tabular-nums text-canvas/50">{secondsLeft} s</span> : null}
        </span>
        {island.action && island.actionLabel ? (
          <button
            className="pressable shrink-0 rounded-[8px] bg-canvas px-3 py-1.5 text-[13px] font-bold text-ink hover:bg-canvas/90"
            onClick={() => {
              island.action?.();
              dismissIsland();
            }}
          >
            {island.actionLabel}
          </button>
        ) : null}
        <button className="shrink-0 rounded-[8px] p-1.5 text-canvas/50 hover:bg-canvas/10 hover:text-canvas" onClick={dismissIsland} aria-label="Schließen">
          <X size={15} />
        </button>
        {island.endsAt ? <Countdown key={island.id} endsAt={island.endsAt} /> : null}
      </div>
    </div>
  );
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [duration] = useState(() => Math.max(0, endsAt - Date.now()));
  return (
    <span className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full">
      <span className="island-progress block h-full bg-canvas/40" style={{ animationDuration: `${duration}ms` }} />
    </span>
  );
}
