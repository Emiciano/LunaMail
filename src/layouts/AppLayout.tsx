import { MailPlus, Minus, Square, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { MailList } from "../components/MailList";
import { MailReader } from "../components/MailReader";
import { MailSidebar } from "../components/MailSidebar";
import { isDesktop } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";

export function AppLayout() {
  const { accounts, openComposer } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    openComposer: state.openComposer
  })));
  const hasAccounts = accounts.length > 0;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0B0B0B] px-2 pb-2 pt-1 text-white">
      <header className="titlebar-drag flex h-7 shrink-0 items-start justify-end">
        <div className="titlebar-no-drag flex h-6 items-center gap-1 overflow-hidden rounded-bl-xl border-b border-l border-white/[0.06] bg-[#111111] px-1">
          {isDesktop ? (
            <>
              <button className="inline-flex h-5 w-8 items-center justify-center rounded-md text-white/50 hover:bg-white/[0.08] hover:text-white" onClick={() => void window.electronAPI?.window.minimize()} title="Minimieren">
                <Minus size={12} />
              </button>
              <button className="inline-flex h-5 w-8 items-center justify-center rounded-md text-white/50 hover:bg-white/[0.08] hover:text-white" onClick={() => void window.electronAPI?.window.toggleMaximize()} title="Maximieren">
                <Square size={10} />
              </button>
              <button className="inline-flex h-5 w-8 items-center justify-center rounded-md text-white/50 hover:bg-red-500 hover:text-white" onClick={() => void mailService.requestClose()} title="Schließen">
                <X size={12} />
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className="tr-shell grid min-h-0 flex-1 grid-cols-[292px_minmax(0,1fr)] overflow-hidden rounded-[12px] bg-[#111111]">
        <MailSidebar />
        <MailList />
      </section>
      <MailReader />

      <button
        className="accent-primary absolute bottom-5 right-5 z-30 inline-flex h-12 items-center gap-3 rounded-lg px-4 text-sm font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!hasAccounts}
        onClick={() => openComposer()}
      >
        <MailPlus size={18} />
        Neue Nachricht
      </button>
    </div>
  );
}
