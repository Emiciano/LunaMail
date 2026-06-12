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
    <div className="relative h-full overflow-hidden bg-[#050505] text-white">
      {isDesktop ? (
        <div className="titlebar-drag absolute right-0 top-0 z-50 flex h-8 items-center gap-1 overflow-hidden rounded-bl-2xl border-b border-l border-[#1F1F1F] bg-[#050505] px-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
          <button className="titlebar-no-drag inline-flex h-6 w-8 items-center justify-center rounded-lg text-white/48 transition-colors hover:bg-white/[0.08] hover:text-white" onClick={() => void window.electronAPI?.window.minimize()} title="Minimieren">
            <Minus size={12} />
          </button>
          <button className="titlebar-no-drag inline-flex h-6 w-8 items-center justify-center rounded-lg text-white/48 transition-colors hover:bg-white/[0.08] hover:text-white" onClick={() => void window.electronAPI?.window.toggleMaximize()} title="Maximieren">
            <Square size={10} />
          </button>
          <button className="titlebar-no-drag inline-flex h-6 w-8 items-center justify-center rounded-lg text-white/48 transition-colors hover:bg-red-500 hover:text-white" onClick={() => void mailService.requestClose()} title="Schliessen">
            <X size={12} />
          </button>
        </div>
      ) : null}

      <section className="tr-shell grid h-full min-h-0 grid-cols-[292px_minmax(0,1fr)] overflow-hidden bg-[#0D0D0D]">
        <MailSidebar />
        <MailList />
      </section>
      <MailReader />

      <button
        className="accent-primary absolute bottom-4 right-4 z-30 inline-flex h-12 items-center gap-3 rounded-lg px-4 text-sm font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!hasAccounts}
        onClick={() => openComposer()}
      >
        <MailPlus size={18} />
        Neue Nachricht
      </button>
    </div>
  );
}
