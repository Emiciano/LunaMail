import { FileText, Paperclip, PenLine, Send, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { desktopDialog } from "../services/desktop";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { mailService } from "../services/mailService";
import { signatureBlock, useMailStore } from "../stores/mailStore";
import type { Attachment, Draft } from "../types";

const WARN_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function Composer() {
  const { accounts, contacts, composer, drafts, settings, editDraft, closeComposer, sendComposer, saveComposerDraft, deleteComposerDraft, loadDrafts, loadContacts } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    contacts: state.contacts,
    composer: state.composer,
    drafts: state.drafts,
    settings: state.settings,
    editDraft: state.editDraft,
    closeComposer: state.closeComposer,
    sendComposer: state.sendComposer,
    saveComposerDraft: state.saveComposerDraft,
    deleteComposerDraft: state.deleteComposerDraft,
    loadDrafts: state.loadDrafts,
    loadContacts: state.loadContacts
  })));
  const signature = signatureBlock(settings);
  const initialBody = (draft?: Partial<Draft>) => draft?.body ?? (settings.signatureAuto ? signature : "");
  const [draftId, setDraftId] = useState<number | undefined>(composer?.id);
  const [accountId, setAccountId] = useState<number>(composer?.accountId ?? accounts[0]?.id ?? 0);
  const [to, setTo] = useState(composer?.to ?? "");
  const [cc, setCc] = useState(composer?.cc ?? "");
  const [bcc, setBcc] = useState(composer?.bcc ?? "");
  const [showCopies, setShowCopies] = useState(Boolean(composer?.cc || composer?.bcc));
  const [subject, setSubject] = useState(composer?.subject ?? "");
  const [body, setBody] = useState(initialBody(composer));
  const [attachments, setAttachments] = useState<Attachment[]>(composer?.attachments ?? []);
  const [autosaveInfo, setAutosaveInfo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftId(composer?.id);
    setAccountId(composer?.accountId ?? accounts[0]?.id ?? 0);
    setTo(composer?.to ?? "");
    setCc(composer?.cc ?? "");
    setBcc(composer?.bcc ?? "");
    setShowCopies(Boolean(composer?.cc || composer?.bcc));
    setSubject(composer?.subject ?? "");
    setBody(initialBody(composer));
    setAttachments(composer?.attachments ?? []);
    setAutosaveInfo("");
    // Antworten starten im Text, neue Mails im Empfängerfeld.
    window.setTimeout(() => {
      if (composer?.to) {
        bodyRef.current?.focus();
        bodyRef.current?.setSelectionRange(0, 0);
      } else {
        toRef.current?.focus();
      }
    }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer]);

  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((sum, attachment) => sum + (attachment.size || 0), 0),
    [attachments]
  );

  useEffect(() => {
    if (accountId) {
      void loadDrafts(accountId);
    }
    void loadContacts();
  }, [accountId, loadContacts, loadDrafts]);

  const threading = { inReplyTo: composer?.inReplyTo, references: composer?.references };

  useEffect(() => {
    if (!accountId) return;
    const hasContent = [to, cc, bcc, subject].some((value) => value.trim().length > 0) || (body.trim().length > 0 && body !== signature) || attachments.length > 0;
    if (!hasContent) return;
    const timer = window.setTimeout(() => {
      const payload: Draft = { id: draftId, accountId, to, cc, bcc, subject, body, attachments, ...threading };
      void saveComposerDraft(payload)
        .then((id) => {
          setDraftId(id);
          setAutosaveInfo(`Entwurf gespeichert · ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`);
        })
        .catch((saveError) => setError(String(saveError)));
    }, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, attachments, bcc, body, cc, draftId, saveComposerDraft, subject, to]);

  async function attachFile() {
    const selected = await desktopDialog.open({ multiple: true });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    const nextFiles: Attachment[] = [];
    for (const [index, path] of paths.entries()) {
      const stringPath = String(path);
      let size = 0;
      try {
        size = await mailService.getFileSize(stringPath);
      } catch {
        size = 0;
      }
      nextFiles.push({
        id: Date.now() + index,
        fileName: stringPath.split(/[\\/]/).pop() ?? "Anhang",
        contentType: contentTypeForPath(stringPath),
        size,
        path: stringPath
      });
    }
    setAttachments((current) => [...current, ...nextFiles]);
  }

  function insertSignature() {
    if (!signature || body.includes(signature.trim())) return;
    const quoteStart = body.search(/\n\nAm .+ schrieb .+:\n>|\n-{5,} Weitergeleitete Nachricht/);
    setBody(quoteStart >= 0 ? `${body.slice(0, quoteStart)}${signature}${body.slice(quoteStart)}` : `${body.replace(/\s+$/, "")}${signature}`);
  }

  async function onSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (sending) return;
    if (!to.trim()) {
      setError("Bitte gib mindestens einen Empfänger an.");
      toRef.current?.focus();
      return;
    }
    if (totalAttachmentBytes >= WARN_ATTACHMENT_BYTES) {
      const proceed = window.confirm("Die Anhänge sind größer als 20 MB. Trotzdem senden?");
      if (!proceed) return;
    }
    const payload: Draft = { id: draftId, accountId, to, cc, bcc, subject, body, attachments, ...threading };
    setSending(true);
    setError("");
    try {
      await sendComposer(payload);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  }

  const title = subject.trim() || (threading.inReplyTo ? "Antwort" : "Neue Nachricht");

  return (
    <div
      className="overlay-enter fixed inset-0 z-[2147483647] flex items-center justify-center bg-scrim/40 p-3 backdrop-blur-sm sm:p-6"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeComposer();
        }
      }}
    >
      <form
        ref={formRef}
        onSubmit={(event) => void onSubmit(event)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void onSubmit();
          }
        }}
        className="dialog-enter flex h-[min(780px,calc(100vh-3rem))] w-[min(1000px,calc(100vw-3rem))] overflow-hidden rounded-[14px] border border-line bg-canvas shadow-[0_32px_90px_rgb(0_0_0/0.35)]"
      >
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-sidebar md:flex">
          <div className="flex h-16 items-center px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-label-3">Entwürfe</div>
          <div className="mail-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {drafts.length === 0 ? (
              <div className="flex flex-col items-center px-3 py-10 text-center text-[13px] text-label-2">
                <FileText size={18} className="mb-2 text-label-3" />
                Keine Entwürfe
              </div>
            ) : null}
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className={cn("group relative rounded-[10px] px-3 py-2.5 transition-colors", draft.id === draftId ? "bg-canvas shadow-[0_0_0_1px_rgb(var(--line))]" : "hover:bg-ink/[0.04]")}
              >
                <button type="button" className="w-full pr-6 text-left" onClick={() => editDraft(draft)}>
                  <div className="truncate text-[13px] font-semibold">{draft.subject || "(Kein Betreff)"}</div>
                  <div className="truncate text-[12px] text-label-2">{draft.to || "Kein Empfänger"}</div>
                  {draft.updatedAt ? <div className="mt-0.5 text-[11px] tabular-nums text-label-3">{formatDraftTime(draft.updatedAt)}</div> : null}
                </button>
                <button
                  type="button"
                  title="Entwurf löschen"
                  aria-label="Entwurf löschen"
                  className="absolute right-1.5 top-2 hidden rounded-[6px] p-1 text-label-3 hover:bg-danger/10 hover:text-danger group-hover:block"
                  onClick={() => {
                    if (!draft.id) return;
                    void deleteComposerDraft(draft.id);
                    if (draft.id === draftId) closeComposer();
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-5 sm:px-6">
            <div className="min-w-0">
              <h2 className="truncate font-display text-[18px] font-extrabold">{title}</h2>
              <p className="text-[12px] text-label-3">{autosaveInfo || "Wird automatisch als Entwurf gespeichert"}</p>
            </div>
            <button type="button" className="reader-icon-button" onClick={closeComposer} title="Schließen (Esc)">
              <X size={18} />
            </button>
          </header>
          <div className="shrink-0 border-b border-line px-5 text-[14px] sm:px-6">
            <label className="flex h-11 items-center gap-3 border-b border-line">
              <span className="w-16 shrink-0 text-label-2">Von</span>
              <select value={accountId} onChange={(event) => setAccountId(Number(event.target.value))} className="h-full min-w-0 flex-1 bg-transparent font-medium text-ink outline-none focus-visible:outline-none">
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.displayName && account.displayName !== account.email ? `${account.displayName} <${account.email}>` : account.email}</option>
                ))}
              </select>
            </label>
            <LineInput label="An" value={to} onChange={setTo} inputRef={toRef} trailing={showCopies ? undefined : (
              <button type="button" className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-semibold text-label-2 hover:bg-surface hover:text-ink" onClick={() => setShowCopies(true)}>
                Cc/Bcc
              </button>
            )} />
            {showCopies ? (
              <>
                <LineInput label="Cc" value={cc} onChange={setCc} />
                <LineInput label="Bcc" value={bcc} onChange={setBcc} />
              </>
            ) : null}
            <label className="flex h-12 items-center gap-3">
              <span className="w-16 shrink-0 text-label-2">Betreff</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-ink outline-none focus-visible:outline-none" />
            </label>
          </div>
          <datalist id="contact-suggestions">
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.name ? `${contact.name} <${contact.email}>` : contact.email}>
                {contact.email}
              </option>
            ))}
          </datalist>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Schreibe deine Nachricht …"
            className="mail-scroll min-h-0 flex-1 resize-none bg-transparent px-5 py-5 text-[15px] leading-7 text-ink outline-none focus-visible:outline-none placeholder:text-label-3 sm:px-6"
          />
          {error ? <div className="mx-5 mb-3 rounded-[10px] bg-danger/10 px-4 py-2.5 text-[13px] font-medium text-danger sm:mx-6">{error}</div> : null}
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-5 pb-3 sm:px-6">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex max-w-[260px] items-center gap-2.5 rounded-[10px] bg-surface py-1.5 pl-2 pr-1.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-canvas text-[10px] font-extrabold uppercase text-ink/70">
                    {attachment.fileName.split(".").pop()?.slice(0, 4) || <Paperclip size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{attachment.fileName}</div>
                    <div className="text-[11px] text-label-2">{formatBytes(attachment.size || 0)}</div>
                  </div>
                  <button type="button" className="rounded-[6px] p-1 text-label-3 hover:bg-surface-2 hover:text-ink" title="Entfernen" onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              {totalAttachmentBytes >= WARN_ATTACHMENT_BYTES ? (
                <div className="flex items-center rounded-[10px] px-2 text-[12px] font-medium text-flag">Groß: {formatBytes(totalAttachmentBytes)}</div>
              ) : null}
            </div>
          ) : null}
          <footer className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void attachFile()} className="inline-flex h-9 items-center gap-2 rounded-[8px] px-3 text-[13px] font-semibold text-label-2 hover:bg-surface hover:text-ink">
                <Paperclip size={16} /> Anhang
              </button>
              <button
                type="button"
                disabled={!signature}
                title={signature ? "Signatur einfügen" : "Lege deine Signatur unter Einstellungen → Allgemein fest"}
                className="inline-flex h-9 items-center gap-2 rounded-[8px] px-3 text-[13px] font-semibold text-label-2 hover:bg-surface hover:text-ink disabled:opacity-40"
                onClick={insertSignature}
              >
                <PenLine size={16} /> Signatur
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-[12px] text-label-3 sm:inline">Strg + Enter</span>
              <button disabled={sending || accounts.length === 0} className="accent-primary pressable inline-flex h-10 items-center gap-2 rounded-[10px] px-5 text-[14px] font-bold disabled:opacity-50">
                <Send size={16} />
                {sending ? "Sendet …" : "Senden"}
              </button>
            </div>
          </footer>
        </div>
      </form>
    </div>
  );
}

function LineInput(props: { label: string; value: string; onChange: (value: string) => void; inputRef?: React.Ref<HTMLInputElement>; trailing?: React.ReactNode }) {
  return (
    <label className="flex h-11 items-center gap-3 border-b border-line">
      <span className="w-16 shrink-0 text-label-2">{props.label}</span>
      <input
        ref={props.inputRef}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        list="contact-suggestions"
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none focus-visible:outline-none"
      />
      {props.trailing}
    </label>
  );
}

function formatDraftTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
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

function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (["pdf"].includes(ext)) return "application/pdf";
  if (["txt", "md", "log"].includes(ext)) return "text/plain";
  if (["zip"].includes(ext)) return "application/zip";
  return "application/octet-stream";
}
