import { lazy, Suspense, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AppLayout } from "./layouts/AppLayout";
import { ActionIsland } from "./components/ActionIsland";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useTheme } from "./hooks/useTheme";
import { ensureNotificationPermission } from "./services/notifications";
import { mailService } from "./services/mailService";
import { isDesktop } from "./services/desktop";
import { setupMailStoreListeners, snoozePresets, useMailStore } from "./stores/mailStore";

const Composer = lazy(() => import("./components/Composer").then((module) => ({ default: module.Composer })));
const QuickLook = lazy(() => import("./components/QuickLook").then((module) => ({ default: module.QuickLook })));
const SettingsPanel = lazy(() => import("./components/SettingsPanel").then((module) => ({ default: module.SettingsPanel })));

export default function App() {
  const { accounts, hasSynced, syncing, sync, realtimeSyncInboxes, closeSettings, closeEmail, composer, selectedEmail, loadInitial, startupStatus, settings, settingsOpen, openComposer, replyToSelected, deleteSelected, replyAllToSelected, forwardSelected, archiveSelected, toggleFavoriteSelected, markUnreadSelected, snoozeSelected, openAdjacentEmail } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    hasSynced: state.hasSynced,
    syncing: state.syncing,
    sync: state.sync,
    realtimeSyncInboxes: state.realtimeSyncInboxes,
    closeSettings: state.closeSettings,
    closeEmail: state.closeEmail,
    composer: state.composer,
    selectedEmail: state.selectedEmail,
    loadInitial: state.loadInitial,
    startupStatus: state.startupStatus,
    settings: state.settings,
    settingsOpen: state.settingsOpen,
    openComposer: state.openComposer,
    replyToSelected: state.replyToSelected,
    deleteSelected: state.deleteSelected,
    replyAllToSelected: state.replyAllToSelected,
    forwardSelected: state.forwardSelected,
    archiveSelected: state.archiveSelected,
    toggleFavoriteSelected: state.toggleFavoriteSelected,
    markUnreadSelected: state.markUnreadSelected,
    snoozeSelected: state.snoozeSelected,
    openAdjacentEmail: state.openAdjacentEmail
  })));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickLookOpen, setQuickLookOpen] = useState(false);
  const [pageHidden, setPageHidden] = useState(document.hidden);
  const [bootReady, setBootReady] = useState(false);
  useTheme(settings.theme, settings.accentColor, settings.fontSize);

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
      if ((event.ctrlKey || event.metaKey) && (key === "k" || (event.shiftKey && key === "p"))) {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        return;
      }
      if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;
      // Solange ein Dialog offen ist, gelten nur dessen eigene Tasten.
      const overlayOpen = Boolean(composer) || settingsOpen || paletteOpen;
      if (key === "escape") {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (quickLookOpen) setQuickLookOpen(false);
        else if (!overlayOpen) closeEmail();
        return;
      }
      if (overlayOpen || shortcutsOpen) return;

      const hasTarget = Boolean(selectedEmail) || useMailStore.getState().selectedEmailIds.length > 0;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (key === "n") {
        event.preventDefault();
        openComposer();
      } else if (key === "j" || (selectedEmail && event.key === "ArrowDown")) {
        event.preventDefault();
        void openAdjacentEmail(1);
      } else if (key === "k" || (selectedEmail && event.key === "ArrowUp")) {
        event.preventDefault();
        void openAdjacentEmail(-1);
      } else if (key === "r" && selectedEmail) {
        event.preventDefault();
        replyToSelected();
      } else if (key === "a" && selectedEmail) {
        event.preventDefault();
        replyAllToSelected();
      } else if (key === "f" && selectedEmail) {
        event.preventDefault();
        forwardSelected();
      } else if (key === "e" && hasTarget) {
        event.preventDefault();
        void archiveSelected();
      } else if (key === "s" && hasTarget) {
        event.preventDefault();
        void toggleFavoriteSelected();
      } else if (key === "u" && hasTarget) {
        event.preventDefault();
        void markUnreadSelected();
      } else if (key === "h" && hasTarget) {
        event.preventDefault();
        const tomorrow = snoozePresets().find((preset) => preset.id === "tomorrow");
        if (tomorrow) void snoozeSelected(tomorrow.until);
      } else if (event.code === "Space") {
        if (!selectedEmail) return;
        event.preventDefault();
        setQuickLookOpen(true);
      } else if (event.key === "Delete" || event.key === "#") {
        event.preventDefault();
        void deleteSelected();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [archiveSelected, closeEmail, composer, deleteSelected, forwardSelected, markUnreadSelected, openAdjacentEmail, openComposer, paletteOpen, quickLookOpen, replyAllToSelected, replyToSelected, selectedEmail, settingsOpen, shortcutsOpen, snoozeSelected, toggleFavoriteSelected]);

  return (
    <main className="h-full bg-canvas text-ink">
      <ErrorBoundary>
        <AppLayout />
        <Suspense fallback={null}>
          {composer ? <Composer /> : null}
          {quickLookOpen && selectedEmail ? <QuickLook email={selectedEmail} onClose={() => setQuickLookOpen(false)} /> : null}
          {settingsOpen ? <SettingsPanel onClose={closeSettings} /> : null}
        </Suspense>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onShowShortcuts={() => setShortcutsOpen(true)} />
        {shortcutsOpen ? <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} /> : null}
        <ActionIsland />
        {!bootReady ? (
          <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-canvas">
            <div className="flex flex-col items-center gap-4">
              <img src="./icon.png" alt="LunaMail" className="h-16 w-16 shadow-none" />
              <div className="text-sm font-medium text-ink">LunaMail wird gestartet...</div>
              <div className="text-xs text-ink/45">{startupStatus ?? "Initialisiere..."}</div>
              <div className="relative mt-1 h-1.5 w-44 overflow-hidden rounded-full bg-ink/10">
                <div className="boot-progress absolute inset-y-0 left-0 w-1/3 rounded-full bg-ink" />
              </div>
            </div>
          </div>
        ) : null}
      </ErrorBoundary>
    </main>
  );
}
