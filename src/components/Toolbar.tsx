import { Minus, Search, Settings, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { mailService } from "../services/mailService";
import { isDesktop } from "../services/desktop";
import { useMailStore } from "../stores/mailStore";

const iconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/45 bg-white/42 text-slate-700 shadow-none transition-colors duration-150 ease-out hover:bg-white/56 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.12]";

export function Toolbar() {
  const { settings, selectedView, query, search, openSettings } = useMailStore(useShallow((state) => ({
    settings: state.settings,
    selectedView: state.selectedView,
    query: state.query,
    search: state.search,
    openSettings: state.openSettings
  })));
  const [searchDraft, setSearchDraft] = useState(query);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    setSearchDraft(query);
  }, [query, selectedView]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search(searchDraft);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search]);

  useEffect(() => {
    if (!isDesktop) return;
    const refreshMaximized = async () => setIsMaximized(Boolean(await window.electronAPI?.window.isMaximized()));
    void refreshMaximized();
    return window.electronAPI?.window.onMaximizedChange(setIsMaximized);
  }, []);

  function handleTitlebarMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!isDesktop) return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".titlebar-no-drag, button, input, textarea, select, a, [role='button']")) return;
    void window.electronAPI?.window.startDragging();
  }

  const compact = settings.layoutMode === "compact";

  return (
    <div
      className={cn("titlebar-drag glass-panel flex items-center gap-2 rounded-[16px] px-2.5 motion-soft", "h-12", compact && "px-2")}
      onMouseDown={handleTitlebarMouseDown}
    >
      <div className="flex min-w-[124px] items-center gap-2 px-1">
        <div className="h-7 w-7 overflow-hidden rounded-lg bg-slate-950/92 dark:bg-white/12">
          <img src="./icon.png" alt="" className="h-full w-full object-cover" />
        </div>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">LunaMail</span>
      </div>
      <div className="flex flex-1 justify-center px-2">
        <div className="titlebar-no-drag flex h-9 w-full max-w-[430px] items-center gap-2 rounded-xl border border-white/45 bg-white/42 px-2.5 text-slate-500 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-slate-400">
          <Search size={17} />
          <input
            id="mail-search-input"
            className="titlebar-no-drag h-full min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
            placeholder={selectedView === "folder" ? "Suchen" : "In Ansicht suchen"}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>
      </div>
      <button className={cn("titlebar-no-drag", iconButton)} title="Einstellungen" onClick={openSettings}>
        <Settings size={18} />
      </button>
      {isDesktop ? (
        <div className="titlebar-no-drag ml-1 flex items-center gap-1 rounded-xl border border-white/45 bg-white/42 p-1 dark:border-white/[0.12] dark:bg-white/[0.06]">
          <button
            type="button"
            className="titlebar-no-drag inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/60 dark:text-slate-200 dark:hover:bg-white/[0.14]"
            title="Minimieren"
            onClick={() => void window.electronAPI?.window.minimize()}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="titlebar-no-drag inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/60 dark:text-slate-200 dark:hover:bg-white/[0.14]"
            title={isMaximized ? "Wiederherstellen" : "Maximieren"}
            onClick={() => void window.electronAPI?.window.toggleMaximize()}
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            className="titlebar-no-drag inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-red-500 hover:text-white dark:text-slate-200"
            title={settings.runInBackground ? "Minimieren (läuft im Hintergrund weiter)" : "Schließen"}
            onClick={() => void mailService.requestClose()}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="w-2" />
      )}
    </div>
  );
}
