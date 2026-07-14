import { MailPlus, Minus, Square, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { MailList } from "../components/MailList";
import { MailReader } from "../components/MailReader";
import { MailSidebar } from "../components/MailSidebar";
import { isDesktop } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";

export function AppLayout() {
  const { accounts, selectedView, openComposer } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    selectedView: state.selectedView,
    openComposer: state.openComposer
  })));
  const hasAccounts = accounts.length > 0;

  return (
    <div className="relative h-full overflow-hidden bg-black text-white">
      {isDesktop ? <div className="titlebar-drag absolute left-[292px] right-32 top-0 z-40 h-10" /> : null}
      {isDesktop ? (
        <div className="titlebar-drag absolute right-0 top-0 z-50 flex h-8 items-center gap-1 overflow-hidden rounded-bl-2xl border-b border-l border-[#1F1F1F] bg-black px-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
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

      <section className="tr-shell flex h-full min-h-0 overflow-hidden bg-black lg:p-3">
        <MailSidebar />
        <div className="app-workspace relative flex min-w-0 flex-1 overflow-hidden bg-[#080808] lg:rounded-[22px] lg:border lg:border-white/[0.08] lg:shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
          <div className={`relative min-w-0 flex-1 overflow-hidden ${selectedView === "dashboard" || selectedView === "health" ? "workspace-overview-pane" : "mail-list-pane"}`}>
            <MailList />
          </div>
          <MailReader />
          <button
            className="accent-primary compose-fab absolute bottom-6 left-6 z-30 inline-flex h-11 items-center gap-2.5 rounded-xl px-4 text-sm font-semibold shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!hasAccounts}
            onClick={() => openComposer()}
          >
            <MailPlus size={18} />
            Neue Nachricht
          </button>
        </div>
      </section>
    </div>
  );
}
