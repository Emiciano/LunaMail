import { Activity, AlertCircle, Archive, ChevronRight, FileText, Folder, Inbox, LayoutDashboard, Send, Settings, ShieldAlert, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMailStore } from "../stores/mailStore";
import type { Account, Folder as MailFolder } from "../types";

const SIDEBAR_STORAGE_KEY = "lunamail.sidebar.expanded";
const folderIcons: Record<MailFolder["role"], typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  trash: Trash2,
  spam: ShieldAlert,
  promotions: Folder,
  custom: Folder
};

type ExpandedState = {
  accounts: Record<number, boolean>;
  customFolders: Record<number, boolean>;
};

function readExpandedState(): ExpandedState {
  try {
    const value = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return value ? JSON.parse(value) as ExpandedState : { accounts: {}, customFolders: {} };
  } catch {
    return { accounts: {}, customFolders: {} };
  }
}

export function MailSidebar() {
  const {
    accounts, folders, selectedAccountId, selectedFolderId, selectedView, selectedSpecialAccountId,
    mailCounts, selectAccount, selectFolder, selectSpecialView, openUnifiedInbox, openHealth,
    openSettings, openDashboard
  } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    folders: state.folders,
    selectedAccountId: state.selectedAccountId,
    selectedFolderId: state.selectedFolderId,
    selectedView: state.selectedView,
    selectedSpecialAccountId: state.selectedSpecialAccountId,
    mailCounts: state.mailCounts,
    selectAccount: state.selectAccount,
    selectFolder: state.selectFolder,
    selectSpecialView: state.selectSpecialView,
    openUnifiedInbox: state.openUnifiedInbox,
    openHealth: state.openHealth,
    openSettings: state.openSettings,
    openDashboard: state.openDashboard
  })));
  const [expanded, setExpanded] = useState<ExpandedState>(readExpandedState);

  const foldersByAccount = useMemo(() => {
    const grouped = new Map<number, MailFolder[]>();
    for (const folder of folders) {
      grouped.set(folder.accountId, [...(grouped.get(folder.accountId) ?? []), folder]);
    }
    return grouped;
  }, [folders]);
  const specialByAccount = useMemo(
    () => new Map(mailCounts.perAccount.map((item) => [item.accountId, item])),
    [mailCounts.perAccount]
  );
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  function toggleAccount(account: Account) {
    setExpanded((current) => ({
      ...current,
      accounts: { ...current.accounts, [account.id]: !(current.accounts[account.id] ?? true) }
    }));
    void selectAccount(account.id);
  }

  function toggleCustomFolders(accountId: number) {
    setExpanded((current) => ({
      ...current,
      customFolders: { ...current.customFolders, [accountId]: !(current.customFolders[accountId] ?? true) }
    }));
  }

  return (
    <aside className="mr-2 flex min-h-0 flex-col bg-[#111111] px-3 py-4">
      <div className="mb-4 flex items-center">
        <button className="flex items-center gap-3 text-left" onClick={openSettings}>
          <img src="./icon.png" alt="" className="h-7 w-7 rounded-lg object-cover" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">LunaMail</span>
        </button>
      </div>

      <div className="scrollbar-hidden mail-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        <nav className="space-y-1">
          <SideButton active={selectedView === "dashboard"} icon={<LayoutDashboard size={16} />} label="Dashboard" onClick={openDashboard} />
          <SideButton active={selectedView === "unifiedInbox" && !selectedSpecialAccountId} icon={<Inbox size={16} />} label="Alle Posteingänge" count={mailCounts.unread} onClick={() => void openUnifiedInbox()} />
          <SideButton active={selectedView === "health"} icon={<Activity size={16} />} label="Systemstatus" onClick={() => void openHealth()} />
        </nav>

        <SectionTitle title="Konten" />
        <div className="space-y-2">
          {accounts.length === 0 ? <p className="px-2 py-3 text-[12px] text-white/45">Noch kein Konto verbunden</p> : null}
          {accounts.map((account) => {
            const accountFolders = foldersByAccount.get(account.id) ?? [];
            const primaryFolders = accountFolders.filter((folder) => folder.role !== "custom");
            const customFolders = accountFolders.filter((folder) => folder.role === "custom");
            const accountOpen = expanded.accounts[account.id] ?? true;
            const customOpen = expanded.customFolders[account.id] ?? true;
            const accountUnread = accountFolders.reduce((sum, folder) => sum + folder.unreadCount, 0);

            return (
              <section key={account.id}>
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${selectedAccountId === account.id ? "bg-white/[0.045]" : "hover:bg-white/[0.035]"}`}
                  onClick={() => toggleAccount(account)}
                >
                  <ChevronRight size={14} className={`shrink-0 text-white/45 transition-transform ${accountOpen ? "rotate-90" : ""}`} />
                  <AccountAvatar account={account} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">{account.displayName || account.email}</span>
                    {account.displayName && account.displayName.trim().toLowerCase() !== account.email.trim().toLowerCase()
                      ? <span className="block truncate text-[10px] text-white/40">{account.email}</span>
                      : null}
                  </span>
                  {accountUnread > 0 ? <CountBadge count={accountUnread} /> : null}
                </button>

                {accountOpen ? (
                  <nav className="ml-4 mt-1 space-y-1 pl-2">
                    <SideButton
                      active={selectedView === "favorites" && selectedSpecialAccountId === account.id}
                      icon={<Star size={15} />}
                      label="Favoriten"
                      count={specialByAccount.get(account.id)?.favorites}
                      onClick={() => void selectSpecialView("favorites", account.id)}
                    />
                    <SideButton
                      active={selectedView === "important" && selectedSpecialAccountId === account.id}
                      icon={<AlertCircle size={15} />}
                      label="Wichtig"
                      count={specialByAccount.get(account.id)?.important}
                      onClick={() => void selectSpecialView("important", account.id)}
                    />
                    {primaryFolders.map((folder) => (
                      <FolderButton key={folder.id} folder={folder} active={selectedView === "folder" && selectedFolderId === folder.id} onClick={() => void selectFolder(folder.id)} />
                    ))}
                    {customFolders.length > 0 ? (
                      <>
                        <button className="flex h-8 w-full items-center gap-2 px-2 text-left text-[11px] text-white/45 hover:text-white" onClick={() => toggleCustomFolders(account.id)}>
                          <ChevronRight size={13} className={`transition-transform ${customOpen ? "rotate-90" : ""}`} />
                          Unterordner
                        </button>
                        {customOpen ? customFolders.map((folder) => (
                          <FolderButton key={folder.id} folder={folder} active={selectedView === "folder" && selectedFolderId === folder.id} onClick={() => void selectFolder(folder.id)} />
                        )) : null}
                      </>
                    ) : null}
                  </nav>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>

      <div className="mt-3 shrink-0 border-t border-white/[0.06] pt-3">
        <SideButton active={false} icon={<Settings size={16} />} label="Einstellungen" onClick={openSettings} />
      </div>
    </aside>
  );
}

function SideButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      className={`flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] font-medium ${
        active
          ? "bg-white/[0.10] text-white"
          : "text-white/78 hover:bg-white/[0.055] hover:text-white"
      }`}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count && count > 0 ? <CountBadge count={count} /> : null}
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <div className="mb-2 mt-6 px-2 text-[12px] font-medium text-white/38">{title}</div>;
}

function FolderButton({ folder, active, onClick }: { folder: MailFolder; active: boolean; onClick: () => void }) {
  const Icon = folderIcons[folder.role];
  return <SideButton active={active} icon={<Icon size={15} />} label={folderLabel(folder)} count={folder.unreadCount} onClick={onClick} />;
}

function folderLabel(folder: MailFolder) {
  const labels: Partial<Record<MailFolder["role"], string>> = {
    inbox: "Posteingang",
    sent: "Gesendet",
    drafts: "Entwürfe",
    archive: "Archiv",
    trash: "Papierkorb",
    spam: "Spam",
    promotions: "Werbung"
  };
  return labels[folder.role] ?? translateFolderName(folder.name);
}

function translateFolderName(name: string) {
  const labels: Record<string, string> = {
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
  return labels[name.trim().toLowerCase()] ?? name;
}

function CountBadge({ count }: { count: number }) {
  return <span className="min-w-5 rounded-full bg-[rgb(var(--accent)/0.16)] px-1.5 py-0.5 text-center text-[10px] text-[rgb(var(--accent))]">{count > 99 ? "99+" : count}</span>;
}

function AccountAvatar({ account }: { account?: Account }) {
  const label = account?.displayName || account?.email || "L";
  return <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#151515] text-[11px] font-semibold">{label.charAt(0).toUpperCase()}</span>;
}
