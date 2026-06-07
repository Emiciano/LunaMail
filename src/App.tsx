import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AppLayout } from "./layouts/AppLayout";
import { CommandPalette } from "./components/CommandPalette";
import { Composer } from "./components/Composer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { QuickLook } from "./components/QuickLook";
import { SettingsPanel } from "./components/SettingsPanel";
import { useTheme } from "./hooks/useTheme";
import { ensureNotificationPermission } from "./services/notifications";
import { mailService } from "./services/mailService";
import { isDesktop } from "./services/desktop";
import { setupMailStoreListeners, useMailStore } from "./stores/mailStore";

export default function App() {
  const { accounts, hasSynced, syncing, sync, realtimeSyncInboxes, closeSettings, composer, selectedEmail, loadInitial, startupStatus, settings, settingsOpen, openComposer, replyToSelected, deleteSelected } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    hasSynced: state.hasSynced,
    syncing: state.syncing,
    sync: state.sync,
    realtimeSyncInboxes: state.realtimeSyncInboxes,
    closeSettings: state.closeSettings,
    composer: state.composer,
    selectedEmail: state.selectedEmail,
    loadInitial: state.loadInitial,
    startupStatus: state.startupStatus,
    settings: state.settings,
    settingsOpen: state.settingsOpen,
    openComposer: state.openComposer,
    replyToSelected: state.replyToSelected,
    deleteSelected: state.deleteSelected
  })));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickLookOpen, setQuickLookOpen] = useState(false);
  const [pageHidden, setPageHidden] = useState(document.hidden);
  const [bootReady, setBootReady] = useState(false);
  useTheme(settings.theme, settings.accentColor);

  useEffect(() => {
    setupMailStoreListeners();
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await Promise.all([
          loadInitial(),
          new Promise((resolve) => window.setTimeout(resolve, 500))
        ]);
      } finally {
        if (active) setBootReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadInitial]);

  useEffect(() => {
    const bootSplash = document.getElementById("boot-splash");
    if (!bootSplash || !bootReady) return;
    bootSplash.classList.add("boot-splash-hidden");
    const timer = window.setTimeout(() => bootSplash.remove(), 260);
    return () => window.clearTimeout(timer);
  }, [bootReady]);

  useEffect(() => {
    if (!settings.notificationsEnabled || !isDesktop) return;
    void ensureNotificationPermission();
  }, [settings.notificationsEnabled]);

  useEffect(() => {
    if (accounts.length === 0 || hasSynced || syncing) return;
    void sync(false);
  }, [accounts.length, hasSynced, syncing, sync]);

  useEffect(() => {
    if (accounts.length === 0) return;
    if (isDesktop) return;
    const baseInterval = Math.max(1, settings.syncIntervalMinutes || 1) * 60_000;
    const intervalMs = pageHidden ? 30_000 : baseInterval;
    const isDevHost = window.location.hostname === "localhost";
    if (isDevHost) {
      console.debug("[sync] polling fallback active", { intervalMs, accounts: accounts.length });
    }
    const timer = window.setInterval(() => {
      if (!syncing) {
        if (isDevHost) {
          console.debug("[sync] polling tick");
        }
        void realtimeSyncInboxes();
      }
    }, intervalMs);
    void Promise.all(accounts.map((account) => mailService.setPollingActive(account.id, true).catch(() => undefined)));
    return () => {
      window.clearInterval(timer);
      void Promise.all(accounts.map((account) => mailService.setPollingActive(account.id, false).catch(() => undefined)));
    };
  }, [accounts.length, pageHidden, syncing, realtimeSyncInboxes, settings.syncIntervalMinutes]);

  useEffect(() => {
    const handler = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
      );
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        const input = document.getElementById("mail-search-input") as HTMLInputElement | null;
        input?.focus();
        input?.select();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "p") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        return;
      }
      if (isTyping) return;

      if (key === "n") {
        event.preventDefault();
        openComposer();
      } else if (key === "r") {
        event.preventDefault();
        replyToSelected();
      } else if (event.code === "Space") {
        if (!selectedEmail) return;
        event.preventDefault();
        setQuickLookOpen(true);
      } else if (key === "escape") {
        setQuickLookOpen(false);
      } else if (event.key === "Delete") {
        event.preventDefault();
        void deleteSelected();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, openComposer, replyToSelected, selectedEmail]);

  return (
    <main className="h-full bg-[#e9edf3] text-slate-950 transition-colors duration-150 dark:bg-[#0f1216] dark:text-slate-100">
      <ErrorBoundary>
        <AppLayout />
        {composer ? <Composer /> : null}
        {quickLookOpen && selectedEmail ? <QuickLook email={selectedEmail} onClose={() => setQuickLookOpen(false)} /> : null}
        {settingsOpen ? <SettingsPanel onClose={closeSettings} /> : null}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        {!bootReady ? (
          <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#0f1216]">
            <div className="flex flex-col items-center gap-4">
              <img src="./icon.png" alt="LunaMail" className="h-20 w-20 rounded-2xl shadow-none" />
              <div className="text-sm font-medium text-slate-300">LunaMail wird gestartet...</div>
              <div className="text-xs text-slate-400">{startupStatus ?? "Initialisiere..."}</div>
              <div className="relative mt-1 h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
                <div className="boot-progress absolute inset-y-0 left-0 w-1/3 rounded-full bg-[rgb(var(--accent))]" />
              </div>
            </div>
          </div>
        ) : null}
      </ErrorBoundary>
    </main>
  );
}
