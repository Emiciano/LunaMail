import { Search } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";
import type { Email } from "../types";

const PAGE_SIZE = 40;
const categories = ["Relevant", "Sonstiges", "Soziale Netzwerke", "Newsletter"];

export function MailList() {
  const { accounts, emails, selectedEmail, selectedView, query, search, selectEmail, loading, hasSynced, syncError } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    emails: state.emails,
    selectedEmail: state.selectedEmail,
    selectedView: state.selectedView,
    query: state.query,
    search: state.search,
    selectEmail: state.selectEmail,
    loading: state.loading,
    hasSynced: state.hasSynced,
    syncError: state.syncError
  })));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchDraft, setSearchDraft] = useState(query);
  const visibleEmails = useMemo(() => emails.slice(0, visibleCount), [emails, visibleCount]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedView, emails.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search(searchDraft);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  return (
    <section className="flex min-h-0 flex-col bg-[#0B0B0B]">
      <div className="border-b border-white/[0.06] px-4 pb-0 pt-4">
        <label className="flex h-9 items-center gap-3 rounded-lg border border-white/[0.10] bg-[#111] px-3 text-white/45">
          <Search size={15} />
          <input
            id="mail-search-input"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
            placeholder="Suchen..."
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <span className="text-[11px]">⌘K</span>
        </label>
        <div className="mt-6 flex h-10 items-end gap-7 text-[12px] font-medium">
          {categories.map((category, index) => (
            <button
              key={category}
              className={`h-full border-b px-0.5 ${index === 0 ? "border-[rgb(var(--accent))] text-white" : "border-transparent text-white/55 hover:text-white"}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mail-scroll min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.scrollTop + element.clientHeight >= element.scrollHeight - 240 && visibleCount < emails.length) {
            setVisibleCount((count) => Math.min(count + PAGE_SIZE, emails.length));
          }
        }}
      >
        {loading && emails.length === 0 ? <MailListSkeleton /> : null}
        {!loading && emails.length === 0 ? (
          <div className="px-6 py-10 text-[13px] leading-6 text-white/45">
            {accounts.length === 0 ? "Noch kein Konto verbunden" : syncError ? "Synchronisation fehlgeschlagen." : hasSynced ? "Keine E-Mails gefunden" : "Noch nicht synchronisiert"}
          </div>
        ) : null}
        {visibleEmails.map((email) => (
          <MailRow
            key={email.id}
            email={email}
            active={selectedEmail?.id === email.id}
            accountLabel={accountById.get(email.accountId)?.displayName}
            onSelect={selectEmail}
          />
        ))}
      </div>
      <footer className="flex h-9 items-center justify-between border-t border-white/[0.06] px-5 text-[11px] text-white/45">
        <span>{emails.filter((email) => !email.isRead).length} ungelesen</span>
        <span>Neueste zuerst ˅</span>
      </footer>
    </section>
  );
}

const MailRow = memo(function MailRow({
  email,
  active,
  accountLabel,
  onSelect
}: {
  email: Email;
  active: boolean;
  accountLabel?: string;
  onSelect: (email: Email) => Promise<void>;
}) {
  const timeLabel = useMemo(() => formatMailTime(email.receivedAt), [email.receivedAt]);
  const sender = email.sender || accountLabel || "Unbekannter Absender";

  return (
    <button
      className={cn(
        "mail-row grid w-full grid-cols-[14px_1fr_auto] gap-3 border-b border-white/[0.035] px-5 py-4 text-left transition-colors",
        active ? "bg-[rgb(var(--accent)/0.13)]" : "hover:bg-[#111]"
      )}
      onClick={() => void onSelect(email)}
    >
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent))]" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-white">{sender}</span>
        <span className="mt-1 block truncate text-[13px] font-medium text-white">{email.subject || "(Kein Betreff)"}</span>
        <span className="mt-1 block truncate text-[12px] leading-5 text-white/45">{email.preview || "Keine Vorschau verfügbar"}</span>
      </span>
      <span className="text-[11px] font-medium text-white/65">{timeLabel}</span>
    </button>
  );
});

function MailListSkeleton() {
  return (
    <div className="space-y-1 p-4">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="h-[78px] animate-pulse rounded-md bg-white/[0.035]" />
      ))}
    </div>
  );
}

function formatMailTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Gestern";
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
