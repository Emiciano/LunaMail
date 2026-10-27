import { useEffect, useState } from "react";
import type { UpdateState } from "../services/desktop";

/** Update-Zustand der Desktop-App, live aus dem Hauptprozess. */
export function useAppUpdate() {
  const updates = window.electronAPI?.updates;
  const [state, setState] = useState<UpdateState>({ status: updates ? "idle" : "unsupported" });

  useEffect(() => {
    const bridge = window.electronAPI;
    if (!bridge?.updates) return;
    let active = true;
    void bridge.updates.status().then((next) => {
      if (active) setState(next);
    }).catch(() => undefined);
    const off = bridge.on<UpdateState>("update-status", (next) => setState(next));
    return () => {
      active = false;
      off();
    };
  }, []);

  return {
    state,
    check: () => void updates?.check().then(setState).catch(() => undefined),
    download: () => void updates?.download().catch(() => undefined),
    install: () => void updates?.install().catch(() => undefined)
  };
}
