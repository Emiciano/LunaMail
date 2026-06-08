import { AlertCircle, Archive, CheckCheck, Paperclip, RefreshCw, Star, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";
import type { Email } from "../types";

const PAGE_SIZE = 40;

export function MailList() {
  const { accounts, folders, emails, selectedEmail, selectedFolderId, selectedView, selectedEmailIds, selectedCategoryId, mailCounts, syncStatus, lastSyncAt, databaseSizeBytes, healthStatus, selectEmail, toggleEmailSelection, setEmailSelection, deleteSelected, markReadSelected, archiveSelected, quickAction, sync, loading, settings, hasSynced, syncError } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    folders: state.folders,
    emails: state.emails,
    selectedEmail: state.selectedEmail,
    selectedFolderId: state.selectedFolderId,
    selectedView: state.selectedView,
    selectedEmailIds: state.selectedEmailIds,
    selectedCategoryId: state.selectedCategoryId,
    mailCounts: state.mailCounts,
    syncStatus: state.syncStatus,
    lastSyncAt: state.lastSyncAt,
    databaseSizeBytes: state.databaseSizeBytes,
    healthStatus: state.healthStatus,
    selectEmail: state.selectEmail,
    toggleEmailSelection: state.toggleEmailSelection,
    setEmailSelection: state.setEmailSelection,
    deleteSelected: state.deleteSelected,
    markReadSelected: state.markReadSelected,
    archiveSelected: state.archiveSelected,
    quickAction: state.quickAction,
    sync: state.sync,
    loading: state.loading,
    settings: state.settings,
    hasSynced: state.hasSynced,
    syncError: state.syncError
  })));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const selectedIdSet = useMemo(() => new Set(selectedEmailIds), [selectedEmailIds]);
  const visibleEmails = useMemo(() => emails.slice(0, visibleCount), [emails, visibleCount]);
  const accountDetails = useMemo(() => new Map(accounts.map((account) => [
    account.id,
    {
      label: account.displayName,
      color: settings.accountAppearance?.[String(account.id)]?.color
    }
  ])), [accounts, settings.accountAppearance]);
  const selectedCount = selectedEmailIds.length;
  const allSelected = useMemo(() => emails.length > 0 && emails.every((email) => selectedIdSet.has(email.id)), [emails, selectedIdSet]);
  const compact = settings.layoutMode === "compact";
  const comfortable = settings.layoutMode === "comfortable";
  const permanentlyDeletes = selectedView === "folder"
    && folders.some((folder) => folder.id === selectedFolderId && folder.role === "trash");

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedFolderId, selectedView, emails.length]);

  return (
    <section className="glass-subtle min-h-0 overflow-hidden rounded-[20px]">
      <div className="flex h-14 items-center justify-between border-b border-white/35 px-5 dark:border-white/[0.08]">
        <h1 className="text-lg font-semibold">
          {selectedView === "dashboard"
            ? "Übersicht"
            : selectedView === "health"
              ? "Systemstatus"
              : selectedView === "unifiedInbox"
                ? selectedCategoryId
                  ? "Alle Posteingänge · Kategorie"
                  : "Alle Posteingänge"
                : selectedView === "favorites"
                  ? "Favoriten"
                  : selectedView === "important"
                    ? "Wichtig"
                    : "Eingang"}
        </h1>
        <span className="text-xs text-slate-500 dark:text-slate-400">{emails.length} Mails</span>
      </div>
      {selectedView === "folder" ? (
        <div className="flex h-10 items-center justify-between border-b border-white/30 px-4 text-xs dark:border-white/[0.08]">
          <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => setEmailSelection(event.target.checked ? emails.map((email) => email.id) : [])}
              className="mail-checkbox h-3.5 w-3.5"
              aria-label="Alle E-Mails auswählen"
            />
            Alle auswählen
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.12]"
              onClick={() => void sync(false)}
              title="Nachrichten synchronisieren"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-1 text-xs text-slate-700 transition-colors dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-slate-200",
                selectedCount > 0
                  ? "hover:bg-slate-100 dark:hover:bg-white/[0.12]"
                  : "cursor-not-allowed opacity-45"
              )}
              onClick={() => void markReadSelected()}
              disabled={selectedCount === 0}
              title={selectedCount > 0 ? `${selectedCount} ausgewählte Mails als gelesen markieren` : "Keine Auswahl"}
            >
              <CheckCheck size={12} />
              {selectedCount > 0 ? `Gelesen (${selectedCount})` : "Gelesen"}
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-1 text-xs text-slate-700 transition-colors dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-slate-200",
                selectedCount > 0
                  ? "hover:bg-slate-100 dark:hover:bg-white/[0.12]"
                  : "cursor-not-allowed opacity-45"
              )}
              onClick={() => void archiveSelected()}
              disabled={selectedCount === 0}
              title={selectedCount > 0 ? `${selectedCount} ausgewählte Mails archivieren` : "Keine Auswahl"}
            >
              <Archive size={12} />
              {selectedCount > 0 ? `Archivieren (${selectedCount})` : "Archivieren"}
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-transparent bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors dark:bg-red-600 dark:text-white",
                selectedCount > 0
                  ? "hover:bg-red-700 dark:hover:bg-red-500"
                  : "cursor-not-allowed bg-red-600/35 text-white/65 dark:bg-red-500/30 dark:text-white/55"
              )}
              onClick={() => void deleteSelected()}
              disabled={selectedCount === 0}
              title={selectedCount > 0
                ? `${selectedCount} ausgewählte Mails ${permanentlyDeletes ? "endgültig löschen" : "löschen"}`
                : "Keine Auswahl"}
            >
              <Trash2 size={12} />
              {selectedCount > 0
                ? `${permanentlyDeletes ? "Endgültig löschen" : "Löschen"} (${selectedCount})`
                : permanentlyDeletes ? "Endgültig löschen" : "Löschen"}
            </button>
          </div>
        </div>
      ) : null}
      {selectedView === "dashboard" ? (
        <div className="grid grid-cols-2 gap-3 p-4">
          <DashboardCard label="Ungelesen" value={mailCounts.unread} />
          <DashboardCard label="Favoriten" value={mailCounts.favorites} />
          <DashboardCard label="Wichtig" value={mailCounts.important} />
          <DashboardCard label="Mit Anhang" value={mailCounts.withAttachments} />
          <DashboardCard label="Heute" value={mailCounts.today} />
          <DashboardCard label="Diese Woche" value={mailCounts.thisWeek} />
          <DashboardCard label="Konten" value={accounts.length} />
          <DashboardCard label="Datenbankgröße" value={formatBytes(databaseSizeBytes)} compact />
          <DashboardCard label="Letzte Synchronisierung" value={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : (syncStatus || "–")} compact />
        </div>
      ) : null}
      {selectedView === "health" ? (
        <div className="grid grid-cols-2 gap-3 p-4">
          <DashboardCard label="Wartend" value={healthStatus?.queue.pending ?? 0} />
          <DashboardCard label="Fehlgeschlagen" value={healthStatus?.queue.failed ?? 0} />
          <DashboardCard label="In Bearbeitung" value={healthStatus?.queue.inFlight ?? 0} />
          <DashboardCard label="Mails" value={healthStatus?.totalMails ?? 0} />
          <DashboardCard label="Anhänge" value={healthStatus?.totalAttachments ?? 0} />
          <DashboardCard label="Datenbankgröße" value={formatBytes(healthStatus?.databaseSizeBytes ?? databaseSizeBytes)} compact />
          <DashboardCard label="Duplikate" value={healthStatus?.integrity.duplicateMessageIds ?? 0} />
          <DashboardCard label="Verwaiste Anhänge" value={healthStatus?.integrity.orphanAttachments ?? 0} />
        </div>
      ) : null}
      {selectedView === "dashboard" || selectedView === "health" ? null : (
        <div
          className={cn(
            "mail-scroll overflow-y-auto px-3 py-3",
            selectedView === "folder" ? "h-[calc(100%-6rem)]" : "h-[calc(100%-3.5rem)]"
          )}
          onScroll={(event) => {
            const element = event.currentTarget;
            const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 240;
            if (nearBottom && visibleCount < emails.length) {
              setVisibleCount((count) => Math.min(count + PAGE_SIZE, emails.length));
            }
          }}
        >
          {loading && emails.length === 0 ? <MailListSkeleton /> : null}
          {!loading && emails.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400">
              {accounts.length === 0 ? "Noch kein Konto verbunden" : syncError ? "Synchronisation fehlgeschlagen." : hasSynced ? "Keine E-Mails gefunden" : "Noch nicht synchronisiert"}
            </div>
          ) : null}
          {visibleEmails.map((email) => {
            const account = accountDetails.get(email.accountId);
            return (
              <MailListItem
                key={email.id}
                email={email}
                active={selectedEmail?.id === email.id}
                selected={selectedIdSet.has(email.id)}
                fontSize={settings.fontSize - 1}
                onSelect={selectEmail}
                onToggleSelection={toggleEmailSelection}
                onQuickAction={quickAction}
                accountLabel={account?.label ?? ""}
                accountColor={account?.color}
                compact={compact}
                comfortable={comfortable}
                permanentlyDeletes={permanentlyDeletes}
              />
            );
          })}
          {visibleCount < emails.length ? (
            <div className="p-4">
              <button
                className="h-10 w-full rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/8"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Weitere Mails anzeigen
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

const MailListItem = memo(function MailListItem({
  active,
  email,
  selected,
  fontSize,
  onSelect,
  onToggleSelection,
  onQuickAction,
  accountLabel,
  accountColor,
  compact,
  comfortable,
  permanentlyDeletes
}: {
  active: boolean;
  email: Email;
  selected: boolean;
  fontSize: number;
  onSelect: (email: Email) => Promise<void>;
  onToggleSelection: (id: number, selected: boolean) => void;
  onQuickAction: (emailId: number, action: "delete" | "favorite" | "important" | "read" | "archive") => Promise<void>;
  accountLabel: string;
  accountColor?: string;
  compact: boolean;
  comfortable: boolean;
  permanentlyDeletes: boolean;
}) {
  const dateLabel = useMemo(() => new Date(email.receivedAt).toLocaleDateString(), [email.receivedAt]);
  const unread = !email.isRead;

  return (
    <button
      className={cn(
        "mail-row group relative my-1.5 grid w-full grid-cols-[24px_56px_14px_1fr_auto] gap-3 overflow-hidden rounded-2xl border pl-3 pr-3 text-left transition-colors duration-100 ease-out motion-reduce:transition-none",
        compact ? "py-2" : comfortable ? "py-3.5" : "py-2.5",
        active
          ? "border-[rgb(var(--accent)/0.34)] bg-[rgb(var(--accent-soft))] shadow-sm before:absolute before:bottom-3 before:left-0 before:top-3 before:w-1 before:rounded-r-full before:bg-[rgb(var(--accent))] dark:border-[rgb(var(--accent)/0.45)] dark:bg-[rgb(var(--accent)/0.16)]"
          : unread
            ? "border-[rgb(var(--accent)/0.32)] bg-[rgb(var(--accent)/0.08)] hover:border-[rgb(var(--accent)/0.44)] hover:bg-[rgb(var(--accent)/0.11)] dark:border-[rgb(var(--accent)/0.38)] dark:bg-[rgb(var(--accent)/0.14)] dark:hover:border-[rgb(var(--accent)/0.5)]"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-[#1a1f26] dark:hover:bg-[#202630]"
      )}
      onClick={() => void onSelect(email)}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onToggleSelection(email.id, event.target.checked)}
        onClick={(event) => event.stopPropagation()}
        className="mail-checkbox h-4 w-4 place-self-center align-middle focus:outline-none focus:ring-0"
        aria-label="Mail auswählen"
      />
      <span className="flex items-center gap-1">
        <QuickButton
          label="Favorit"
          onClick={() => void onQuickAction(email.id, "favorite")}
          alwaysVisible
          active={email.isFavorite}
        >
          <Star size={14} />
        </QuickButton>
        <QuickButton
          label="Wichtig"
          onClick={() => void onQuickAction(email.id, "important")}
          alwaysVisible
          active={email.isImportant}
        >
          <AlertCircle size={14} />
        </QuickButton>
      </span>
      <span
        className={cn(
          "h-3.5 w-3.5 place-self-center rounded-full",
          unread
            ? "bg-[rgb(var(--accent))] ring-4 ring-[rgb(var(--accent)/0.12)]"
            : "bg-transparent"
        )}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              unread
                ? "font-extrabold text-slate-950 dark:text-white"
                : "text-slate-800 dark:text-slate-300"
            )}
          >
            {email.sender}
          </span>
          {email.hasAttachments ? <Paperclip className="text-slate-400" size={14} /> : null}
          <time
            className={cn(
              "text-xs",
              unread
                ? "font-bold text-[rgb(var(--accent))]"
                : "text-slate-500 dark:text-slate-500"
            )}
          >
            {dateLabel}
          </time>
        </span>
        <span
          className={cn(
            "mt-1 block truncate",
            unread
              ? "font-extrabold text-slate-950 dark:text-white"
              : "text-slate-700 dark:text-slate-300"
          )}
          style={{ fontSize }}
        >
          {email.subject || "(Kein Betreff)"}
        </span>
        {unread && email.preview ? (
          <span className="mt-1 block truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
            {email.preview}
          </span>
        ) : null}
        {accountLabel ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accountColor ?? "rgb(var(--accent))" }} />
            {accountLabel}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-1 opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none group-hover:opacity-100">
        <QuickButton label="Gelesen" onClick={() => void onQuickAction(email.id, "read")}><CheckCheck size={14} /></QuickButton>
        <QuickButton label="Archiv" onClick={() => void onQuickAction(email.id, "archive")}><Archive size={14} /></QuickButton>
        <QuickButton label={permanentlyDeletes ? "Endgültig löschen" : "Löschen"} onClick={() => void onQuickAction(email.id, "delete")}><Trash2 size={14} /></QuickButton>
      </span>
    </button>
  );
});

function QuickButton({
  label,
  onClick,
  children,
  alwaysVisible = false,
  active = false
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  alwaysVisible?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg border text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.12]",
        alwaysVisible
          ? active
            ? "border-[rgb(var(--accent)/0.45)] bg-[rgb(var(--accent)/0.16)] text-[rgb(var(--accent))] dark:border-[rgb(var(--accent)/0.5)] dark:bg-[rgb(var(--accent)/0.2)] dark:text-white"
            : "border-slate-200/70 bg-white/90 dark:border-white/[0.08] dark:bg-white/[0.06]"
          : "border-slate-200/70 bg-white/90 dark:border-white/[0.08] dark:bg-white/[0.06]"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={label}
    >
      {children}
    </button>
  );
}

function MailListSkeleton() {
  return (
    <div className="space-y-2 px-2 py-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.05]">
          <div className="mb-2 h-3 w-1/3 rounded bg-slate-200 dark:bg-white/[0.14]" />
          <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-white/[0.12]" />
        </div>
      ))}
    </div>
  );
}

function DashboardCard({ label, value, compact }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={cn("mt-1 font-semibold", compact ? "text-sm" : "text-2xl")}>{value}</div>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
