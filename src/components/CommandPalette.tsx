import { AlarmClock, Archive, CornerDownLeft, Inbox, Keyboard, LayoutDashboard, Moon, RefreshCw, Search, Settings, SquarePen, Star, Sun, AlertCircle, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";

type Command = { id: string; label: string; group: string; icon: ReactNode; hint?: string; run: () => void };

/** Befehlsleiste (Strg+K): Ansichten, Aktionen und Konten, per Tastatur bedienbar. */
export function CommandPalette({ open, onClose, onShowShortcuts }: { open: boolean; onClose: () => void; onShowShortcuts: () => void }) {
  const { accounts, settings, selectedEmail, openComposer, openSettings, sync, selectSpecialView, selectAccount, updateSettings, openDashboard, openUnifiedInbox, openSnoozed, archiveSelected, replyToSelected } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    settings: state.settings,
    selectedEmail: state.selectedEmail,
    openComposer: state.openComposer,
    openSettings: state.openSettings,
    sync: state.sync,
    selectSpecialView: state.selectSpecialView,
    selectAccount: state.selectAccount,
    updateSettings: state.updateSettings,
    openDashboard: state.openDashboard,
    openUnifiedInbox: state.openUnifiedInbox,
    openSnoozed: state.openSnoozed,
    archiveSelected: state.archiveSelected,
    replyToSelected: state.replyToSelected
  })));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const firstAccount = accounts[0]?.id ?? 0;
    const list: Command[] = [
      { id: "new-mail", group: "Aktionen", label: "Neue Mail", icon: <SquarePen size={16} />, hint: "N", run: () => openComposer() },
      { id: "sync", group: "Aktionen", label: "Alle Konten synchronisieren", icon: <RefreshCw size={16} />, run: () => void sync(true) },
      { id: "search", group: "Aktionen", label: "Suchen", icon: <Search size={16} />, hint: "Strg F", run: () => window.setTimeout(() => document.getElementById("mail-search-input")?.focus(), 0) },
      ...(selectedEmail ? [
        { id: "reply", group: "Aktionen", label: "Antworten", icon: <CornerDownLeft size={16} />, hint: "R", run: () => replyToSelected() },
        { id: "archive", group: "Aktionen", label: "Archivieren", icon: <Archive size={16} />, hint: "E", run: () => void archiveSelected() }
      ] : []),
      { id: "dashboard", group: "Gehe zu", label: "Dashboard", icon: <LayoutDashboard size={16} />, run: () => openDashboard() },
      { id: "inbox", group: "Gehe zu", label: "Alle Posteingänge", icon: <Inbox size={16} />, run: () => void openUnifiedInbox() },
      { id: "snoozed", group: "Gehe zu", label: "Erinnerungen", icon: <AlarmClock size={16} />, run: () => void openSnoozed() },
      { id: "favorites", group: "Gehe zu", label: "Favoriten", icon: <Star size={16} />, run: () => void selectSpecialView("favorites", firstAccount) },
      { id: "important", group: "Gehe zu", label: "Wichtig", icon: <AlertCircle size={16} />, run: () => void selectSpecialView("important", firstAccount) },
      ...accounts.map((account) => ({
        id: `account-${account.id}`,
        group: "Konten",
        label: account.displayName || account.email,
        icon: <UserRound size={16} />,
        run: () => void selectAccount(account.id)
      })),
      {
        id: "theme",
        group: "Einstellungen",
        label: settings.theme === "light" ? "Dunkles Design" : "Helles Design",
        icon: settings.theme === "light" ? <Moon size={16} /> : <Sun size={16} />,
        run: () => void updateSettings({ ...settings, theme: settings.theme === "light" ? "dark" : "light" })
      },
      { id: "settings", group: "Einstellungen", label: "Einstellungen öffnen", icon: <Settings size={16} />, run: () => openSettings() },
      { id: "shortcuts", group: "Einstellungen", label: "Tastenkürzel anzeigen", icon: <Keyboard size={16} />, hint: "?", run: onShowShortcuts }
    ];
    return list;
  }, [accounts, archiveSelected, onShowShortcuts, openComposer, openDashboard, openSettings, openSnoozed, openUnifiedInbox, replyToSelected, selectAccount, selectSpecialView, selectedEmail, settings, sync, updateSettings]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? commands.filter((command) => command.label.toLowerCase().includes(term) || command.group.toLowerCase().includes(term)) : commands;
  }, [commands, query]);

  useEffect(() => {
    setActive((index) => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function run(command?: Command) {
    if (!command) return;
    onClose();
    command.run();
  }

  let lastGroup = "";
  return createPortal(
    <div className="overlay-enter fixed inset-0 z-[2147483647] flex items-start justify-center bg-scrim/30 px-4 pt-[14vh] backdrop-blur-[3px]" onClick={onClose}>
      <div className="dialog-enter w-[min(620px,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-line bg-canvas shadow-float" onClick={(event) => event.stopPropagation()}>
        <label className="flex h-14 items-center gap-3 border-b border-line px-4 text-label-2">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(filtered[active]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            className="h-full flex-1 bg-transparent text-[15px] text-ink outline-none focus-visible:outline-none placeholder:text-label-3"
            placeholder="Befehl oder Ansicht suchen …"
          />
          <kbd>Esc</kbd>
        </label>
        <div ref={listRef} className="mail-scroll max-h-[420px] overflow-y-auto p-1.5">
          {filtered.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : undefined;
            lastGroup = command.group;
            return (
              <div key={command.id} className="stagger-item" style={{ "--i": index } as CSSProperties}>
                {header ? <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-label-3">{header}</div> : null}
                <button
                  data-index={index}
                  className={cn("flex h-10 w-full items-center gap-3 rounded-[8px] px-2.5 transition-colors duration-100 text-left text-[14px] font-medium", index === active ? "bg-surface text-ink" : "text-ink/85")}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(command)}
                >
                  <span className="text-label-2">{command.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint ? <kbd>{command.hint}</kbd> : null}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 ? <div className="px-3 py-8 text-center text-[14px] text-label-2">Kein Treffer</div> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
