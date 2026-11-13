import DOMPurify from "dompurify";
import { AlarmClock, Archive, Ban, MailX, Check, ChevronDown, ChevronUp, Download, Forward, Mail, Maximize2, Paperclip, Reply, ReplyAll, Send, Star, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { desktopDialog, openExternalLink } from "../services/desktop";
import { cn } from "../lib/cn";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import { useShallow } from "zustand/react/shallow";
import { SenderAvatar } from "./SenderAvatar";
import { SnoozeMenu } from "./SnoozeMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import type { Email, UnsubscribeInfo } from "../types";

const MAX_HTML_LENGTH = 150_000;
const SAFE_LINK_SCHEME = /^(https:|mailto:|tel:)/i;

export function MailReader() {
  const {
    selectedEmail: currentEmail, emails, settings, contacts, closeEmail, replyToSelected, replyAllToSelected, forwardSelected, archiveSelected, deleteSelected,
    saveContact, updateSettings, toggleFavoriteSelected, markUnreadSelected, snoozeSelected, unsnoozeEmail, openAdjacentEmail, quickReply, openComposer, blockSender, unsubscribeEmail
  } = useMailStore(useShallow((state) => ({
    selectedEmail: state.selectedEmail,
    emails: state.emails,
    replyAllToSelected: state.replyAllToSelected,
    toggleFavoriteSelected: state.toggleFavoriteSelected,
    markUnreadSelected: state.markUnreadSelected,
    snoozeSelected: state.snoozeSelected,
    unsnoozeEmail: state.unsnoozeEmail,
    openAdjacentEmail: state.openAdjacentEmail,
    quickReply: state.quickReply,
    blockSender: state.blockSender,
    unsubscribeEmail: state.unsubscribeEmail,
    openComposer: state.openComposer,
    settings: state.settings,
    contacts: state.contacts,
    closeEmail: state.closeEmail,
    replyToSelected: state.replyToSelected,
    forwardSelected: state.forwardSelected,
    archiveSelected: state.archiveSelected,
    deleteSelected: state.deleteSelected,
    saveContact: state.saveContact,
    updateSettings: state.updateSettings
  })));
  // Beim Schließen bleibt die Mail kurz stehen, damit das Modal sichtbar ausblenden kann.
  const [shownEmail, setShownEmail] = useState(currentEmail);
  useEffect(() => {
    if (currentEmail) {
      setShownEmail(currentEmail);
      return;
    }
    const timer = window.setTimeout(() => setShownEmail(undefined), 170);
    return () => window.clearTimeout(timer);
  }, [currentEmail]);
  const selectedEmail = currentEmail ?? shownEmail;
  const closing = !currentEmail;

  // Externe Bilder nur nach ausdrücklichem Klick, und dann nur für diese eine Mail.
  const [imagesAllowedFor, setImagesAllowedFor] = useState<number>();
  const imagesAllowed = settings.externalImages === "always" || (selectedEmail !== undefined && imagesAllowedFor === selectedEmail.id);
  const htmlView = useMemo(() => {
    if (!selectedEmail?.bodyHtml || selectedEmail.bodyHtml.length > MAX_HTML_LENGTH) return undefined;
    return sanitizeEmailHtml(selectedEmail.bodyHtml, imagesAllowed);
  }, [selectedEmail?.bodyHtml, imagesAllowed]);


  const [confirmBlock, setConfirmBlock] = useState(false);
  const position = selectedEmail ? emails.findIndex((email) => email.id === selectedEmail.id) : -1;
  // Richtung fürs Blättern: nächste Mail kommt von unten, vorherige von oben.
  const lastPosition = useRef({ id: selectedEmail?.id, position, direction: 1 });
  if (selectedEmail && lastPosition.current.id !== selectedEmail.id) {
    lastPosition.current = { id: selectedEmail.id, position, direction: position >= lastPosition.current.position ? 1 : -1 };
  }
  const direction = lastPosition.current.direction;

  if (!selectedEmail) return null;

  const bodyFallback = selectedEmail.bodyText || selectedEmail.preview || "";
  const senderContact = parseSender(selectedEmail.sender);
  const senderSaved = Boolean(senderContact.email && contacts.some((contact) => contact.email.toLowerCase() === senderContact.email.toLowerCase()));

  async function openMailLink(url: string) {
    if (!SAFE_LINK_SCHEME.test(url)) return;
    if (url.startsWith("mailto:") || url.startsWith("tel:")) {
      window.location.href = url;
      return;
    }
    try {
      await openExternalLink(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className={cn("mail-reader-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-scrim/30 p-6 backdrop-blur-[6px] sm:p-8", closing && "is-closing pointer-events-none")} onClick={closeEmail}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={selectedEmail.subject || "E-Mail"}
        className="mail-reader-panel mail-scroll max-h-full w-[min(1600px,max(1120px,82vw),100%)] overflow-y-auto rounded-[14px] border border-line bg-canvas shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="reader-toolbar sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-line px-4 lg:px-6">
          <div className="flex items-center gap-0.5">
            <button className="reader-icon-button" title="Vorherige Mail (K)" disabled={position <= 0} onClick={() => void openAdjacentEmail(-1)}><ChevronUp size={18} /></button>
            <button className="reader-icon-button" title="Nächste Mail (J)" disabled={position < 0 || position >= emails.length - 1} onClick={() => void openAdjacentEmail(1)}><ChevronDown size={18} /></button>
            {position >= 0 ? <span className="ml-1.5 overflow-hidden text-[12px] font-medium tabular-nums text-label-3"><span key={position} className="count-tick">{position + 1}</span> von {emails.length}</span> : null}
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <button className="reader-icon-button" title="Antworten (R)" onClick={replyToSelected}><Reply size={18} /></button>
            <button className="reader-icon-button" title="Allen antworten (A)" onClick={replyAllToSelected}><ReplyAll size={18} /></button>
            <button className="reader-icon-button" title="Weiterleiten (F)" onClick={forwardSelected}><Forward size={18} /></button>
            <span className="mx-1.5 h-5 w-px bg-line" />
            <SnoozeMenu onSnooze={(until) => void snoozeSelected(until)} />
            <button className={cn("reader-icon-button", selectedEmail.isFavorite && "text-flag hover:text-flag")} title={selectedEmail.isFavorite ? "Favorit entfernen (S)" : "Favorit (S)"} onClick={() => void toggleFavoriteSelected()}>
              <Star key={String(selectedEmail.isFavorite)} size={18} className={selectedEmail.isFavorite ? "pop-in fill-current" : undefined} />
            </button>
            <button className="reader-icon-button" title="Als ungelesen markieren (U)" onClick={() => void markUnreadSelected()}><Mail size={18} /></button>
            <button className="reader-icon-button" title="Archivieren (E)" onClick={() => void archiveSelected()}><Archive size={18} /></button>
            <button className="reader-icon-button reader-icon-danger" title="Absender blockieren" onClick={() => setConfirmBlock(true)}><Ban size={18} /></button>
            <button className="reader-icon-button reader-icon-danger" title="Löschen (Entf)" onClick={() => void deleteSelected()}><Trash2 size={18} /></button>
            <span className="mx-1.5 h-5 w-px bg-line" />
            <button className="reader-icon-button" title="Schließen (Esc)" onClick={closeEmail}><X size={19} /></button>
          </div>
        </div>
        <article key={selectedEmail.id} data-direction={direction} className="reader-swap w-full px-6 pb-8 pt-7 lg:px-10">
          <header className="mb-6 border-b border-line pb-5">
            {selectedEmail.snoozedUntil && new Date(selectedEmail.snoozedUntil).getTime() > Date.now() ? (
              <div className="mb-5 flex items-center gap-3 rounded-[10px] bg-surface px-4 py-2.5 text-[13px] font-medium text-label-2">
                <AlarmClock size={15} className="shrink-0" />
                <span className="min-w-0 flex-1">Erinnerung am {new Date(selectedEmail.snoozedUntil).toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span>
                <button className="pressable rounded-[8px] px-2.5 py-1 font-semibold text-ink hover:bg-surface-2" onClick={() => { void unsnoozeEmail(selectedEmail.id); closeEmail(); }}>Jetzt zurückholen</button>
              </div>
            ) : null}
            <h2 className="max-w-[820px] font-display text-[26px] font-extrabold leading-[31px] sm:text-[28px]">{selectedEmail.subject || "(Kein Betreff)"}</h2>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex min-w-0 items-center gap-3">
                <SenderAvatar address={selectedEmail.sender} name={senderContact.name || selectedEmail.sender} className="h-11 w-11 text-[15px]" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[15px] font-bold">{senderContact.name || selectedEmail.sender || "Unbekannter Absender"}</div>
                    {senderContact.email ? (
                      <button
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-label-2 transition hover:bg-surface hover:text-ink disabled:cursor-default disabled:text-ink"
                        disabled={senderSaved}
                        title={senderSaved ? "Kontakt ist gespeichert" : "Als Kontakt speichern"}
                        onClick={() => void saveContact({ name: senderContact.name, email: senderContact.email, isFavorite: false })}
                      >
                        {senderSaved ? <Check size={13} /> : <UserPlus size={13} />}
                      </button>
                    ) : null}
                  </div>
                  <div className="truncate text-[13px] text-label-2">{senderContact.email ? `${senderContact.email} · ` : ""}an {selectedEmail.recipients || "mich"}</div>
                </div>
              </div>
              <time className="shrink-0 pt-1 text-[13px] font-medium tabular-nums text-label-2">
                {new Date(selectedEmail.receivedAt).toLocaleString("de-DE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </time>
            </div>
            {selectedEmail.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedEmail.tags.map((tag) => (
                  <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-label-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}
          </header>

          <UnsubscribeBar key={`unsubscribe-${selectedEmail.id}`} email={selectedEmail} senderName={senderContact.name || senderContact.email} onUnsubscribe={unsubscribeEmail} onBlock={blockSender} />
          <section className="max-w-full text-[15px] leading-7 text-ink">
            {selectedEmail.bodyHtml && selectedEmail.bodyHtml.length > MAX_HTML_LENGTH ? (
              <Notice>Sehr große HTML-Mail wird aus Performance-Gründen als Text angezeigt.</Notice>
            ) : null}
            {htmlView?.blockedRemoteImages ? (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] bg-surface px-4 py-3 text-[13px] font-medium text-label-2">
                <span className="min-w-0 flex-1">
                  {htmlView.blockedRemoteImages === 1 ? "1 externes Bild wurde" : `${htmlView.blockedRemoteImages} externe Bilder wurden`} zum Schutz vor Tracking blockiert.
                </span>
                <button className="pressable rounded-[8px] bg-ink px-3.5 py-1.5 text-[13px] font-bold text-canvas hover:opacity-90" onClick={() => setImagesAllowedFor(selectedEmail.id)}>
                  Bilder laden
                </button>
                <button className="pressable rounded-[8px] px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-2" onClick={() => void updateSettings({ ...settings, externalImages: "always" })}>
                  Immer laden
                </button>
              </div>
            ) : null}
            {htmlView?.document ? (
              <iframe
                className="h-[max(420px,calc(100vh-330px))] w-full rounded-[10px] border border-line bg-white"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={htmlView.document}
                title={`E-Mail: ${selectedEmail.subject || "Ohne Betreff"}`}
                onLoad={(event) => {
                  const doc = event.currentTarget.contentDocument;
                  if (!doc) return;
                  doc.addEventListener("click", (clickEvent) => {
                    const target = clickEvent.target as HTMLElement | null;
                    const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
                    const href = link?.href;
                    if (!href) return;
                    clickEvent.preventDefault();
                    void openMailLink(href);
                  });
                }}
              />
            ) : (
              <pre className="max-w-[760px] whitespace-pre-wrap font-sans text-[16px] leading-[26px] text-ink">{bodyFallback}</pre>
            )}
          </section>

          {selectedEmail.attachments.length > 0 ? (
            <section className="mt-8 border-t border-line pt-5">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-label-3">{selectedEmail.attachments.length === 1 ? "1 Anhang" : `${selectedEmail.attachments.length} Anhänge`}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedEmail.attachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    className="tr-card tr-card-hover flex h-[60px] items-center gap-3 rounded-[10px] px-3 text-left"
                    onClick={() => void downloadAttachment(attachment.id, attachment.fileName)}
                  >
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[8px] bg-canvas text-label-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink/70">{fileExtension(attachment.fileName) || <Paperclip size={15} />}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{attachment.fileName}</span>
                      <span className="block text-[12px] text-label-2">{formatBytes(attachment.size)}</span>
                    </span>
                    <Download size={16} className="text-label-2" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <QuickReply
            key={`reply-${selectedEmail.id}`}
            recipient={senderContact.name || senderContact.email || selectedEmail.sender}
            onSend={(text) => quickReply(text)}
            onExpand={(text) => {
              replyToSelected();
              const composer = useMailStore.getState().composer;
              if (composer && text.trim()) openComposer({ ...composer, body: `${text.trim()}${composer.body ?? ""}` });
            }}
          />
          <footer className="mt-3 flex flex-wrap gap-2">
            <ActionButton icon={<ReplyAll size={15} />} label="Allen antworten" onClick={replyAllToSelected} />
            <ActionButton icon={<Forward size={15} />} label="Weiterleiten" onClick={forwardSelected} />
          </footer>
        </article>
      </aside>
      {confirmBlock ? (
        <ConfirmDialog
          danger
          icon={<Ban size={20} />}
          title={`${senderContact.name || senderContact.email || "Absender"} blockieren?`}
          message={<>Neue Mails von <strong className="text-ink">{senderContact.email || selectedEmail.sender}</strong> landen direkt im Papierkorb, ohne Benachrichtigung. Vorhandene Mails aus dem Posteingang werden ebenfalls verschoben. Aufheben kannst du das unter Einstellungen → Blockiert.</>}
          confirmLabel="Blockieren"
          onCancel={() => setConfirmBlock(false)}
          onConfirm={() => {
            setConfirmBlock(false);
            void blockSender(selectedEmail.sender);
          }}
        />
      ) : null}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="mb-5 rounded-[10px] bg-surface px-4 py-3 text-[13px] font-medium text-label-2">{children}</div>;
}

/** Hinweis wie bei Gmail/Apple Mail: „Newsletter abbestellen“, wenn der Absender eine Abmeldung anbietet. */
function UnsubscribeBar({ email, senderName, onUnsubscribe, onBlock }: {
  email: Email;
  senderName: string;
  onUnsubscribe: (email: Email) => Promise<boolean>;
  onBlock: (sender: string) => Promise<void>;
}) {
  const [info, setInfo] = useState<UnsubscribeInfo>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void mailService.getUnsubscribeInfo(email.id).then((next) => {
      if (active) setInfo(next);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [email.id]);

  if (!info || info.method === "none") return null;
  const done = Boolean(email.unsubscribedAt || info.unsubscribedAt);

  return (
    <>
      <div className="mb-6 flex items-center gap-3 rounded-[10px] bg-surface px-4 py-2.5 text-[13px] font-medium text-label-2">
        <MailX size={15} className="shrink-0" />
        <span className="min-w-0 flex-1">
          {done
            ? `Von diesem Newsletter abgemeldet am ${new Date(email.unsubscribedAt || info.unsubscribedAt || "").toLocaleDateString("de-DE", { day: "numeric", month: "long" })}.`
            : `Diese Mail ist Teil eines Newsletters${info.host ? ` von ${info.host}` : ""}.`}
        </span>
        {done ? null : (
          <button disabled={busy} className="pressable shrink-0 rounded-[8px] bg-ink px-3 py-1.5 text-[13px] font-bold text-canvas hover:opacity-90 disabled:opacity-50" onClick={() => setConfirming(true)}>
            {busy ? "Melde ab …" : "Abmelden"}
          </button>
        )}
      </div>
      {confirming ? (
        <ConfirmDialog
          icon={<MailX size={20} />}
          title="Newsletter abbestellen?"
          message={info.method === "website"
            ? <>{senderName || "Der Absender"} bietet die Abmeldung nur auf der eigenen Website an. LunaMail öffnet die Seite{info.host ? <> von <strong className="text-ink">{info.host}</strong></> : null} im Browser.</>
            : <>LunaMail meldet dich direkt bei {senderName || "dem Absender"} ab{info.method === "mailto" ? " (per Abmelde-Mail)" : ""}. Du musst dafür keine Website öffnen.</>}
          confirmLabel={info.method === "website" ? "Seite öffnen" : "Abmelden"}
          option={{ label: "Absender zusätzlich blockieren" }}
          onCancel={() => setConfirming(false)}
          onConfirm={(alsoBlock) => {
            setConfirming(false);
            setBusy(true);
            void onUnsubscribe(email)
              .then(() => (alsoBlock ? onBlock(email.sender) : undefined))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </>
  );
}

/** Schnellantwort direkt unter der Mail; Strg+Enter sendet, mit „Senden rückgängig“. */
function QuickReply({ recipient, onSend, onExpand }: { recipient: string; onSend: (text: string) => Promise<void>; onExpand: (text: string) => void }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const expanded = focused || text.length > 0;

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setText("");
      ref.current?.blur();
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={cn("mt-8 rounded-[12px] border bg-canvas transition-[border-color,box-shadow]", expanded ? "border-ink/20 shadow-soft" : "border-line")}>
      <textarea
        ref={ref}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void send();
          } else if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
        rows={expanded ? 4 : 1}
        placeholder={`Antwort an ${recipient} …`}
        className="block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 text-ink outline-none focus-visible:outline-none placeholder:text-label-3"
      />
      {expanded ? (
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-semibold text-label-2 hover:bg-surface hover:text-ink" onMouseDown={(event) => event.preventDefault()} onClick={() => onExpand(text)}>
            <Maximize2 size={14} /> Im Editor öffnen
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[12px] text-label-3 sm:inline">Strg + Enter</span>
            <button type="button" disabled={!text.trim() || sending} className="accent-primary pressable inline-flex h-9 items-center gap-2 rounded-[10px] px-4 text-[14px] font-bold disabled:opacity-30" onMouseDown={(event) => event.preventDefault()} onClick={() => void send()}>
              <Send size={15} /> Senden
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function fileExtension(name: string) {
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return ext.length > 0 && ext.length <= 4 ? ext : "";
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="pressable inline-flex h-9 items-center gap-2 rounded-[10px] bg-surface px-3.5 text-[13px] font-semibold transition hover:bg-surface-2" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

async function downloadAttachment(attachmentId: number, fileName: string) {
  const destinationPath = await desktopDialog.save({ defaultPath: fileName });
  if (!destinationPath) return;
  await mailService.downloadAttachment(attachmentId, destinationPath);
}

function sanitizeEmailHtml(rawHtml: string, allowExternalImages: boolean): { document: string; blockedRemoteImages: number } {
  const clean = DOMPurify.sanitize(rawHtml, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "link", "meta", "base"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "srcdoc"],
    ADD_ATTR: ["target", "rel"]
  });
  const doc = new DOMParser().parseFromString(clean, "text/html");
  let blockedRemoteImages = 0;

  for (const link of doc.querySelectorAll("a[href]")) {
    const href = (link.getAttribute("href") ?? "").trim();
    if (!SAFE_LINK_SCHEME.test(href)) {
      link.removeAttribute("href");
      continue;
    }
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }

  for (const element of doc.body.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  }

  if (!allowExternalImages) {
    const remoteCssUrl = /url\(\s*(['"]?)https?:\/\/.*?\1\s*\)/gi;
    for (const element of doc.body.querySelectorAll("*")) {
      for (const attr of ["src", "srcset", "poster", "background", "data", "xlink:href"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        if (/https?:\/\//i.test(value)) {
          element.removeAttribute(attr);
          blockedRemoteImages += 1;
        }
      }
      const inlineStyle = element.getAttribute("style");
      if (inlineStyle && remoteCssUrl.test(inlineStyle)) {
        element.setAttribute("style", inlineStyle.replace(remoteCssUrl, "none"));
        blockedRemoteImages += 1;
      }
      remoteCssUrl.lastIndex = 0;
    }
    for (const style of doc.querySelectorAll("style")) {
      const css = style.textContent ?? "";
      const matches = css.match(remoteCssUrl);
      if (matches?.length) {
        style.textContent = css.replace(remoteCssUrl, "none");
        blockedRemoteImages += matches.length;
      }
      remoteCssUrl.lastIndex = 0;
    }
  }

  const safetyStyle = doc.createElement("style");
  safetyStyle.textContent = `
    html { color-scheme: light only !important; background: #fff; }
    * { scrollbar-width: none; -ms-overflow-style: none; }
    *::-webkit-scrollbar { display: none; }
    body {
      box-sizing: border-box;
      margin: 0 auto;
      min-height: 100%;
      max-width: 920px;
      padding: clamp(18px, 3vw, 34px);
      overflow-wrap: anywhere;
      background: #fff;
      color: #17202a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.65;
    }
    a { color: #0b63ce; text-decoration-thickness: 1px; text-underline-offset: 2px; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    p { margin-block: 0.75em; }
    @media (max-width: 640px) {
      body { padding: 16px; font-size: 15px; }
      table { width: 100% !important; }
    }
  `;
  doc.head.appendChild(safetyStyle);

  return { document: `<!doctype html>${doc.documentElement.outerHTML}`, blockedRemoteImages };
}

function parseSender(value: string): { name: string; email: string } {
  const match = value.match(/^(.*?)\s*<([^<>@\s]+@[^<>@\s]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      email: match[2].trim()
    };
  }
  const email = value.match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? "";
  return { name: email ? value.replace(email, "").replace(/[<>"']/g, "").trim() : "", email };
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
