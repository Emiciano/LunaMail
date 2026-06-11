import { Plus, Server } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useMailStore } from "../stores/mailStore";

export function AccountManager() {
  const { accounts, openSettings } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    openSettings: state.openSettings
  })));
  const visibleAccounts = accounts.length ? accounts.slice(0, 3) : [
    { id: -1, email: "emilio@lunamail.com", provider: "IMAP" },
    { id: -2, email: "info@culturecartel.com", provider: "IMAP" },
    { id: -3, email: "support@lunaproject.com", provider: "IMAP" }
  ];

  return (
    <article className="tr-panel min-w-0 rounded-[8px] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Konten</h2>
        <button className="text-white/65 hover:text-white" onClick={openSettings} title="Konto hinzufügen">
          <Plus size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {visibleAccounts.map((account) => (
          <button
            key={account.id}
            className="flex h-11 w-full items-center gap-3 rounded-md bg-[#151515] px-3 text-left hover:bg-[#1B1B1B]"
            onClick={openSettings}
          >
            <Server size={15} className="text-white/75" />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold">{account.email}</span>
              <span className="block text-[10px] uppercase text-white/45">{account.provider || "IMAP"}</span>
            </span>
          </button>
        ))}
      </div>
      <button className="mt-4 flex h-9 items-center gap-3 rounded-md px-3 text-[12px] text-white/65 hover:bg-white/[0.05]" onClick={openSettings}>
        <Plus size={14} />
        Konto hinzufügen
      </button>
    </article>
  );
}
