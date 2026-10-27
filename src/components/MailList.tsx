import { AlertCircle, Archive, CheckCheck, MailOpen, Paperclip, RefreshCw, Search, Star, Tag as TagIcon, Trash2, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";
import type { Email } from "../types";
import { folderLabel } from "./MailSidebar";

const PAGE_SIZE = 30;

export function MailList() {
  const {
    accounts, folders, emails, selectedEmail, selectedFolderId, selectedView, selectedEmailIds,
    selectedCategoryId, categories, query, databaseSizeBytes,
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
  const selectedFolder = selectedView === "folder" ? folders.find((folder) => folder.id === selectedFolderId) : undefined;
  const title = selectedFolder ? folderLabel(selectedFolder) : viewTitle(selectedView, selectedCategoryId);
  const unreadCount = useMemo(() => emails.filter((email) => !email.isRead).length, [emails]);
  const subtitle = selectedView === "health"
      ? "Lokaler Status und Synchronisation"
      : selectedCount > 0
        ? `${selectedCount} ausgewählt`
        : [
            selectedFolder ? accountById.get(selectedFolder.accountId)?.displayName : undefined,
            `${emails.length} ${emails.length === 1 ? "Nachricht" : "Nachrichten"}`,
            unreadCount > 0 ? `${unreadCount} ungelesen` : undefined
          ].filter(Boolean).join(" · ");

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
    <section className="flex h-full min-h-0 flex-col bg-canvas px-3 pb-0 lg:px-4">
      <header className="flex shrink-0 items-end justify-between gap-4 px-1 pb-3 pt-6">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[30px] font-extrabold leading-[34px]">{title}</h1>
          <p className="mt-1 truncate text-[13px] font-medium text-label-2">{subtitle}</p>
        </div>
      </header>

      {showsMailList ? (
        <>
          <div className="shrink-0 px-1 pb-2">
            <label className="flex h-9 max-w-[520px] items-center gap-2 rounded-[10px] bg-surface px-2.5 text-label-2 transition focus-within:bg-surface-2">
              <Search size={17} />
              <input
                id="mail-search-input"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-label-2"
                placeholder="Suchen"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              {searchDraft ? (
                <button type="button" className="rounded-full p-0.5 text-label-3 hover:text-ink" onClick={() => setSearchDraft("")} title="Suche löschen">
                  <X size={15} />
                </button>
              ) : <span className="text-[11px] font-medium text-label-3">Strg F</span>}
            </label>
            {selectedView === "unifiedInbox" && categories.length > 0 ? (
              <div className="scrollbar-hidden mt-2.5 flex gap-1.5 overflow-x-auto text-[13px] font-semibold">
                <button className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${!selectedCategoryId ? "bg-ink text-canvas" : "bg-surface text-ink/80 hover:bg-surface-2"}`} onClick={() => void selectCategory(undefined)}>
                  Alle
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${selectedCategoryId === category.id ? "bg-ink text-canvas" : "bg-surface text-ink/80 hover:bg-surface-2"}`}
                    onClick={() => void selectCategory(category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="scrollbar-hidden mt-2.5 flex gap-1.5 overflow-x-auto text-[13px] font-semibold">
                <button
                  className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${!searchFilters.tagId ? "bg-ink text-canvas" : "bg-surface text-ink/80 hover:bg-surface-2"}`}
                  onClick={() => void setSearchFilters({ ...searchFilters, tagId: undefined })}
                >
                  Alle
                </button>
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${searchFilters.tagId === tag.id ? "bg-ink text-canvas" : "bg-surface text-ink/80 hover:bg-surface-2"}`}
                    onClick={() => void setSearchFilters({ ...searchFilters, tagId: tag.id })}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
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

      {selectedView === "health" ? (
        <div className="mail-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-1 pb-24 pt-2 xl:grid-cols-3">
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
            className="mail-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pb-24 pt-1"
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
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-label-2">
                  {syncError ? <AlertCircle size={20} /> : <MailOpen size={20} />}
                </span>
                <h2 className="mt-4 font-display text-[20px] font-bold">
                  {accounts.length === 0 ? "Noch kein Konto verbunden" : syncError ? "Synchronisation fehlgeschlagen" : hasSynced ? "Keine Nachrichten gefunden" : "Bereit für die erste Synchronisierung"}
                </h2>
                <p className="mt-2 text-[14px] leading-5 text-label-2">
                  {accounts.length === 0 ? "Verbinde in den Einstellungen ein E-Mail-Konto, um loszulegen." : syncError ? syncError : hasSynced ? "In dieser Ansicht gibt es momentan keine passenden E-Mails." : "LunaMail lädt deine Nachrichten sicher auf dieses Gerät."}
                </p>
                {accounts.length > 0 && !hasSynced ? (
                  <button className="accent-primary mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold" onClick={() => void sync(false)}>
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
                anySelected={selectedCount > 0}
                accountLabel={accountById.get(email.accountId)?.displayName}
                accountColor={settings.accountAppearance?.[String(email.accountId)]?.color}
                permanentlyDeletes={permanentlyDeletes}
                onSelect={selectEmail}
                onToggleSelection={toggleEmailSelection}
                onQuickAction={quickAction}
              />
            ))}
          </div>
        </>
      ) : null}

      {tagPickerOpen ? (
        <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-scrim/40 p-6" onClick={() => setTagPickerOpen(false)}>
          <section className="w-[min(420px,calc(100vw-2rem))] rounded-xl border border-ink/[0.08] bg-surface p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Tags zuweisen</h2>
                <p className="mt-1 text-xs text-ink/45">{selectedCount} ausgewählte Nachrichten</p>
              </div>
              <button className="rounded-lg p-2 text-ink/45 hover:bg-ink/[0.06] hover:text-ink" onClick={() => setTagPickerOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="mail-scroll mt-4 max-h-72 space-y-2 overflow-y-auto">
              {tags.length === 0 ? (
                <p className="rounded-lg border border-ink/[0.06] px-3 py-4 text-sm text-ink/45">Erstelle zuerst unter Einstellungen → Tags einen Tag.</p>
              ) : null}
              {tags.map((tag) => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink/[0.06] px-3 py-3 hover:bg-ink/[0.04]">
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
              <button className="rounded-lg px-3 py-2 text-sm text-ink/55 hover:bg-ink/[0.06] hover:text-ink" onClick={() => setTagPickerOpen(false)}>Abbrechen</button>
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
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line px-1">
      <label className="mr-auto inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full py-1 pl-2 pr-3 text-[13px] font-medium text-label-2 hover:text-ink">
        <input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} className="mail-checkbox h-[18px] w-[18px]" />
        Alle
      </label>
      <ToolbarButton label="Aktualisieren" icon={<RefreshCw size={16} />} onClick={onRefresh} />
      <ToolbarButton label="Als gelesen markieren" icon={<CheckCheck size={16} />} onClick={onRead} disabled={disabled} />
      <ToolbarButton label="Favorisieren" icon={<Star size={16} />} onClick={onFavorite} disabled={disabled} />
      <ToolbarButton label="Als wichtig markieren" icon={<AlertCircle size={16} />} onClick={onImportant} disabled={disabled} />
      <ToolbarButton label="Tags" icon={<TagIcon size={16} />} onClick={onTags} disabled={disabled} />
      <ToolbarButton label="Archivieren" icon={<Archive size={16} />} onClick={onArchive} disabled={disabled} />
      <ToolbarButton label={permanentlyDeletes ? "Endgültig löschen" : "Löschen"} icon={<Trash2 size={16} />} onClick={onDelete} disabled={disabled} danger />
    </div>
  );
}

function ToolbarButton({ label, icon, onClick, disabled = false, danger = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
        danger ? "text-danger hover:bg-danger/10" : "text-label-2 hover:bg-surface hover:text-ink",
        disabled && "pointer-events-none opacity-30"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

const MailRow = memo(function MailRow({
  email, active, selected, anySelected, accountLabel, accountColor, permanentlyDeletes,
  onSelect, onToggleSelection, onQuickAction
}: {
  email: Email;
  active: boolean;
  selected: boolean;
  anySelected: boolean;
  accountLabel?: string;
  accountColor?: string;
  permanentlyDeletes: boolean;
  onSelect: (email: Email) => Promise<void>;
  onToggleSelection: (id: number, selected: boolean) => void;
  onQuickAction: (emailId: number, action: "delete" | "favorite" | "important" | "read" | "archive") => Promise<void>;
}) {
  const timeLabel = useMemo(() => formatMailTime(email.receivedAt), [email.receivedAt]);
  const sender = senderName(email.sender) || accountLabel || "Unbekannter Absender";
  const unread = !email.isRead;

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
        "mail-row mail-row-enter group relative flex w-full cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors duration-150",
        "after:pointer-events-none after:absolute after:bottom-0 after:left-[68px] after:right-3 after:h-px after:bg-line",
        active ? "bg-surface after:opacity-0" : selected ? "bg-ink/[0.05] after:opacity-0" : "hover:bg-ink/[0.03] hover:after:opacity-0"
      )}
      onClick={() => void onSelect(email)}
      onKeyDown={openFromKeyboard}
    >
      <span className="group/tile relative mt-0.5 shrink-0">
        <SenderTile name={sender} hidden={selected || anySelected} />
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onToggleSelection(email.id, event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className={cn("mail-checkbox absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 transition-opacity", selected || anySelected ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100 group-focus-visible:opacity-100")}
          aria-label="Mail auswählen"
        />
        {unread && !anySelected ? <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full border-2 border-canvas bg-[rgb(var(--accent))]" aria-label="Ungelesen" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("min-w-0 flex-1 truncate text-[15px] leading-5", unread ? "font-extrabold" : "font-semibold")}>{sender}</span>
          {email.hasAttachments ? <Paperclip size={13} className="shrink-0 text-label-2" /> : null}
          {email.isImportant ? <AlertCircle size={13} className="shrink-0 text-flag" /> : null}
          {email.isFavorite ? <Star size={13} className="shrink-0 fill-flag text-flag" /> : null}
          <time className="ml-1 shrink-0 whitespace-nowrap text-[13px] font-medium text-label-2">{timeLabel}</time>
        </span>
        <span className={cn("mt-0.5 block truncate text-[14px] leading-5", unread ? "font-semibold text-ink" : "text-ink/85")}>{email.subject || "(Kein Betreff)"}</span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-label-2">{email.preview || "Keine Vorschau verfügbar"}</span>
        {email.tags.length > 0 || accountLabel ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {accountLabel ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-label-3">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accountColor ?? "rgb(var(--label-3))" }} />
                {accountLabel}
              </span>
            ) : null}
            {email.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-label-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
            {email.tags.length > 3 ? <span className="text-[11px] text-label-3">+{email.tags.length - 3}</span> : null}
          </span>
        ) : null}
      </span>
      <span className="absolute right-2.5 top-2 hidden items-center gap-0.5 rounded-full border border-line bg-canvas p-0.5 shadow-float group-hover:flex">
        <QuickButton label={email.isRead ? "Als ungelesen markieren" : "Als gelesen markieren"} onClick={() => void onQuickAction(email.id, "read")}><MailOpen size={14} /></QuickButton>
        <QuickButton label="Favorit" active={email.isFavorite} onClick={() => void onQuickAction(email.id, "favorite")}><Star size={14} /></QuickButton>
        <QuickButton label="Wichtig" active={email.isImportant} onClick={() => void onQuickAction(email.id, "important")}><AlertCircle size={14} /></QuickButton>
        <QuickButton label="Archivieren" onClick={() => void onQuickAction(email.id, "archive")}><Archive size={14} /></QuickButton>
        <QuickButton label={permanentlyDeletes ? "Endgültig löschen" : "Löschen"} danger onClick={() => void onQuickAction(email.id, "delete")}><Trash2 size={14} /></QuickButton>
      </span>
    </div>
  );
});

/** Runde Kachel mit Initialen, wie die Absender-Kacheln der Android-App. */
function SenderTile({ name, hidden }: { name: string; hidden: boolean }) {
  return (
    <span className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-[#2A2A2A] text-[15px] font-semibold text-white transition-opacity", hidden ? "opacity-0" : "group-hover/tile:opacity-0")}>
      {initials(name)}
    </span>
  );
}

function QuickButton({ label, children, onClick, active = false, danger = false }: { label: string; children: ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
        active ? "text-flag" : danger ? "text-label-2 hover:bg-danger/10 hover:text-danger" : "text-label-2 hover:bg-surface hover:text-ink"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function DashboardCard({ label, value, compact = false, icon }: { label: string; value: string | number; compact?: boolean; icon?: ReactNode }) {
  return (
    <article className="tr-card min-h-[118px] rounded-[20px] p-5">
      <div className="flex items-center justify-between text-[13px] font-semibold text-label-2">
        <span>{label}</span>
        <span className="text-ink">{icon}</span>
      </div>
      <div className={cn("mt-5 text-ink", compact ? "text-[16px] font-semibold leading-6" : "font-display text-[32px] font-extrabold leading-9")}>{value}</div>
    </article>
  );
}

function MailListSkeleton() {
  return (
    <div className="space-y-1 p-3">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="flex animate-pulse gap-3 py-3">
          <div className="h-11 w-11 rounded-full bg-surface" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-1/2 rounded-full bg-surface" />
            <div className="h-3 w-3/4 rounded-full bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}

function senderName(sender: string) {
  const name = sender.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  return name || sender.match(/<([^>]+)>/)?.[1] || sender;
}

function initials(name: string) {
  const parts = name.split(/[\s._-]+/).filter((part) => /\p{L}/u.test(part.charAt(0)));
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return letters || name.charAt(0).toUpperCase() || "?";
}

function viewTitle(view: ReturnType<typeof useMailStore.getState>["selectedView"], selectedCategoryId?: number) {
  if (view === "dashboard") return "Dashboard";
  if (view === "health") return "Systemstatus";
  if (view === "unifiedInbox") return selectedCategoryId ? "Alle Posteingänge · Kategorie" : "Alle Posteingänge";
  if (view === "favorites") return "Favoriten";
  if (view === "important") return "Wichtig";
  return "Nachrichten";
}

/** „14:32“, „Gestern“, „Montag“ oder „03.10.26“ – wie in der Android-App. */
function formatMailTime(value: string) {
  const date = new Date(value);
  const startOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Gestern";
  if (days < 7) return date.toLocaleDateString("de-DE", { weekday: "long" });
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
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
