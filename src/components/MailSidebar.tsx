import { Archive, ChevronDown, Edit3, FileText, Folder, Inbox, Moon, Send, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMailStore } from "../stores/mailStore";
import type { Folder as MailFolder } from "../types";

const primaryRoles: Array<{ role: MailFolder["role"]; label: string; icon: typeof Inbox }> = [
  { role: "inbox", label: "Posteingang", icon: Inbox },
  { role: "sent", label: "Gesendet", icon: Send },
  { role: "drafts", label: "Entwürfe", icon: FileText },
  { role: "archive", label: "Archiv", icon: Archive },
  { role: "trash", label: "Papierkorb", icon: Trash2 },
  { role: "spam", label: "Spam", icon: ShieldAlert }
];

const requestedFolders = ["Arbeit", "Privat", "Projekte", "Rechnungen", "Newsletter"];
const labels = [
  ["Wichtig", "#FF6B57"],
  ["Kunden", "#A6A6A6"],
  ["Rechnungen", "#54C56E"],
  ["Information", "#5D8CFF"]
] as const;

export function MailSidebar() {
  const { accounts, folders, selectedFolderId, selectedView, mailCounts, selectFolder, selectSpecialView, openComposer, openSettings } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    folders: state.folders,
    selectedFolderId: state.selectedFolderId,
    selectedView: state.selectedView,
    mailCounts: state.mailCounts,
    selectFolder: state.selectFolder,
    selectSpecialView: state.selectSpecialView,
    openComposer: state.openComposer,
    openSettings: state.openSettings
  })));

  const firstAccount = accounts[0];
  const accountFolders = useMemo(
    () => firstAccount ? folders.filter((folder) => folder.accountId === firstAccount.id) : folders,
    [firstAccount, folders]
  );
  const foldersByRole = useMemo(() => new Map(accountFolders.map((folder) => [folder.role, folder])), [accountFolders]);
  const customFolders = accountFolders.filter((folder) => folder.role === "custom");

  return (
    <aside className="flex min-h-0 flex-col border-r border-white/[0.06] bg-[#0B0B0B] px-5 py-5">
      <div className="mb-7 flex items-center justify-between">
        <button className="flex items-center gap-3 text-left" onClick={openSettings}>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0B0B0B]">
            <Moon size={15} fill="currentColor" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">LunaMail</span>
        </button>
        <button className="rounded-md p-1.5 text-white/55 hover:bg-white/[0.06] hover:text-white" onClick={() => openComposer()} title="Neue Nachricht">
          <Edit3 size={16} />
        </button>
      </div>

      <nav className="space-y-1">
        {primaryRoles.map(({ role, label, icon: Icon }) => {
          const folder = foldersByRole.get(role);
          const active = selectedView === "folder" && selectedFolderId === folder?.id;
          return (
            <button
              key={role}
              className={`flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] font-medium ${active ? "bg-white/[0.08] text-white" : "text-white/82 hover:bg-white/[0.05]"}`}
              onClick={() => folder && void selectFolder(folder.id)}
            >
              <Icon size={16} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {role === "inbox" && mailCounts.unread > 0 ? <span className="text-xs text-white/65">{mailCounts.unread}</span> : null}
            </button>
          );
        })}
      </nav>

      <SectionTitle title="Ordner" />
      <nav className="space-y-1">
        {requestedFolders.map((name) => {
          const folder = customFolders.find((item) => item.name.toLowerCase() === name.toLowerCase() || item.remoteName.toLowerCase().includes(name.toLowerCase()));
          const active = selectedView === "folder" && selectedFolderId === folder?.id;
          return (
            <button
              key={name}
              className={`flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] ${active ? "bg-white/[0.08] text-white" : "text-white/82 hover:bg-white/[0.05]"}`}
              onClick={() => folder && void selectFolder(folder.id)}
            >
              <Folder size={15} />
              <span className="truncate">{name}</span>
            </button>
          );
        })}
      </nav>

      <SectionTitle title="Labels" />
      <nav className="space-y-1">
        {labels.map(([label, color]) => (
          <button
            key={label}
            className="flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] text-white/82 hover:bg-white/[0.05]"
            onClick={() => label === "Wichtig" && firstAccount ? void selectSpecialView("important", firstAccount.id) : undefined}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-3 rounded-lg px-2.5 py-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#151515] text-sm font-semibold">E</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{firstAccount?.displayName ?? "Emilio"}</span>
          <span className="block truncate text-[11px] text-white/45">{firstAccount?.email ?? "emilio@lunamail.com"}</span>
        </span>
        <ChevronDown size={15} className="text-white/55" />
      </div>
    </aside>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[12px] font-medium text-white/45">
      <span>{title}</span>
      <span className="text-lg leading-none">+</span>
    </div>
  );
}
