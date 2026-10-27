import { AlertCircle, CalendarClock, Inbox, RefreshCw, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import type { Email, MailCounts } from "../types";

const UNREAD_PREVIEW_COUNT = 5;

/** Startseite: Begrüßung, wichtigste Zahlen, neueste ungelesene Mails und Kontostatus. */
export function Dashboard() {
  const {
    accounts, folders, mailCounts, healthStatus, lastSyncAt, syncing, databaseSizeBytes,
    sync, selectEmail, openUnifiedInbox, selectSpecialView
  } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    folders: state.folders,
    mailCounts: state.mailCounts,
    healthStatus: state.healthStatus,
    lastSyncAt: state.lastSyncAt,
    syncing: state.syncing,
    databaseSizeBytes: state.databaseSizeBytes,
    sync: state.sync,
    selectEmail: state.selectEmail,
    openUnifiedInbox: state.openUnifiedInbox,
    selectSpecialView: state.selectSpecialView
  })));
  const [counts, setCounts] = useState<MailCounts>(mailCounts);
  const [unreadMails, setUnreadMails] = useState<Email[]>([]);

  // Zahlen und Liste über alle Konten, unabhängig vom zuletzt gewählten Konto.
  useEffect(() => {
    let active = true;
    void Promise.all([
      mailService.getMailCounts(undefined),
      mailService.getEmails(undefined, undefined, "unified_inbox", undefined, { unreadOnly: true })
    ]).then(([nextCounts, emails]) => {
      if (!active) return;
      setCounts(nextCounts);
      setUnreadMails(emails.slice(0, UNREAD_PREVIEW_COUNT));
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accounts.length, folders, lastSyncAt]);

  const unreadByAccount = useMemo(() => {
    const totals = new Map<number, number>();
    for (const folder of folders) totals.set(folder.accountId, (totals.get(folder.accountId) ?? 0) + folder.unreadCount);
    return totals;
  }, [folders]);
  const runtimeByAccount = useMemo(
    () => new Map((healthStatus?.sync.accounts ?? []).map((status) => [status.accountId, status])),
    [healthStatus]
  );
  const firstAccountId = accounts[0]?.id ?? 0;
  const firstName = (accounts.find((account) => account.isDefault) ?? accounts[0])?.displayName.split(" ")[0];
  const accountsWithUnread = [...unreadByAccount.values()].filter((count) => count > 0).length;

  return (
    <section className="mail-scroll flex h-full min-h-0 flex-col gap-6 overflow-y-auto px-6 pb-28 pt-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold text-label-2">{new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 font-display text-[38px] font-extrabold leading-[42px]">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="mt-1.5 text-[15px] text-label-2">
            {accounts.length === 0
              ? "Verbinde in den Einstellungen ein E-Mail-Konto, um loszulegen."
              : counts.unread > 0
                ? `Du hast ${counts.unread} ungelesene ${counts.unread === 1 ? "Mail" : "Mails"}${accountsWithUnread > 1 ? ` in ${accountsWithUnread} Konten` : ""}.`
                : "Alles gelesen. Schönen Feierabend!"}
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-semibold transition hover:bg-surface-2 disabled:opacity-40"
          disabled={accounts.length === 0 || syncing}
          onClick={() => void sync(true)}
        >
          <RefreshCw size={16} className={syncing ? "animate-spin" : undefined} />
          {syncing ? "Synchronisiere …" : "Synchronisieren"}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Ungelesen" value={counts.unread} hint="Anzeigen" icon={<Inbox size={18} />} inverse onClick={() => void openUnifiedInbox()} />
        <StatTile label="Heute" value={counts.today} hint="Neue Mails" icon={<CalendarClock size={18} />} onClick={() => void openUnifiedInbox()} />
        <StatTile label="Favoriten" value={counts.favorites} hint="Anzeigen" icon={<Star size={18} />} onClick={() => void selectSpecialView("favorites", firstAccountId)} />
        <StatTile label="Wichtig" value={counts.important} hint="Anzeigen" icon={<AlertCircle size={18} />} onClick={() => void selectSpecialView("important", firstAccountId)} />
      </div>

      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <section className="w-full min-w-0 rounded-[22px] border border-line p-5 xl:flex-[1.6]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-[20px] font-extrabold">Neu für dich</h2>
            <button className="text-[13px] font-semibold text-label-2 hover:text-ink" onClick={() => void openUnifiedInbox()}>Alle Posteingänge</button>
          </div>
          {unreadMails.length === 0 ? <p className="py-6 text-center text-[14px] text-label-2">Keine ungelesenen Mails.</p> : null}
          {unreadMails.map((email, index) => (
            <button
              key={email.id}
              className={cn("flex w-full items-center gap-3 rounded-[14px] px-2 py-2.5 text-left transition-colors hover:bg-ink/[0.03]", index < unreadMails.length - 1 && "border-b border-line")}
              onClick={() => void selectEmail(email)}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2A2A2A] text-[14px] font-semibold text-white">{initials(senderName(email.sender))}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{senderName(email.sender)}</span>
                  <time className="shrink-0 text-[12px] font-medium text-label-2">{formatShortTime(email.receivedAt)}</time>
                </span>
                <span className="block truncate text-[13px] text-label-2">{email.subject || "(Kein Betreff)"}</span>
              </span>
            </button>
          ))}
        </section>

        <div className="flex w-full min-w-0 flex-col gap-4 xl:flex-1">
          <section className="rounded-[22px] border border-line p-5">
            <h2 className="mb-2 font-display text-[20px] font-extrabold">Konten</h2>
            {accounts.length === 0 ? <p className="py-2 text-[14px] text-label-2">Noch kein Konto verbunden.</p> : null}
            {accounts.map((account) => {
              const runtime = runtimeByAccount.get(account.id);
              const failed = Boolean(runtime?.lastSyncError);
              const status = failed ? "Fehler bei der Synchronisierung" : runtime?.idleActive ? "Verbunden · Push aktiv" : "Verbunden";
              return (
                <div key={account.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2A2A2A] text-[14px] font-semibold text-white">{(account.displayName || account.email).charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{account.email}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-label-2">
                      <span className={cn("h-[7px] w-[7px] rounded-full", failed ? "bg-danger" : "bg-[#16A34A]")} />
                      {status}
                    </span>
                  </span>
                  <span className="min-w-7 rounded-full bg-surface px-2 py-0.5 text-center text-[12px] font-bold">{unreadByAccount.get(account.id) ?? 0}</span>
                </div>
              );
            })}
          </section>
          <section className="rounded-[22px] bg-surface p-5">
            <h2 className="font-display text-[20px] font-extrabold">Diese Woche</h2>
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              <WeekValue label="Empfangen" value={counts.thisWeek} />
              <WeekValue label="Heute" value={counts.today} />
              <WeekValue label="Mit Anhang" value={counts.withAttachments} />
            </div>
            <p className="mt-3.5 text-[12px] text-label-2">
              {lastSyncAt ? `Letzte Synchronisierung ${new Date(lastSyncAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}` : "Noch nicht synchronisiert"} · {formatBytes(databaseSizeBytes)} lokal
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value, hint, icon, inverse = false, onClick }: { label: string; value: number; hint: string; icon: ReactNode; inverse?: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        "flex h-[132px] flex-col justify-between rounded-[22px] px-5 py-[18px] text-left transition hover:-translate-y-0.5",
        inverse ? "bg-ink text-canvas" : "bg-surface text-ink hover:bg-surface-2"
      )}
      onClick={onClick}
    >
      <span className="flex w-full items-center justify-between text-[14px] font-semibold">
        {label}
        {icon}
      </span>
      <span className="flex w-full items-end justify-between">
        <span className="font-display text-[44px] font-extrabold leading-[44px]">{value}</span>
        <span className="text-[12px] font-semibold opacity-70">{hint}</span>
      </span>
    </button>
  );
}

function WeekValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-[24px] font-extrabold">{value}</div>
      <div className="text-[12px] text-label-2">{label}</div>
    </div>
  );
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

function senderName(sender: string) {
  const name = sender.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  return name || sender.match(/<([^>]+)>/)?.[1] || sender || "Unbekannter Absender";
}

function initials(name: string) {
  const parts = name.split(/[\s._-]+/).filter((part) => /\p{L}/u.test(part.charAt(0)));
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || name.charAt(0).toUpperCase() || "?";
}

function formatShortTime(value: string) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
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
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
