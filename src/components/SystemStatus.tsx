import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";

/** Systemstatus: Gesamtzustand, Kennzahlen, Sync je Konto, Warteschlange und Datenintegrität. */
export function SystemStatus() {
  const { accounts, healthStatus, databaseSizeBytes, openHealth } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    healthStatus: state.healthStatus,
    databaseSizeBytes: state.databaseSizeBytes,
    openHealth: state.openHealth
  })));
  const [checkedAt, setCheckedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const runtimeByAccount = new Map((healthStatus?.sync.accounts ?? []).map((status) => [status.accountId, status]));
  const queue = healthStatus?.queue ?? { pending: 0, failed: 0, inFlight: 0 };
  const integrity = healthStatus?.integrity ?? { duplicateMessageIds: 0, orphanAttachments: 0, accountFolderMismatches: 0 };
  const failingAccounts = accounts.filter((account) => runtimeByAccount.get(account.id)?.lastSyncError).length;
  const integrityIssues = integrity.duplicateMessageIds + integrity.orphanAttachments + (integrity.accountFolderMismatches ?? 0);
  const keyringMissing = healthStatus ? !healthStatus.keyringAvailable : false;

  const problems = [
    failingAccounts > 0 ? `${failingAccounts} ${failingAccounts === 1 ? "Konto" : "Konten"} mit Sync-Fehler` : undefined,
    queue.failed > 0 ? `${queue.failed} fehlgeschlagene Aufträge` : undefined,
    integrityIssues > 0 ? `${integrityIssues} Integritätsprobleme` : undefined,
    keyringMissing ? "Schlüsselbund nicht verfügbar" : undefined
  ].filter((problem): problem is string => Boolean(problem));
  const healthy = problems.length === 0;
  const summary = healthy
    ? [
        `${accounts.length} ${accounts.length === 1 ? "Konto" : "Konten"} verbunden`,
        "keine Fehler",
        queue.pending + queue.inFlight > 0 ? `${queue.pending + queue.inFlight} Aufträge in Arbeit` : "Warteschlange leer"
      ].join(" · ")
    : problems.join(" · ");

  async function refresh() {
    setRefreshing(true);
    try {
      await openHealth();
      setCheckedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="mail-scroll flex h-full min-h-0 flex-col gap-6 overflow-y-auto px-6 pb-28 pt-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[38px] font-extrabold leading-[42px]">Systemstatus</h1>
          <p className="mt-1.5 text-[15px] text-label-2">Synchronisierung, Warteschlange und lokale Datenbank.</p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-semibold transition hover:bg-surface-2 disabled:opacity-40"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
          Neu prüfen
        </button>
      </header>

      <div className="flex items-center gap-4 rounded-[22px] bg-ink px-6 py-5 text-canvas">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white", healthy ? "bg-[#16A34A]" : "bg-[#D97706]")}>
          {healthy ? <Check size={22} strokeWidth={2.5} /> : <AlertTriangle size={20} strokeWidth={2.5} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[22px] font-extrabold">{healthy ? "Alles in Ordnung" : "Bitte prüfen"}</div>
          <div className="mt-0.5 text-[14px] opacity-70">{summary}</div>
        </div>
        <span className="hidden text-[13px] font-semibold opacity-70 sm:block">
          Geprüft um {checkedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile label="Mails" value={(healthStatus?.totalMails ?? 0).toLocaleString("de-DE")} />
        <Tile label="Anhänge" value={(healthStatus?.totalAttachments ?? 0).toLocaleString("de-DE")} />
        <Tile label="Datenbank" value={formatBytes(healthStatus?.databaseSizeBytes ?? databaseSizeBytes)} />
        <Tile label="Schlüsselbund" value={keyringMissing ? "Nicht verfügbar" : "Geschützt"} warn={keyringMissing} />
      </div>

      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <section className="w-full min-w-0 rounded-[22px] border border-line p-5 xl:flex-[1.6]">
          <h2 className="mb-1 font-display text-[20px] font-extrabold">Synchronisierung</h2>
          {accounts.length === 0 ? <p className="py-4 text-[14px] text-label-2">Noch kein Konto verbunden.</p> : null}
          {accounts.map((account, index) => {
            const runtime = runtimeByAccount.get(account.id);
            const error = runtime?.lastSyncError;
            const mode = runtime?.idleActive
              ? "Push aktiv"
              : runtime?.pollingActive
                ? `Abruf alle ${formatInterval(runtime.pollingIntervalSeconds)}`
                : "Wartet auf Synchronisierung";
            return (
              <div key={account.id} className={cn("flex items-center gap-3 py-3.5", index < accounts.length - 1 && "border-b border-line")}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2A2A2A] text-[14px] font-semibold text-white">
                  {(account.displayName || account.email).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{account.email}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-label-2">
                    <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", error ? "bg-danger" : "bg-[#16A34A]")} />
                    <span className="truncate">{error ? `Fehler: ${error}` : mode}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-semibold">{runtime?.lastSyncAt ? formatSyncTime(runtime.lastSyncAt) : "Noch nicht"}</span>
                  <span className="block text-[12px] text-label-2">
                    {runtime?.lastSyncDurationMs !== undefined ? `${(runtime.lastSyncDurationMs / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s` : "–"}
                  </span>
                </span>
              </div>
            );
          })}
        </section>

        <div className="flex w-full min-w-0 flex-col gap-4 xl:flex-1">
          <section className="rounded-[22px] border border-line p-5">
            <h2 className="font-display text-[20px] font-extrabold">Warteschlange</h2>
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              <Value label="Wartend" value={queue.pending} />
              <Value label="In Arbeit" value={queue.inFlight} />
              <Value label="Fehlgeschlagen" value={queue.failed} warn={queue.failed > 0} />
            </div>
          </section>
          <section className="rounded-[22px] bg-surface p-5">
            <h2 className="mb-1.5 font-display text-[20px] font-extrabold">Datenintegrität</h2>
            <IntegrityRow label="Doppelte Mails" value={integrity.duplicateMessageIds} />
            <IntegrityRow label="Verwaiste Anhänge" value={integrity.orphanAttachments} />
            <IntegrityRow label="Ordnerkonflikte" value={integrity.accountFolderMismatches ?? 0} />
          </section>
        </div>
      </div>
    </section>
  );
}

function Tile({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex h-[112px] flex-col justify-between rounded-[22px] bg-surface px-5 py-[18px]">
      <span className="text-[14px] font-semibold text-label-2">{label}</span>
      <span className={cn("truncate font-display text-[32px] font-extrabold leading-9", warn && "text-danger")}>{value}</span>
    </div>
  );
}

function Value({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div className={cn("font-display text-[24px] font-extrabold", warn && "text-danger")}>{value}</div>
      <div className="text-[12px] text-label-2">{label}</div>
    </div>
  );
}

function IntegrityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5 py-[7px] text-[14px]">
      {value === 0
        ? <Check size={16} strokeWidth={2.5} className="text-[#16A34A]" />
        : <AlertTriangle size={16} strokeWidth={2.5} className="text-[#D97706]" />}
      <span className="flex-1">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function formatInterval(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} Min.`;
}

function formatSyncTime(value: string) {
  const date = new Date(value);
  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? `Heute, ${time}` : `${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

function formatBytes(value: number): string {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toLocaleString("de-DE", { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}
