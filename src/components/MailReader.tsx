import DOMPurify from "dompurify";
import { Archive, Check, ChevronLeft, Download, Forward, MailOpen, Paperclip, Reply, ReplyAll, Trash2, UserPlus, X } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { desktopDialog, openExternalLink } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import { useShallow } from "zustand/react/shallow";

const MAX_HTML_LENGTH = 150_000;
const SAFE_LINK_SCHEME = /^(https:|mailto:|tel:)/i;

export function MailReader() {
  const { selectedEmail, selectedView, settings, contacts, closeEmail, replyToSelected, forwardSelected, archiveSelected, deleteSelected, saveContact } = useMailStore(useShallow((state) => ({
    selectedEmail: state.selectedEmail,
    selectedView: state.selectedView,
    settings: state.settings,
    contacts: state.contacts,
    closeEmail: state.closeEmail,
    replyToSelected: state.replyToSelected,
    forwardSelected: state.forwardSelected,
    archiveSelected: state.archiveSelected,
    deleteSelected: state.deleteSelected,
    saveContact: state.saveContact
  })));

  const htmlView = useMemo(() => {
    if (!selectedEmail?.bodyHtml || selectedEmail.bodyHtml.length > MAX_HTML_LENGTH) return undefined;
    return sanitizeEmailHtml(selectedEmail.bodyHtml, settings.externalImages === "always");
  }, [selectedEmail?.bodyHtml, settings.externalImages]);

  if (selectedView === "dashboard" || selectedView === "health") return null;

  if (!selectedEmail) {
    return (
      <aside className="hidden min-w-0 flex-1 items-center justify-center border-l border-line bg-canvas xl:flex">
        <div className="max-w-xs px-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface text-label-2">
            <MailOpen size={26} />
          </span>
          <h2 className="mt-5 font-display text-[20px] font-bold">Keine Nachricht ausgewählt</h2>
          <p className="mt-2 text-[14px] leading-5 text-label-2">Wähle eine E-Mail aus der Liste, um sie hier zu lesen und zu bearbeiten.</p>
        </div>
      </aside>
    );
  }

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
    <aside className="mail-reader-pane mail-scroll min-w-0 flex-1 overflow-y-auto border-l border-line bg-canvas">
      <article className="mx-auto min-h-full w-full max-w-[920px] px-6 pb-10 pt-4 lg:px-10">
        <header className="mb-6 border-b border-line pb-5">
          <div className="mb-5 flex h-10 items-center justify-between pr-28">
            <button className="-ml-2 inline-flex h-9 items-center gap-0.5 rounded-full pl-1 pr-3 text-[14px] font-semibold transition hover:bg-surface xl:hidden" onClick={closeEmail}><ChevronLeft size={18} /> Zurück</button>
            <div className="ml-auto flex items-center gap-1">
              <button className="reader-icon-button" title="Antworten" onClick={replyToSelected}><Reply size={18} /></button>
              <button className="reader-icon-button" title="Allen antworten" onClick={replyToSelected}><ReplyAll size={18} /></button>
              <button className="reader-icon-button" title="Weiterleiten" onClick={forwardSelected}><Forward size={18} /></button>
              <span className="mx-1 h-5 w-px bg-line" />
              <button className="reader-icon-button" title="Archivieren" onClick={() => void archiveSelected()}><Archive size={18} /></button>
              <button className="reader-icon-button reader-icon-danger" title="Löschen" onClick={() => void deleteSelected()}><Trash2 size={18} /></button>
              <button className="reader-icon-button" title="Schließen" onClick={closeEmail}><X size={19} /></button>
            </div>
          </div>
          <h2 className="max-w-[820px] font-display text-[26px] font-extrabold leading-[31px] sm:text-[28px]">{selectedEmail.subject || "(Kein Betreff)"}</h2>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2A2A2A] text-[15px] font-semibold text-white">
                {initials(selectedEmail.sender)}
              </span>
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
            <time className="shrink-0 pt-1 text-[13px] font-medium text-label-2">
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

        <section className="max-w-full text-[15px] leading-7 text-ink">
          {selectedEmail.bodyHtml && selectedEmail.bodyHtml.length > MAX_HTML_LENGTH ? (
            <Notice>Sehr große HTML-Mail wird aus Performance-Gründen als Text angezeigt.</Notice>
          ) : null}
          {htmlView?.blockedRemoteImages ? (
            <Notice>{htmlView.blockedRemoteImages} externe Bilder wurden blockiert.</Notice>
          ) : null}
          {htmlView?.document ? (
            <iframe
              className="h-[min(68vh,720px)] w-full rounded-2xl border border-line bg-white"
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
          <section className="mt-8 max-w-[820px] border-t border-line pt-5">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.04em] text-label-3">{selectedEmail.attachments.length === 1 ? "1 Anhang" : `${selectedEmail.attachments.length} Anhänge`}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedEmail.attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  className="tr-card tr-card-hover flex h-[62px] items-center gap-3 rounded-2xl px-3 text-left"
                  onClick={() => void downloadAttachment(attachment.id, attachment.fileName)}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-canvas text-label-2">
                    <Paperclip size={15} />
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

        <footer className="mt-8 flex flex-wrap gap-2">
          <ActionButton icon={<Reply size={15} />} label="Antworten" onClick={replyToSelected} />
          <ActionButton icon={<ReplyAll size={15} />} label="Allen antworten" onClick={replyToSelected} />
          <ActionButton icon={<Forward size={15} />} label="Weiterleiten" onClick={forwardSelected} />
        </footer>
      </article>
    </aside>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="mb-5 rounded-2xl bg-surface px-4 py-3 text-[13px] font-medium text-label-2">{children}</div>;
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-semibold transition hover:bg-surface-2" onClick={onClick}>
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

function initials(value: string) {
  const parts = value.replace(/<[^>]+>/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (parts[0]?.[0] || "L").toUpperCase() + (parts[1]?.[0] || "M").toUpperCase();
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
