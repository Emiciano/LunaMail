import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useMailStore } from "../stores/mailStore";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accounts, settings, openComposer, openSettings, sync, selectSpecialView, selectAccount, updateSettings } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    settings: state.settings,
    openComposer: state.openComposer,
    openSettings: state.openSettings,
    sync: state.sync,
    selectSpecialView: state.selectSpecialView,
    selectAccount: state.selectAccount,
    updateSettings: state.updateSettings
  })));
  const [query, setQuery] = useState("");

  const commands = useMemo(() => {
    const base = [
      { id: "new-mail", label: "Neue Mail", run: () => openComposer() },
      { id: "sync", label: "Synchronisieren", run: () => void sync(true) },
      { id: "settings", label: "Einstellungen öffnen", run: () => openSettings() },
      { id: "favorites", label: "Favoriten anzeigen", run: () => void selectSpecialView("favorites", accounts[0]?.id ?? 0) },
      { id: "important", label: "Wichtig anzeigen", run: () => void selectSpecialView("important", accounts[0]?.id ?? 0) },
      {
        id: "toggle-dark",
        label: settings.theme === "dark" ? "Lightmode aktivieren" : "Darkmode aktivieren",
        run: () => void updateSettings({ ...settings, theme: settings.theme === "dark" ? "light" : "dark" })
      },
      { id: "focus-search", label: "Suche starten", run: () => document.getElementById("mail-search-input")?.focus() }
    ];
    const accountCommands = accounts.map((account) => ({
      id: `account-${account.id}`,
      label: `Zu Konto wechseln: ${account.displayName}`,
      run: () => void selectAccount(account.id)
    }));
    return [...base, ...accountCommands];
  }, [accounts, openComposer, openSettings, selectAccount, selectSpecialView, settings, sync, updateSettings]);

  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.trim().toLowerCase()));

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-start justify-center bg-black/72 px-4 pt-[12vh]" onClick={onClose}>
      <div className="tr-panel w-[min(760px,calc(100vw-2rem))] overflow-hidden rounded-[10px]" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-14 w-full border-b border-slate-200/70 bg-transparent px-4 text-sm outline-none dark:border-white/[0.07]"
          placeholder="Befehl suchen..."
        />
        <div className="mail-scroll max-h-[420px] overflow-y-auto p-2">
          {filtered.map((command) => (
            <button
              key={command.id}
              className="mb-1 flex h-10 w-full items-center rounded-xl px-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700/45"
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              {command.label}
            </button>
          ))}
          {filtered.length === 0 ? <div className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">Kein Treffer</div> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
