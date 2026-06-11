import { AlertCircle, Archive, CheckCheck, Paperclip, RefreshCw, Search, Star, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";
import type { Email } from "../types";

const PAGE_SIZE = 40;

export function MailList() {
  const {
    accounts, folders, emails, selectedEmail, selectedFolderId, selectedView, selectedEmailIds,
    selectedCategoryId, categories, query, mailCounts, syncStatus, lastSyncAt, databaseSizeBytes,
    healthStatus, search, selectCategory, selectEmail, toggleEmailSelection, setEmailSelection,
    deleteSelected, markReadSelected, archiveSelected, toggleFavoriteSelected, toggleImportantSelected,
    quickAction, sync, loading, hasSynced, syncError, settings
  } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    folders: state.folders,
    emails: state.emails,
    selectedEmail: state.selectedEmail,
    selectedFolderId: state.selectedFolderId,
    selectedView: state.selectedView,
    selectedEmailIds: state.selectedEmailIds,
    selectedCategoryId: state.selectedCategoryId,
    categories: state.categories,
    query: state.query,
    mailCounts: state.mailCounts,
    syncStatus: state.syncStatus,
    lastSyncAt: state.lastSyncAt,
    databaseSizeBytes: state.databaseSizeBytes,
    healthStatus: state.healthStatus,
    search: state.search,
    selectCategory: state.selectCategory,
    selectEmail: state.selectEmail,
    toggleEmailSelection: state.toggleEmailSelection,
    setEmailSelection: state.setEmailSelection,
    deleteSelected: state.deleteSelected,
    markReadSelected: state.markReadSelected,
    archiveSelected: state.archiveSelected,
    toggleFavoriteSelected: state.toggleFavoriteSelected,
    toggleImportantSelected: state.toggleImportantSelected,
    quickAction: state.quickAction,
    sync: state.sync,
    loading: state.loading,
    hasSynced: state.hasSynced,
    syncError: state.syncError,
    settings: state.settings
  })));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchDraft, setSearchDraft] = useState(query);
  const selectedIdSet = useMemo(() => new Set(selectedEmailIds), [selectedEmailIds]);
  const visibleEmails = useMemo(() => emails.slice(0, visibleCount), [emails, visibleCount]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const selectedCount = selectedEmailIds.length;
  const allSelected = emails.length > 0 && emails.every((email) => selectedIdSet.has(email.id));
  const permanentlyDeletes = selectedView === "folder"
    && folders.some((folder) => folder.id === selectedFolderId && folder.role === "trash");
  const showsMailList = selectedView !== "dashboard" && selectedView !== "health";

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedFolderId, selectedView, emails.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search(searchDraft);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  return (
    <section className="flex min-h-0 flex-col bg-[#0B0B0B]">
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{viewTitle(selectedView, selectedCategoryId)}</h1>
          <p className="mt-0.5 text-[11px] text-white/40">
            {selectedView === "dashboard" ? "Deine Konten auf einen Blick" : selectedView === "health" ? "Lokaler Status und Synchronisation" : `${emails.length} Nachrichten`}
          </p>
        </div>
        {showsMailList ? <span className="text-[11px] text-white/45">{selectedCount > 0 ? `${selectedCount} ausgewählt` : `${emails.length} Mails`}</span> : null}
      </header>

      {showsMailList ? (
        <>
          <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
            <label className="flex h-9 items-center gap-3 rounded-lg border border-white/[0.10] bg-[#111] px-3 text-white/45">
              <Search size={15} />
              <input
                id="mail-search-input"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
                placeholder="Suchen..."
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <span className="text-[11px]">Strg K</span>
            </label>
            {selectedView === "unifiedInbox" && categories.length > 0 ? (
              <div className="scrollbar-hidden mt-3 flex gap-5 overflow-x-auto text-[11px] font-medium">
                <button className={`border-b pb-2 ${!selectedCategoryId ? "border-[rgb(var(--accent))] text-white" : "border-transparent text-white/50"}`} onClick={() => void selectCategory(undefined)}>
                  Alle
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`whitespace-nowrap border-b pb-2 ${selectedCategoryId === category.id ? "border-[rgb(var(--accent))] text-white" : "border-transparent text-white/50 hover:text-white"}`}
                    onClick={() => void selectCategory(category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <ActionToolbar
            allSelected={allSelected}
            selectedCount={selectedCount}
            permanentlyDeletes={permanentlyDeletes}
            onSelectAll={(selected) => setEmailSelection(selected ? emails.map((email) => email.id) : [])}
            onRefresh={() => void sync(false)}
            onRead={() => void markReadSelected()}
            onFavorite={() => void toggleFavoriteSelected()}
            onImportant={() => void toggleImportantSelected()}
            onArchive={() => void archiveSelected()}
            onDelete={() => void deleteSelected()}
          />
        </>
      ) : null}

      {selectedView === "dashboard" ? (
        <div className="mail-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-5 pb-24 xl:grid-cols-3">
          <DashboardCard label="Ungelesen" value={mailCounts.unread} icon={<CheckCheck size={17} />} />
          <DashboardCard label="Favoriten" value={mailCounts.favorites} icon={<Star size={17} />} />
          <DashboardCard label="Wichtig" value={mailCounts.important} icon={<AlertCircle size={17} />} />
          <DashboardCard label="Mit Anhang" value={mailCounts.withAttachments} icon={<Paperclip size={17} />} />
          <DashboardCard label="Heute" value={mailCounts.today} />
          <DashboardCard label="Diese Woche" value={mailCounts.thisWeek} />
          <DashboardCard label="Konten" value={accounts.length} />
          <DashboardCard label="Datenbankgröße" value={formatBytes(databaseSizeBytes)} compact />
          <DashboardCard label="Letzte Synchronisierung" value={lastSyncAt ? new Date(lastSyncAt).toLocaleString("de-DE") : (syncStatus || "–")} compact />
        </div>
      ) : null}

      {selectedView === "health" ? (
        <div className="mail-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-5 pb-24 xl:grid-cols-3">
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

      {showsMailList ? (
        <>
          <div
            className="mail-scroll min-h-0 flex-1 overflow-y-auto pb-20"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (element.scrollTop + element.clientHeight >= element.scrollHeight - 240 && visibleCount < emails.length) {
                setVisibleCount((count) => Math.min(count + PAGE_SIZE, emails.length));
              }
            }}
          >
            {loading && emails.length === 0 ? <MailListSkeleton /> : null}
            {!loading && emails.length === 0 ? (
              <div className="px-6 py-10 text-[13px] leading-6 text-white/45">
                {accounts.length === 0 ? "Noch kein Konto verbunden" : syncError ? "Synchronisation fehlgeschlagen." : hasSynced ? "Keine E-Mails gefunden" : "Noch nicht synchronisiert"}
              </div>
            ) : null}
            {visibleEmails.map((email) => (
              <MailRow
                key={email.id}
                email={email}
                active={selectedEmail?.id === email.id}
                selected={selectedIdSet.has(email.id)}
                accountLabel={accountById.get(email.accountId)?.displayName}
                accountColor={settings.accountAppearance?.[String(email.accountId)]?.color}
                permanentlyDeletes={permanentlyDeletes}
                onSelect={selectEmail}
                onToggleSelection={toggleEmailSelection}
                onQuickAction={quickAction}
              />
            ))}
          </div>
          <footer className="flex h-9 shrink-0 items-center justify-between border-t border-white/[0.06] px-5 text-[11px] text-white/45">
            <span>{emails.filter((email) => !email.isRead).length} ungelesen</span>
            <span>Neueste zuerst</span>
          </footer>
        </>
      ) : null}
    </section>
  );
}

function ActionToolbar({
  allSelected, selectedCount, permanentlyDeletes, onSelectAll, onRefresh, onRead,
  onFavorite, onImportant, onArchive, onDelete
}: {
  allSelected: boolean;
  selectedCount: number;
  permanentlyDeletes: boolean;
  onSelectAll: (selected: boolean) => void;
  onRefresh: () => void;
  onRead: () => void;
  onFavorite: () => void;
  onImportant: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const disabled = selectedCount === 0;
  return (
    <div className="scrollbar-hidden flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.06] px-4">
      <label className="mr-1 inline-flex shrink-0 items-center gap-2 text-[11px] text-white/55">
        <input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} className="mail-checkbox h-3.5 w-3.5" />
        Alle
      </label>
      <ToolbarButton label="Aktualisieren" icon={<RefreshCw size={13} />} onClick={onRefresh} />
      <ToolbarButton label="Gelesen" icon={<CheckCheck size={13} />} onClick={onRead} disabled={disabled} />
      <ToolbarButton label="Favorisieren" icon={<Star size={13} />} onClick={onFavorite} disabled={disabled} />
      <ToolbarButton label="Wichtig" icon={<AlertCircle size={13} />} onClick={onImportant} disabled={disabled} />
      <ToolbarButton label="Archivieren" icon={<Archive size={13} />} onClick={onArchive} disabled={disabled} />
      <ToolbarButton label={permanentlyDeletes ? "Endgültig löschen" : "Löschen"} icon={<Trash2 size={13} />} onClick={onDelete} disabled={disabled} danger />
    </div>
  );
}

function ToolbarButton({ label, icon, onClick, disabled = false, danger = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-colors",
        danger ? "border-red-500/20 text-red-300 hover:bg-red-500/10" : "border-white/[0.08] text-white/65 hover:bg-white/[0.06] hover:text-white",
        disabled && "cursor-not-allowed opacity-35"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

const MailRow = memo(function MailRow({
  email, active, selected, accountLabel, accountColor, permanentlyDeletes,
  onSelect, onToggleSelection, onQuickAction
}: {
  email: Email;
  active: boolean;
  selected: boolean;
  accountLabel?: string;
  accountColor?: string;
  permanentlyDeletes: boolean;
  onSelect: (email: Email) => Promise<void>;
  onToggleSelection: (id: number, selected: boolean) => void;
  onQuickAction: (emailId: number, action: "delete" | "favorite" | "important" | "read" | "archive") => Promise<void>;
}) {
  const timeLabel = useMemo(() => formatMailTime(email.receivedAt), [email.receivedAt]);
  const sender = email.sender || accountLabel || "Unbekannter Absender";

  function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void onSelect(email);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "mail-row group relative grid w-full cursor-pointer grid-cols-[18px_48px_10px_minmax(0,1fr)_auto] items-start gap-3 border-b px-5 py-3 text-left transition-colors",
        active
          ? "border-[rgb(var(--accent)/0.22)] bg-[rgb(var(--accent)/0.14)]"
          : email.isRead
            ? "border-white/[0.035] hover:bg-[#111]"
            : "border-[rgb(var(--accent)/0.16)] bg-[rgb(var(--accent)/0.075)] before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-r-full before:bg-[rgb(var(--accent))] hover:bg-[rgb(var(--accent)/0.11)]"
      )}
      onClick={() => void onSelect(email)}
      onKeyDown={openFromKeyboard}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onToggleSelection(email.id, event.target.checked)}
        onClick={(event) => event.stopPropagation()}
        className="mail-checkbox mt-1 h-3.5 w-3.5"
        aria-label="Mail auswählen"
      />
      <span className="flex items-center gap-1">
        <QuickButton label="Favorit" active={email.isFavorite} alwaysVisible onClick={() => void onQuickAction(email.id, "favorite")}><Star size={13} /></QuickButton>
        <QuickButton label="Wichtig" active={email.isImportant} alwaysVisible onClick={() => void onQuickAction(email.id, "important")}><AlertCircle size={13} /></QuickButton>
      </span>
      <span className={cn("mt-1.5 h-2 w-2 rounded-full", email.isRead ? "bg-transparent" : "bg-[rgb(var(--accent))] shadow-[0_0_0_4px_rgb(var(--accent)/0.12)]")} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[13px] text-white", email.isRead ? "font-medium" : "font-bold")}>{sender}</span>
          {!email.isRead ? <span className="shrink-0 rounded-full bg-[rgb(var(--accent))] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Neu</span> : null}
        </span>
        <span className={cn("mt-1 block truncate text-[13px]", email.isRead ? "font-normal text-white/85" : "font-bold text-white")}>{email.subject || "(Kein Betreff)"}</span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[12px] leading-5", email.isRead ? "text-white/45" : "font-medium text-white/70")}>{email.preview || "Keine Vorschau verfügbar"}</span>
          {email.hasAttachments ? <Paperclip size={12} className="shrink-0 text-white/40" /> : null}
          {accountLabel ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-white/35">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accountColor ?? "rgb(var(--accent))" }} />
              {accountLabel}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <time className={cn("whitespace-nowrap text-[11px]", email.isRead ? "font-medium text-white/60" : "font-bold text-white")}>{timeLabel}</time>
        <span className="hidden items-center gap-1 group-hover:flex">
          <QuickButton label="Gelesen" onClick={() => void onQuickAction(email.id, "read")}><CheckCheck size={13} /></QuickButton>
          <QuickButton label="Archivieren" onClick={() => void onQuickAction(email.id, "archive")}><Archive size={13} /></QuickButton>
          <QuickButton label={permanentlyDeletes ? "Endgültig löschen" : "Löschen"} onClick={() => void onQuickAction(email.id, "delete")}><Trash2 size={13} /></QuickButton>
        </span>
      </span>
    </div>
  );
});

function QuickButton({ label, children, onClick, active = false, alwaysVisible = false }: { label: string; children: ReactNode; onClick: () => void; active?: boolean; alwaysVisible?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
        active ? "border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--accent)/0.16)] text-[rgb(var(--accent))]" : "border-white/[0.07] text-white/45 hover:bg-white/[0.07] hover:text-white",
        !alwaysVisible && "bg-[#111]"
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

function DashboardCard({ label, value, compact = false, icon }: { label: string; value: string | number; compact?: boolean; icon?: ReactNode }) {
  return (
    <article className="tr-card min-h-[112px] rounded-lg p-4">
      <div className="flex items-center justify-between text-[12px] text-white/45">
        <span>{label}</span>
        <span className="text-[rgb(var(--accent))]">{icon}</span>
      </div>
      <div className={cn("mt-5 font-semibold tracking-[-0.03em] text-white", compact ? "text-[15px] leading-6" : "text-[28px]")}>{value}</div>
    </article>
  );
}

function MailListSkeleton() {
  return (
    <div className="space-y-1 p-4">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="h-[78px] animate-pulse rounded-md bg-white/[0.035]" />
      ))}
    </div>
  );
}

function viewTitle(view: ReturnType<typeof useMailStore.getState>["selectedView"], selectedCategoryId?: number) {
  if (view === "dashboard") return "Dashboard";
  if (view === "health") return "Systemstatus";
  if (view === "unifiedInbox") return selectedCategoryId ? "Alle Posteingänge · Kategorie" : "Alle Posteingänge";
  if (view === "favorites") return "Favoriten";
  if (view === "important") return "Wichtig";
  return "Nachrichten";
}

function formatMailTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Gestern";
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
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
