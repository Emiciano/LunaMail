import { CalendarDays, FileText, MailPlus, Minus, Settings, Square, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AccountManager } from "../components/AccountManager";
import { CalendarView } from "../components/CalendarView";
import { MailList } from "../components/MailList";
import { MailReader } from "../components/MailReader";
import { MailSidebar } from "../components/MailSidebar";
import { isDesktop } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";

export function AppLayout() {
  const { accounts, openComposer, openSettings } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    openComposer: state.openComposer,
    openSettings: state.openSettings
  })));
  const hasAccounts = accounts.length > 0;

  return (
    <div className="h-full overflow-hidden bg-[#0B0B0B] px-8 py-5 text-white">
      <header className="titlebar-drag flex h-10 items-center justify-end">
        <div className="titlebar-no-drag flex items-center gap-2">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] bg-[#151515] text-white/70 hover:bg-[#1B1B1B]"
            onClick={openSettings}
            title="Einstellungen"
          >
            <Settings size={16} />
          </button>
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

      <section className="tr-shell grid h-[calc(100%-64px)] min-h-[520px] grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-[10px] 2xl:h-[calc(100%-314px)]">
        <MailSidebar />
        <MailList />
      </section>
      <MailReader />

      <section className="mt-6 hidden h-[250px] grid-cols-4 gap-6 2xl:grid">
        <PreviewComposer onCompose={() => openComposer()} disabled={!hasAccounts} />
        <CalendarView />
        <SettingsPreview onOpenSettings={openSettings} />
        <AccountManager />
      </section>

      <button
        className="fixed bottom-8 right-8 z-30 inline-flex h-12 items-center gap-3 rounded-lg bg-white px-4 text-sm font-semibold text-[#0B0B0B] hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40 2xl:hidden"
        disabled={!hasAccounts}
        onClick={() => openComposer()}
      >
        <MailPlus size={18} />
        Neue Nachricht
      </button>
    </div>
  );
}

function PreviewComposer({ onCompose, disabled }: { onCompose: () => void; disabled: boolean }) {
  return (
    <article className="tr-panel flex min-w-0 flex-col rounded-[8px] p-4">
      <h2 className="mb-3 text-sm font-semibold">Neue Nachricht</h2>
      <div className="space-y-3 text-[11px] text-white/55">
        <div className="grid grid-cols-[34px_1fr] border-b border-white/[0.06] pb-2">
          <span>An</span>
          <span className="text-white">Lena Müller &lt;lena@culturecartel.com&gt;</span>
        </div>
        <div className="grid grid-cols-[34px_1fr] border-b border-white/[0.06] pb-2">
          <span>Betreff</span>
          <span className="text-white">Projekt Update</span>
        </div>
        <p className="leading-6 text-white/80">Hi Lena,<br />vielen Dank für das Update! Lass uns nächste Woche das Design Review planen.</p>
      </div>
      <div className="mt-auto flex items-center justify-between">
        <div className="flex gap-3 text-white/45">
          <FileText size={14} />
          <CalendarDays size={14} />
        </div>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0B0B0B] disabled:opacity-40"
          disabled={disabled}
          onClick={onCompose}
          title="Neue Nachricht"
        >
          <MailPlus size={15} />
        </button>
      </div>
    </article>
  );
}

function SettingsPreview({ onOpenSettings }: { onOpenSettings: () => void }) {
  const rows = ["Allgemein", "Konten", "Sicherheit", "Signaturen", "Filter & Regeln", "Darstellung"];
  return (
    <article className="tr-panel grid min-w-0 grid-cols-[150px_1fr] overflow-hidden rounded-[8px]">
      <nav className="border-r border-white/[0.06] p-3">
        {rows.map((row, index) => (
          <button
            key={row}
            className={`mb-1 flex h-8 w-full items-center rounded-md px-3 text-left text-[11px] ${index === 0 ? "bg-white/[0.06] text-white" : "text-white/55 hover:bg-white/[0.04]"}`}
            onClick={onOpenSettings}
          >
            {row}
          </button>
        ))}
      </nav>
      <div className="p-4">
        <h2 className="mb-5 text-sm font-semibold">Einstellungen</h2>
        {["Sprache", "Zeitzone", "Nachrichten pro Seite", "Standard Ansicht"].map((row) => (
          <div key={row} className="mb-4 flex items-center justify-between text-[11px]">
            <span className="text-white/55">{row}</span>
            <span>Deutsch</span>
          </div>
        ))}
        <div className="mt-5 space-y-3">
          {["Lesebestätigungen", "Vorschau anzeigen", "Intelligente Sortierung"].map((row) => (
            <div key={row} className="flex items-center justify-between text-[11px]">
              <span className="text-white/55">{row}</span>
              <span className="h-5 w-9 rounded-full bg-white p-0.5"><span className="ml-auto block h-4 w-4 rounded-full bg-[#0B0B0B]" /></span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
