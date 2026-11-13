import { Activity, AlarmClock, AlertCircle, Archive, ChevronRight, FileText, Folder, Inbox, LayoutDashboard, Send, Settings, ShieldAlert, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMailStore } from "../stores/mailStore";
import type { Account, Folder as MailFolder } from "../types";
import { UpdateBanner } from "./UpdateBanner";

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
  return { accounts: {}, customFolders: {} };
}

export function MailSidebar() {
  const {
    accounts, folders, selectedAccountId, selectedFolderId, selectedView, selectedSpecialAccountId,
    mailCounts, selectFolder, selectSpecialView, openUnifiedInbox, openHealth,
    openSettings, openDashboard, openSnoozed, accountAppearance
  } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    folders: state.folders,
    selectedAccountId: state.selectedAccountId,
    selectedFolderId: state.selectedFolderId,
    selectedView: state.selectedView,
    selectedSpecialAccountId: state.selectedSpecialAccountId,
    mailCounts: state.mailCounts,
    selectFolder: state.selectFolder,
    selectSpecialView: state.selectSpecialView,
    openUnifiedInbox: state.openUnifiedInbox,
    openHealth: state.openHealth,
    openSettings: state.openSettings,
    openDashboard: state.openDashboard,
    openSnoozed: state.openSnoozed,
    accountAppearance: state.settings.accountAppearance
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
  function toggleAccount(account: Account) {
    setExpanded((current) => ({
      ...current,
      accounts: { ...current.accounts, [account.id]: !(current.accounts[account.id] ?? false) }
    }));
  }

  function toggleCustomFolders(accountId: number) {
    setExpanded((current) => ({
      ...current,
      customFolders: { ...current.customFolders, [accountId]: !(current.customFolders[accountId] ?? true) }
    }));
  }

  return (
    <aside className="flex min-h-0 w-[260px] shrink-0 flex-col border-r border-line bg-sidebar lg:border-r-0 px-3 pb-4 pt-5 lg:w-[272px]">
      <div className="mb-6 flex items-center px-2">
        <button className="titlebar-no-drag flex items-center gap-2.5 text-left" onClick={openSettings} title="Einstellungen">
          <img src="./icon.png" alt="" className="h-9 w-9 object-contain" />
          <span className="font-display text-[20px] font-extrabold">LunaMail</span>
        </button>
      </div>

      <div className="scrollbar-hidden mail-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        <nav className="space-y-0.5">
          <SideButton active={selectedView === "dashboard"} icon={<LayoutDashboard size={17} />} label="Dashboard" onClick={openDashboard} />
          <SideButton active={selectedView === "unifiedInbox" && !selectedSpecialAccountId} icon={<Inbox size={17} />} label="Alle Posteingänge" count={mailCounts.unread} onClick={() => void openUnifiedInbox()} />
          <SideButton active={selectedView === "snoozed"} icon={<AlarmClock size={17} />} label="Erinnerungen" count={mailCounts.snoozed} onClick={() => void openSnoozed()} />
          <SideButton active={selectedView === "health"} icon={<Activity size={17} />} label="Systemstatus" onClick={() => void openHealth()} />
        </nav>

        <SectionTitle title="Postfächer" />
        <div className="space-y-0.5">
          {accounts.length === 0 ? <p className="px-3 py-2 text-[13px] text-label-2">Noch kein Konto verbunden</p> : null}
          {accounts.map((account) => {
            const accountFolders = foldersByAccount.get(account.id) ?? [];
            const primaryFolders = accountFolders.filter((folder) => folder.role !== "custom");
            const customFolders = accountFolders.filter((folder) => folder.role === "custom");
            const accountOpen = expanded.accounts[account.id] ?? false;
            const customOpen = expanded.customFolders[account.id] ?? true;
            const accountUnread = accountFolders.reduce((sum, folder) => sum + folder.unreadCount, 0);

            return (
              <section key={account.id}>
                <button
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-ink/[0.04]`}
                  onClick={() => toggleAccount(account)}
                >
                  <ChevronRight size={14} className={`shrink-0 text-label-3 transition-transform ${accountOpen ? "rotate-90" : ""}`} />
                  <AccountAvatar account={account} color={accountAppearance?.[String(account.id)]?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{account.displayName || account.email}</span>
                    {account.displayName && account.displayName.trim().toLowerCase() !== account.email.trim().toLowerCase()
                      ? <span className="block truncate text-[12px] text-label-2">{account.email}</span>
                      : null}
                  </span>
                  {accountUnread > 0 ? <CountBadge count={accountUnread} /> : null}
                </button>

                <div className="collapse-grid" data-open={accountOpen} inert={!accountOpen}>
                  <nav className="mb-2 ml-3 mt-0.5 space-y-0.5 pl-2">
                    <SideButton
                      active={selectedView === "favorites" && selectedSpecialAccountId === account.id}
                      icon={<Star size={15} />}
                      label="Favoriten"
                      index={0}
                      count={specialByAccount.get(account.id)?.favorites}
                      onClick={() => void selectSpecialView("favorites", account.id)}
                    />
                    <SideButton
                      active={selectedView === "important" && selectedSpecialAccountId === account.id}
                      icon={<AlertCircle size={15} />}
                      label="Wichtig"
                      index={1}
                      count={specialByAccount.get(account.id)?.important}
                      onClick={() => void selectSpecialView("important", account.id)}
                    />
                    {primaryFolders.map((folder, folderIndex) => (
                      <FolderButton key={folder.id} index={folderIndex + 2} folder={folder} active={selectedView === "folder" && selectedFolderId === folder.id} onClick={() => void selectFolder(folder.id)} />
                    ))}
                    {customFolders.length > 0 ? (
                      <>
                        <button className="flex h-8 w-full items-center gap-2 px-3 text-left text-[12px] font-medium text-label-2 hover:text-ink" onClick={() => toggleCustomFolders(account.id)}>
                          <ChevronRight size={13} className={`transition-transform ${customOpen ? "rotate-90" : ""}`} />
                          Unterordner
                        </button>
                        {customOpen ? customFolders.map((folder) => (
                          <FolderButton key={folder.id} folder={folder} active={selectedView === "folder" && selectedFolderId === folder.id} onClick={() => void selectFolder(folder.id)} />
                        )) : null}
                      </>
                    ) : null}
                  </nav>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="mt-auto shrink-0">
        <UpdateBanner />
      </div>
      <div className="shrink-0 border-t border-line pt-3">
        <SideButton active={false} icon={<Settings size={17} />} label="Einstellungen" onClick={openSettings} />
      </div>
    </aside>
  );
}

function SideButton({ active, icon, label, count, onClick, index }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void; index?: number }) {
  return (
    <button
      style={index !== undefined ? ({ "--i": index } as CSSProperties) : undefined}
      className={`pressable relative flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] transition-[background-color,box-shadow,color] duration-200 ${index !== undefined ? "stagger-item " : ""}${
        active ? "side-active bg-canvas font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_rgb(var(--line))]" : "font-medium text-ink/80 hover:bg-ink/[0.04] hover:text-ink"
      }`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <span className={`side-icon inline-flex ${active ? "text-ink" : "text-label-2"}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count && count > 0 ? <CountBadge count={count} /> : null}
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <div className="mb-1.5 mt-6 px-3 text-[11px] font-bold uppercase tracking-[0.07em] text-label-3">{title}</div>;
}

function FolderButton({ folder, active, onClick, index }: { folder: MailFolder; active: boolean; onClick: () => void; index?: number }) {
  const Icon = folderIcons[folder.role];
  return <SideButton active={active} index={index} icon={<Icon size={15} />} label={folderLabel(folder)} count={folder.unreadCount} onClick={onClick} />;
}

export function folderLabel(folder: MailFolder) {
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
  return (
    <span className="min-w-5 overflow-hidden text-right text-[13px] font-medium tabular-nums text-label-2">
      <span key={count} className="count-tick">{count > 99 ? "99+" : count}</span>
    </span>
  );
}

function AccountAvatar({ account, color }: { account?: Account; color?: string }) {
  const label = account?.displayName || account?.email || "L";
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2A2A2A] text-[13px] font-semibold text-white" style={color ? { backgroundColor: color } : undefined}>
      {label.charAt(0).toUpperCase()}
    </span>
  );
}
