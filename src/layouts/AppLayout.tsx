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
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0B0B0B] p-2 text-white">
      <header className="titlebar-drag flex h-10 shrink-0 items-center justify-end">
        <div className="titlebar-no-drag flex items-center gap-2">
          {isDesktop ? (
            <>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/55 hover:bg-white/[0.06]" onClick={() => void window.electronAPI?.window.minimize()} title="Minimieren">
                <Minus size={14} />
              </button>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/55 hover:bg-white/[0.06]" onClick={() => void window.electronAPI?.window.toggleMaximize()} title="Maximieren">
                <Square size={12} />
              </button>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/55 hover:bg-white/[0.06]" onClick={() => void mailService.requestClose()} title="Schließen">
                <X size={14} />
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className="tr-shell grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-[10px]">
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
