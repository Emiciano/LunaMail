import { AlertCircle, Archive, CheckCheck, MailOpen, Paperclip, RefreshCw, Search, Star, Tag as TagIcon, Trash2, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";
import type { Email } from "../types";

const PAGE_SIZE = 30;

export function MailList() {
  const {
    accounts, folders, emails, selectedEmail, selectedFolderId, selectedView, selectedEmailIds,
    selectedCategoryId, categories, query, mailCounts, syncStatus, lastSyncAt, databaseSizeBytes,
    healthStatus, search, selectCategory, selectEmail, toggleEmailSelection, setEmailSelection,
    deleteSelected, markReadSelected, archiveSelected, toggleFavoriteSelected, toggleImportantSelected,
    quickAction, sync, loading, hasSynced, syncError, settings, tags, searchFilters, setSearchFilters, setSelectedEmailTags
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
    settings: state.settings,
    tags: state.tags,
    searchFilters: state.searchFilters,
    setSearchFilters: state.setSearchFilters,
    setSelectedEmailTags: state.setSelectedEmailTags
  })));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchDraft, setSearchDraft] = useState(query);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const selectedIdSet = useMemo(() => new Set(selectedEmailIds), [selectedEmailIds]);
  const visibleEmails = useMemo(() => emails.slice(0, visibleCount), [emails, visibleCount]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const selectedCount = selectedEmailIds.length;
  const allSelected = emails.length > 0 && emails.every((email) => selectedIdSet.has(email.id));
  const permanentlyDeletes = selectedView === "folder"
    && folders.some((folder) => folder.id === selectedFolderId && folder.role === "trash");
  const showsMailList = selectedView !== "dashboard" && selectedView !== "health";

  function openTagPicker() {
    const selectedEmails = emails.filter((email) => selectedIdSet.has(email.id));
    const sharedTags = tags
      .filter((tag) => selectedEmails.some((email) => email.tags.some((emailTag) => emailTag.id === tag.id)))
      .map((tag) => tag.id);
    setSelectedTagIds(sharedTags);
    setTagPickerOpen(true);
  }

  async function applySelectedTags() {
    await setSelectedEmailTags(selectedTagIds);
    setTagPickerOpen(false);
  }

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
    <section className="flex h-full min-h-0 flex-col bg-[#080808] px-4 py-4 lg:px-5 lg:py-5">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{viewTitle(selectedView, selectedCategoryId)}</h1>
          <p className="mt-0.5 text-[11px] text-white/40">
            {selectedView === "dashboard" ? "Deine Konten auf einen Blick" : selectedView === "health" ? "Lokaler Status und Synchronisation" : `${emails.length} Nachrichten`}
          </p>
        </div>
        {showsMailList ? <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/48">{selectedCount > 0 ? `${selectedCount} ausgewählt` : `${emails.length} Mails`}</span> : null}
      </header>

      {showsMailList ? (
        <>
          <div className="shrink-0 px-0 pb-3 pt-1">
            <label className="flex h-10 items-center gap-3 rounded-xl border border-white/[0.08] bg-[#141414] px-3 text-white/45 transition focus-within:border-white/[0.16] focus-within:bg-[#181818]">
              <Search size={15} />
              <input
                id="mail-search-input"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
                placeholder="Nach Absender, Betreff oder Inhalt suchen"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[10px]">Strg F</span>
            </label>
            {selectedView === "unifiedInbox" && categories.length > 0 ? (
              <div className="scrollbar-hidden mt-2 flex gap-1 overflow-x-auto text-[11px] font-medium">
                <button className={`rounded-md px-2.5 py-1.5 ${!selectedCategoryId ? "bg-white/[0.09] text-white" : "text-white/50 hover:bg-white/[0.045] hover:text-white"}`} onClick={() => void selectCategory(undefined)}>
                  Alle
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${selectedCategoryId === category.id ? "bg-white/[0.09] text-white" : "text-white/50 hover:bg-white/[0.045] hover:text-white"}`}
                    onClick={() => void selectCategory(category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="scrollbar-hidden mt-2 flex gap-1 overflow-x-auto text-[11px] font-medium">
                <button
                  className={`rounded-md px-2.5 py-1.5 ${!searchFilters.tagId ? "bg-white/[0.09] text-white" : "text-white/50 hover:bg-white/[0.045] hover:text-white"}`}
                  onClick={() => void setSearchFilters({ ...searchFilters, tagId: undefined })}
                >
                  Alle Tags
                </button>
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 ${searchFilters.tagId === tag.id ? "bg-white/[0.09] text-white" : "text-white/50 hover:bg-white/[0.045] hover:text-white"}`}
                    onClick={() => void setSearchFilters({ ...searchFilters, tagId: tag.id })}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
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
            onTags={openTagPicker}
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
            className="mail-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-0 pb-20 pt-2"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (element.scrollTop + element.clientHeight >= element.scrollHeight - 240 && visibleCount < emails.length) {
                setVisibleCount((count) => Math.min(count + PAGE_SIZE, emails.length));
              }
            }}
          >
            {loading && emails.length === 0 ? <MailListSkeleton /> : null}
            {!loading && emails.length === 0 ? (
              <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-white/40">
                  {syncError ? <AlertCircle size={20} /> : <MailOpen size={20} />}
                </span>
                <h2 className="mt-4 text-sm font-semibold text-white/80">
                  {accounts.length === 0 ? "Noch kein Konto verbunden" : syncError ? "Synchronisation fehlgeschlagen" : hasSynced ? "Keine Nachrichten gefunden" : "Bereit für die erste Synchronisierung"}
                </h2>
                <p className="mt-2 text-xs leading-5 text-white/40">
                  {accounts.length === 0 ? "Verbinde in den Einstellungen ein E-Mail-Konto, um loszulegen." : syncError ? syncError : hasSynced ? "In dieser Ansicht gibt es momentan keine passenden E-Mails." : "LunaMail lädt deine Nachrichten sicher auf dieses Gerät."}
                </p>
                {accounts.length > 0 && !hasSynced ? (
                  <button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/75 hover:bg-white/[0.08] hover:text-white" onClick={() => void sync(false)}>
                    <RefreshCw size={13} /> Jetzt synchronisieren
                  </button>
                ) : null}
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
          <footer className="flex h-9 shrink-0 items-center justify-between px-1 text-[11px] text-white/40">
            <span>{emails.filter((email) => !email.isRead).length} ungelesen</span>
            <span>Neueste zuerst</span>
          </footer>
        </>
      ) : null}

      {tagPickerOpen ? (
        <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/72 p-6" onClick={() => setTagPickerOpen(false)}>
          <section className="w-[min(420px,calc(100vw-2rem))] rounded-xl border border-white/[0.08] bg-[#111] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Tags zuweisen</h2>
                <p className="mt-1 text-xs text-white/45">{selectedCount} ausgewählte Nachrichten</p>
              </div>
              <button className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06] hover:text-white" onClick={() => setTagPickerOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="mail-scroll mt-4 max-h-72 space-y-2 overflow-y-auto">
              {tags.length === 0 ? (
                <p className="rounded-lg border border-white/[0.06] px-3 py-4 text-sm text-white/45">Erstelle zuerst unter Einstellungen → Tags einen Tag.</p>
              ) : null}
              {tags.map((tag) => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-3 hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    className="mail-checkbox h-4 w-4"
                    checked={selectedTagIds.includes(tag.id)}
                    onChange={(event) => setSelectedTagIds((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))}
                  />
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm font-medium">{tag.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg px-3 py-2 text-sm text-white/55 hover:bg-white/[0.06] hover:text-white" onClick={() => setTagPickerOpen(false)}>Abbrechen</button>
              <button className="accent-primary rounded-lg px-4 py-2 text-sm font-semibold" onClick={() => void applySelectedTags()}>Tags anwenden</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ActionToolbar({
  allSelected, selectedCount, permanentlyDeletes, onSelectAll, onRefresh, onRead,
  onFavorite, onImportant, onTags, onArchive, onDelete
}: {
  allSelected: boolean;
  selectedCount: number;
  permanentlyDeletes: boolean;
  onSelectAll: (selected: boolean) => void;
  onRefresh: () => void;
  onRead: () => void;
  onFavorite: () => void;
  onImportant: () => void;
  onTags: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const disabled = selectedCount === 0;
  return (
    <div className="scrollbar-hidden mx-0 flex h-11 shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.025] px-2">
      <label className="mr-1 inline-flex shrink-0 items-center gap-2 text-[11px] text-white/55">
        <input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} className="mail-checkbox h-3.5 w-3.5" />
        Alle
      </label>
      <ToolbarButton label="Aktualisieren" icon={<RefreshCw size={13} />} onClick={onRefresh} />
      <ToolbarButton label="Gelesen" icon={<CheckCheck size={13} />} onClick={onRead} disabled={disabled} />
      <ToolbarButton label="Favorisieren" icon={<Star size={13} />} onClick={onFavorite} disabled={disabled} />
      <ToolbarButton label="Wichtig" icon={<AlertCircle size={13} />} onClick={onImportant} disabled={disabled} />
      <ToolbarButton label="Tags" icon={<TagIcon size={13} />} onClick={onTags} disabled={disabled} />
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
        "mail-row mail-row-enter group relative grid w-full cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] gap-3 rounded-xl border px-3 py-3 text-left transition-[border-color,background-color] duration-150 sm:grid-cols-[18px_42px_10px_minmax(0,1fr)_auto]",
        active
          ? "border-white/[0.13] bg-white/[0.105] shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
          : email.isRead
            ? "border-transparent bg-transparent hover:border-white/[0.07] hover:bg-white/[0.045]"
            : "border-[rgb(var(--accent)/0.12)] bg-[rgb(var(--accent)/0.055)] before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[3px] before:rounded-full before:bg-[rgb(var(--accent))] hover:border-white/[0.11] hover:bg-white/[0.08]"
      )}
      onClick={() => void onSelect(email)}
      onKeyDown={openFromKeyboard}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onToggleSelection(email.id, event.target.checked)}
        onClick={(event) => event.stopPropagation()}
        className={cn("mail-checkbox mt-1 h-3.5 w-3.5 transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}
        aria-label="Mail auswählen"
      />
      <span className={cn("hidden items-center gap-1 transition-opacity sm:flex", email.isFavorite || email.isImportant ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
        <QuickButton label="Favorit" active={email.isFavorite} alwaysVisible onClick={() => void onQuickAction(email.id, "favorite")}><Star size={13} /></QuickButton>
        <QuickButton label="Wichtig" active={email.isImportant} alwaysVisible onClick={() => void onQuickAction(email.id, "important")}><AlertCircle size={13} /></QuickButton>
      </span>
      <span className={cn("mt-1.5 hidden h-2 w-2 rounded-full sm:block", email.isRead ? "bg-transparent" : "bg-[rgb(var(--accent))] shadow-[0_0_0_4px_rgb(var(--accent)/0.12)]")} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[13px] text-white", email.isRead ? "font-medium" : "font-bold")}>{sender}</span>
          {!email.isRead ? <span className="shrink-0 rounded-full bg-[rgb(var(--accent))] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[rgb(var(--accent-contrast))]">Neu</span> : null}
        </span>
        <span className={cn("mt-1 block truncate text-[13px] leading-5", email.isRead ? "font-normal text-white/86" : "font-bold text-white")}>{email.subject || "(Kein Betreff)"}</span>
        <span className="mt-1.5 flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[12px] leading-5", email.isRead ? "text-white/45" : "font-medium text-white/70")}>{email.preview || "Keine Vorschau verfügbar"}</span>
          {email.hasAttachments ? <Paperclip size={12} className="shrink-0 text-white/40" /> : null}
          {accountLabel ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-white/35">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accountColor ?? "rgb(var(--accent))" }} />
              {accountLabel}
            </span>
          ) : null}
        </span>
        {email.tags.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {email.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] px-2 py-0.5 text-[10px] text-white/55">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
            {email.tags.length > 3 ? <span className="text-[10px] text-white/35">+{email.tags.length - 3}</span> : null}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
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
