import { MailPlus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { MailSidebar } from "../components/MailSidebar";
import { Toolbar } from "../components/Toolbar";
import { MailList } from "../components/MailList";
import { MailReader } from "../components/MailReader";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";

export function AppLayout() {
  const { accounts, settings, openComposer } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    settings: state.settings,
    openComposer: state.openComposer
  })));
  const hasAccounts = accounts.length > 0;
  const compact = settings.layoutMode === "compact";
  const comfortable = settings.layoutMode === "comfortable";

  return (
    <div className={cn("relative flex h-full flex-col", compact ? "p-3" : comfortable ? "p-5" : "p-4")}>
      <div className="mb-3">
        <Toolbar />
      </div>
      <div className={cn("glass-panel grid min-h-0 flex-1 gap-2 overflow-hidden rounded-[22px] motion-soft", compact ? "grid-cols-[268px_minmax(0,1fr)] p-2.5" : comfortable ? "grid-cols-[340px_minmax(0,1fr)] p-4" : "grid-cols-[318px_minmax(0,1fr)] p-3")}>
        <MailSidebar />
        <MailList />
      </div>
      <MailReader />
      <button
        className={cn(
          "absolute bottom-9 right-7 z-30 inline-flex h-14 items-center gap-3 rounded-2xl bg-[rgb(var(--accent))] px-5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-[rgb(var(--accent)/0.92)] active:scale-[0.98] motion-reduce:transition-none",
          !hasAccounts && "cursor-not-allowed opacity-45"
        )}
        disabled={!hasAccounts}
        onClick={() => openComposer()}
        title="Neue Mail"
      >
        <MailPlus size={20} />
        <span>Neue Mail</span>
      </button>
    </div>
  );
}
