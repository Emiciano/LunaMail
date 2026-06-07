import { Activity, AlertCircle, Archive, BadgeAlert, ChevronRight, FileText, Inbox, LayoutDashboard, Megaphone, Send, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";
import type { Account, Folder } from "../types";

const SIDEBAR_STORAGE_KEY = "lunamail.sidebar.expanded";

const folderIcon: Record<Folder["role"], typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  trash: Trash2,
  spam: BadgeAlert,
  promotions: Megaphone,
  archive: Archive,
  custom: Star
};

type ExpandedState = {
  accounts: Record<number, boolean>;
  customFolders: Record<number, boolean>;
};

function readExpandedState(): ExpandedState {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? JSON.parse(stored) as ExpandedState : { accounts: {}, customFolders: {} };
  } catch {
    return { accounts: {}, customFolders: {} };
  }
}

export function MailSidebar() {
  const { accounts, folders, selectedAccountId, selectedFolderId, selectedView, selectedSpecialAccountId, selectedCategoryId, categories, mailCounts, settings, selectAccount, selectFolder, selectSpecialView, openDashboard, openUnifiedInbox, openHealth, selectCategory } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    folders: state.folders,
    selectedAccountId: state.selectedAccountId,
    selectedFolderId: state.selectedFolderId,
    selectedView: state.selectedView,
    selectedSpecialAccountId: state.selectedSpecialAccountId,
    selectedCategoryId: state.selectedCategoryId,
    categories: state.categories,
    mailCounts: state.mailCounts,
    settings: state.settings,
    selectAccount: state.selectAccount,
    selectFolder: state.selectFolder,
    selectSpecialView: state.selectSpecialView,
    openDashboard: state.openDashboard,
    openUnifiedInbox: state.openUnifiedInbox,
    openHealth: state.openHealth,
    selectCategory: state.selectCategory
  })));
  const [expanded, setExpanded] = useState<ExpandedState>(readExpandedState);

  const foldersByAccount = useMemo(() => {
    const grouped = new Map<number, Folder[]>();
    for (const folder of folders) {
      grouped.set(folder.accountId, [...(grouped.get(folder.accountId) ?? []), folder]);
    }
    return grouped;
  }, [folders]);

  const unreadByAccount = useMemo(() => {
    const totals = new Map<number, number>();
    for (const folder of folders) {
      totals.set(folder.accountId, (totals.get(folder.accountId) ?? 0) + folder.unreadCount);
    }
    return totals;
  }, [folders]);

  const specialByAccount = useMemo(() => {
    const map = new Map<number, { favorites: number; important: number }>();
    for (const item of mailCounts.perAccount) {
      map.set(item.accountId, { favorites: item.favorites, important: item.important });
    }
    return map;
  }, [mailCounts.perAccount]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  function toggleAccount(account: Account) {
    setExpanded((current) => ({
      ...current,
      accounts: {
        ...current.accounts,
        [account.id]: !(current.accounts[account.id] ?? true)
      }
    }));
    void selectAccount(account.id);
  }

  function toggleCustomFolders(accountId: number) {
    setExpanded((current) => ({
      ...current,
      customFolders: {
        ...current.customFolders,
        [accountId]: !(current.customFolders[accountId] ?? true)
      }
    }));
  }

  const compactSidebar = settings.layoutMode === "compact";
  const comfortableSidebar = settings.layoutMode === "comfortable";

  return (
    <aside className={cn("min-h-0 h-full")}>
      <div className={cn("glass-panel mail-scroll h-full overflow-y-auto rounded-[18px]", compactSidebar ? "px-1.5 py-2.5" : comfortableSidebar ? "px-2.5 py-4" : "px-2 py-3")}>
      <div className="mb-4 space-y-1">
        <button
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
            selectedView === "dashboard"
              ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
              : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
          )}
          onClick={openDashboard}
        >
          <LayoutDashboard size={15} />
          <span className="flex-1 truncate">Übersicht</span>
        </button>
        <button
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
            selectedView === "unifiedInbox"
              ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
              : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
          )}
          onClick={() => void openUnifiedInbox()}
        >
          <Inbox size={15} />
          <span className="flex-1 truncate">Alle Posteingänge</span>
        </button>
        <button
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
            selectedView === "health"
              ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
              : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
          )}
          onClick={() => void openHealth()}
        >
          <Activity size={15} />
          <span className="flex-1 truncate">Systemstatus</span>
        </button>
      </div>
      <div className="mb-4">
        <h2 className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Kategorien</h2>
        <div className="mt-2 space-y-1">
          {categories.map((category) => (
            <button
              key={category.id}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
                selectedView === "unifiedInbox" && selectedCategoryId === category.id
                  ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
                  : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
              )}
              onClick={() => void selectCategory(category.id)}
            >
              <span className="min-w-0 flex-1 truncate">{category.label}</span>
              {category.count > 0 ? <UnreadBadge count={category.count} active={selectedView === "unifiedInbox" && selectedCategoryId === category.id} /> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-6">
        <h2 className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Konten</h2>
        <div className="mt-3 space-y-2">
          {accounts.length === 0 ? (
            <div className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400">Noch kein Konto verbunden</div>
          ) : null}
          {accounts.map((account) => {
            const accountFolders = foldersByAccount.get(account.id) ?? [];
            const primaryFolders = accountFolders.filter((folder) => folder.role !== "custom");
            const customFolders = accountFolders.filter((folder) => folder.role === "custom");
            const accountOpen = expanded.accounts[account.id] ?? true;
            const customOpen = expanded.customFolders[account.id] ?? true;
            const accountUnread = unreadByAccount.get(account.id) ?? 0;

            return (
              <section key={account.id} className="space-y-1.5">
                <button
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 text-left transition-colors",
                    selectedAccountId === account.id
                      ? "glass-subtle"
                      : "hover:bg-white/42 dark:hover:bg-white/[0.08]"
                  )}
                  onClick={() => toggleAccount(account)}
                >
                  <span className="h-6 w-1 rounded-full" style={{ background: settings.accountAppearance?.[String(account.id)]?.color ?? "transparent" }} />
                  <ChevronRight
                    size={15}
                    className={cn("shrink-0 text-slate-400 transition-transform duration-150 ease-out motion-reduce:transition-none", accountOpen && "rotate-90")}
                  />
                  {settings.accountAppearance?.[String(account.id)]?.avatarUrl ? (
                    <img src={settings.accountAppearance[String(account.id)]!.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{account.displayName}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-500">{account.email}</span>
                  </span>
                  {accountUnread > 0 ? <UnreadBadge count={accountUnread} active={selectedAccountId === account.id} /> : null}
                </button>

                {accountOpen ? (
                  <div className="ml-5 space-y-1">
                    <button
                      className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
                        selectedView === "favorites" && selectedSpecialAccountId === account.id
                          ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
                          : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
                      )}
                      onClick={() => void selectSpecialView("favorites", account.id)}
                    >
                      <Star size={15} />
                      <span className="min-w-0 flex-1 truncate">Favoriten</span>
                      {(specialByAccount.get(account.id)?.favorites ?? 0) > 0
                        ? <UnreadBadge count={specialByAccount.get(account.id)!.favorites} active={selectedView === "favorites" && selectedSpecialAccountId === account.id} />
                        : null}
                    </button>
                    <button
                      className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
                        selectedView === "important" && selectedSpecialAccountId === account.id
                          ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
                          : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
                      )}
                      onClick={() => void selectSpecialView("important", account.id)}
                    >
                      <AlertCircle size={15} />
                      <span className="min-w-0 flex-1 truncate">Wichtig</span>
                      {(specialByAccount.get(account.id)?.important ?? 0) > 0
                        ? <UnreadBadge count={specialByAccount.get(account.id)!.important} active={selectedView === "important" && selectedSpecialAccountId === account.id} />
                        : null}
                    </button>
                    <button
                      className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
                        selectedView === "unifiedInbox" && selectedSpecialAccountId === account.id && !selectedCategoryId
                          ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
                          : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
                      )}
                      onClick={() => void openUnifiedInbox(account.id)}
                    >
                      <Inbox size={15} />
                      <span className="min-w-0 flex-1 truncate">Alle Posteingänge ({account.displayName})</span>
                    </button>
                    {primaryFolders.map((folder) => (
                      <FolderButton
                        key={folder.id}
                        folder={folder}
                        active={selectedView === "folder" && selectedFolderId === folder.id}
                        onClick={() => void selectFolder(folder.id)}
                      />
                    ))}

                    {customFolders.length > 0 ? (
                      <>
                        <button
                          className="surface-text-secondary flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs transition-colors duration-150 hover:bg-white/42 dark:hover:bg-white/[0.08]"
                          onClick={() => toggleCustomFolders(account.id)}
                        >
                          <ChevronRight size={14} className={cn("transition-transform duration-150 ease-out motion-reduce:transition-none", customOpen && "rotate-90")} />
                          <span className="flex-1 truncate">Unterordner</span>
                        </button>
                        {customOpen ? (
                          <div className="ml-4 space-y-1">
                            {customFolders.map((folder) => (
                              <FolderButton
                                key={folder.id}
                                folder={folder}
                                active={selectedView === "folder" && selectedFolderId === folder.id}
                                onClick={() => void selectFolder(folder.id)}
                              />
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
      </div>
    </aside>
  );
}

function FolderButton({ folder, active, onClick }: { folder: Folder; active: boolean; onClick: () => void }) {
  const Icon = folderIcon[folder.role];
  return (
    <button
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors",
        active
          ? "glass-pill-active text-[rgb(var(--text-primary))] dark:text-white"
          : "surface-text-primary hover:bg-white/42 dark:hover:bg-white/[0.08]"
      )}
      onClick={onClick}
    >
      <Icon size={15} />
      <span className="min-w-0 flex-1 truncate">{folderLabel(folder)}</span>
      {folder.unreadCount > 0 ? <UnreadBadge count={folder.unreadCount} active={active} /> : null}
    </button>
  );
}

function folderLabel(folder: Folder): string {
  const labels: Partial<Record<Folder["role"], string>> = {
    inbox: "Posteingang",
    sent: "Gesendet",
    drafts: "Entwürfe",
    archive: "Archiv",
    spam: "Spam",
    trash: "Papierkorb",
    promotions: "Werbung"
  };
  return labels[folder.role] ?? translateCustomFolder(folder.name);
}

function translateCustomFolder(name: string): string {
  const normalized = name.trim().toLowerCase();
  const translations: Record<string, string> = {
    inbox: "Posteingang",
    sent: "Gesendet",
    "sent messages": "Gesendet",
    "sent mail": "Gesendet",
    drafts: "Entwürfe",
    archive: "Archiv",
    junk: "Spam",
    trash: "Papierkorb",
    deleted: "Papierkorb",
    "deleted messages": "Papierkorb"
  };
  return translations[normalized] ?? name;
}

function UnreadBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={cn(
        "min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-medium",
        active ? "bg-[rgb(var(--accent)/0.22)] text-[rgb(var(--text-primary))] dark:text-white" : "bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))] dark:bg-white/8"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
