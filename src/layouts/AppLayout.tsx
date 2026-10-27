import { Minus, Square, SquarePen, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Dashboard } from "../components/Dashboard";
import { MailList } from "../components/MailList";
import { MailReader } from "../components/MailReader";
import { MailSidebar } from "../components/MailSidebar";
import { SystemStatus } from "../components/SystemStatus";
import { isDesktop } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";

export function AppLayout() {
  const { accounts, selectedView, viewKey, openComposer } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    selectedView: state.selectedView,
    viewKey: [state.selectedView, state.selectedFolderId, state.selectedSpecialAccountId, state.selectedCategoryId].join(":"),
    openComposer: state.openComposer
  })));
  const hasAccounts = accounts.length > 0;

  return (
    <div className="relative h-full overflow-hidden bg-canvas text-ink">
      {isDesktop ? <div className="titlebar-drag absolute left-[260px] right-32 top-0 z-40 h-10" /> : null}
      {isDesktop ? (
        <div className="titlebar-drag absolute right-[18px] top-[18px] z-[70] flex items-center gap-0.5">
          <button className="titlebar-no-drag inline-flex h-7 w-9 items-center justify-center rounded-lg text-label-2 transition-colors hover:bg-surface hover:text-ink" onClick={() => void window.electronAPI?.window.minimize()} title="Minimieren">
            <Minus size={13} />
          </button>
          <button className="titlebar-no-drag inline-flex h-7 w-9 items-center justify-center rounded-lg text-label-2 transition-colors hover:bg-surface hover:text-ink" onClick={() => void window.electronAPI?.window.toggleMaximize()} title="Maximieren">
            <Square size={11} />
          </button>
          <button className="titlebar-no-drag inline-flex h-7 w-9 items-center justify-center rounded-lg text-label-2 transition-colors hover:bg-red-500 hover:text-white" onClick={() => void mailService.requestClose()} title="Schließen">
            <X size={13} />
          </button>
        </div>
      ) : null}

      <section className="tr-shell flex h-full min-h-0 overflow-hidden bg-sidebar">
        <MailSidebar />
        <div className="app-workspace relative flex min-w-0 flex-1 overflow-hidden bg-canvas lg:my-2.5 lg:mr-2.5 lg:rounded-[22px] lg:border lg:border-line lg:shadow-[0_8px_30px_rgb(0_0_0/0.06)]">
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div key={viewKey} className="view-enter h-full">
              {selectedView === "dashboard" ? <Dashboard /> : selectedView === "health" ? <SystemStatus /> : <MailList />}
            </div>
          </div>
          <MailReader />
          <button
            className="pressable accent-primary compose-fab absolute bottom-6 left-6 z-30 inline-flex h-12 items-center gap-2.5 rounded-full px-5 text-[14px] font-bold shadow-float transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!hasAccounts}
            onClick={() => openComposer()}
          >
            <SquarePen size={18} />
            Neue Nachricht
          </button>
        </div>
      </section>
    </div>
  );
}
