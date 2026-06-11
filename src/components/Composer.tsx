import { Paperclip, Send, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { desktopDialog } from "../services/desktop";
import { useShallow } from "zustand/react/shallow";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import type { Attachment, Draft } from "../types";

const WARN_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const DEFAULT_SIGNATURE = "\n\n--\nGesendet mit LunaMail";

export function Composer() {
  const { accounts, contacts, composer, drafts, editDraft, closeComposer, sendComposer, saveComposerDraft, deleteComposerDraft, loadDrafts, loadContacts } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    contacts: state.contacts,
    composer: state.composer,
    drafts: state.drafts,
    editDraft: state.editDraft,
    closeComposer: state.closeComposer,
    sendComposer: state.sendComposer,
    saveComposerDraft: state.saveComposerDraft,
    deleteComposerDraft: state.deleteComposerDraft,
    loadDrafts: state.loadDrafts,
    loadContacts: state.loadContacts
  })));
  const [draftId, setDraftId] = useState<number | undefined>(composer?.id);
  const [accountId, setAccountId] = useState<number>(composer?.accountId ?? accounts[0]?.id ?? 0);
  const [to, setTo] = useState(composer?.to ?? "");
  const [cc, setCc] = useState(composer?.cc ?? "");
  const [bcc, setBcc] = useState(composer?.bcc ?? "");
  const [subject, setSubject] = useState(composer?.subject ?? "");
  const [body, setBody] = useState(composer?.body ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(composer?.attachments ?? []);
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const [autosaveInfo, setAutosaveInfo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraftId(composer?.id);
    setAccountId(composer?.accountId ?? accounts[0]?.id ?? 0);
    setTo(composer?.to ?? "");
    setCc(composer?.cc ?? "");
    setBcc(composer?.bcc ?? "");
    setSubject(composer?.subject ?? "");
    setBody(composer?.body ?? "");
    setAttachments(composer?.attachments ?? []);
    setAutosaveInfo("");
  }, [accounts, composer]);

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

  useEffect(() => {
    if (!accountId) return;
    const hasContent = [to, cc, bcc, subject, body].some((value) => value.trim().length > 0) || attachments.length > 0;
    if (!hasContent) return;
    const timer = window.setTimeout(() => {
      const payload: Draft = {
        id: draftId,
        accountId,
        to,
        cc,
        bcc,
        subject,
        body,
        attachments
      };
      void saveComposerDraft(payload)
        .then((id) => {
          setDraftId(id);
          setAutosaveInfo("Entwurf gespeichert");
        })
        .catch((saveError) => setError(String(saveError)));
    }, 1200);
    return () => window.clearTimeout(timer);
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasLargeAttachment = totalAttachmentBytes >= WARN_ATTACHMENT_BYTES;
    if (hasLargeAttachment) {
      const proceed = window.confirm("Die Anhänge sind größer als 20 MB. Trotzdem senden?");
      if (!proceed) return;
    }
    const payload: Draft = {
      id: draftId,
      accountId,
      to,
      cc,
      bcc,
      subject,
      body: signatureEnabled && !body.includes(DEFAULT_SIGNATURE) ? `${body}${DEFAULT_SIGNATURE}` : body,
      attachments
    };
    setSending(true);
    setError("");
    try {
      await sendComposer(payload);
    } catch (sendError) {
      setError(String(sendError));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-end justify-end bg-black/70 p-6">
      <form onSubmit={onSubmit} className="tr-panel flex h-[720px] w-[880px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[10px]">
        <aside className="w-64 border-r border-white/[0.06] bg-[#0B0B0B] p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">Entwürfe</div>
          <div className="mail-scroll max-h-[640px] space-y-2 overflow-y-auto">
            {drafts.length === 0 ? (
              <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/45">
                Keine Entwürfe
              </div>
            ) : null}
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-lg border border-white/[0.06] bg-[#151515] px-3 py-2">
                <button type="button" className="w-full text-left" onClick={() => editDraft(draft)}>
                  <div className="truncate text-sm font-medium">{draft.subject || "(Kein Betreff)"}</div>
                  <div className="truncate text-xs text-white/45">{draft.to || "Unbekannter Empfänger"}</div>
                </button>
                <div className="mt-2 flex justify-end">
                  <button type="button" className="text-xs text-white/45 hover:text-white" onClick={() => draft.id && void deleteComposerDraft(draft.id)}>
                    Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-white/[0.06] px-5">
            <h2 className="font-semibold">Neue Mail</h2>
            <button type="button" className="rounded-lg p-2 text-white/55 hover:bg-white/[0.06] hover:text-white" onClick={closeComposer} title="Schließen">
              <X size={18} />
            </button>
          </header>
          <div className="grid gap-0 border-b border-white/[0.06] px-5 py-2 text-sm">
            <label className="grid h-9 grid-cols-[70px_1fr] items-center">
              <span className="text-white/45">Von</span>
              <select value={accountId} onChange={(event) => setAccountId(Number(event.target.value))} className="h-full bg-transparent text-white outline-none">
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.email}</option>
                ))}
              </select>
            </label>
            <LineInput label="An" value={to} onChange={setTo} required />
            <LineInput label="CC" value={cc} onChange={setCc} />
            <LineInput label="BCC" value={bcc} onChange={setBcc} />
            <LineInput label="Betreff" value={subject} onChange={setSubject} />
          </div>
          <datalist id="contact-suggestions">
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.email}>
                {contact.name || contact.email}
              </option>
            ))}
          </datalist>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mail-scroll min-h-0 flex-1 resize-none bg-transparent px-5 py-4 leading-7 text-white outline-none placeholder:text-white/35"
          />
          {error ? <div className="mx-5 mb-2 rounded-lg border border-white/[0.08] bg-[#151515] px-4 py-3 text-sm text-white">{error}</div> : null}
          {autosaveInfo ? <div className="mx-5 mb-2 text-xs text-white/45">{autosaveInfo}</div> : null}
          {totalAttachmentBytes >= WARN_ATTACHMENT_BYTES ? (
            <div className="mx-5 mb-2 rounded-lg border border-white/[0.08] bg-[#151515] px-4 py-2 text-xs text-white/65">
              Große Anhänge erkannt ({formatBytes(totalAttachmentBytes)}).
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <div className="grid gap-2 border-t border-white/[0.06] px-5 py-3 text-sm">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between rounded-lg bg-[#151515] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{attachment.fileName}</div>
                    <div className="text-xs text-white/45">{attachment.contentType} · {formatBytes(attachment.size || 0)}</div>
                  </div>
                  <button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <footer className="flex h-16 items-center justify-between border-t border-white/[0.06] px-5">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void attachFile()} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-sm text-white/75 hover:bg-white/[0.05] hover:text-white">
                <Paperclip size={16} />
                Anhang
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/[0.06] px-3 py-2 text-sm text-white/75 hover:bg-white/[0.05] hover:text-white"
                onClick={() => setSignatureEnabled((value) => !value)}
              >
                Signatur {signatureEnabled ? "an" : "aus"}
              </button>
            </div>
            <button disabled={sending || accounts.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#0B0B0B] hover:bg-white/90 disabled:opacity-50">
              <Send size={16} />
              {sending ? "Sendet..." : "Senden"}
            </button>
          </footer>
        </div>
      </form>
    </div>
  );
}

function LineInput(props: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="grid h-9 grid-cols-[70px_1fr] items-center border-t border-white/[0.06]">
      <span className="text-white/45">{props.label}</span>
      <input
        value={props.value}
        required={props.required}
        onChange={(event) => props.onChange(event.target.value)}
        list={props.label === "Betreff" ? undefined : "contact-suggestions"}
        className="h-full bg-transparent text-white outline-none"
      />
    </label>
  );
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
