import DOMPurify from "dompurify";
import { Archive, Check, Clock3, Download, Forward, MoreHorizontal, Paperclip, Reply, ReplyAll, Trash2, UserPlus, X } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { desktopDialog, openExternalLink } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import { useShallow } from "zustand/react/shallow";

const MAX_HTML_LENGTH = 150_000;
const SAFE_LINK_SCHEME = /^(https:|mailto:|tel:)/i;

export function MailReader() {
  const { selectedEmail, settings, contacts, closeEmail, replyToSelected, forwardSelected, deleteSelected, saveContact } = useMailStore(useShallow((state) => ({
    selectedEmail: state.selectedEmail,
    settings: state.settings,
    contacts: state.contacts,
    closeEmail: state.closeEmail,
    replyToSelected: state.replyToSelected,
    forwardSelected: state.forwardSelected,
    deleteSelected: state.deleteSelected,
    saveContact: state.saveContact
  })));

  const htmlView = useMemo(() => {
    if (!selectedEmail?.bodyHtml || selectedEmail.bodyHtml.length > MAX_HTML_LENGTH) return undefined;
    return sanitizeEmailHtml(selectedEmail.bodyHtml, settings.externalImages === "always");
  }, [selectedEmail?.bodyHtml, settings.externalImages]);

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

  return createPortal(
    <div className="mail-reader-backdrop fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/76 p-3 sm:p-6" onClick={closeEmail}>
      <article
        className="mail-reader-panel tr-shell mail-scroll max-h-[calc(100vh-1.5rem)] w-full max-w-[1120px] overflow-y-auto rounded-[18px] border border-white/[0.08] bg-[#0B0B0B] px-4 py-4 shadow-2xl sm:max-h-[min(900px,calc(100vh-3rem))] sm:px-7 lg:px-9"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-6 border-b border-white/[0.06] pb-5">
          <div className="mb-6 flex items-center justify-between">
            <button className="rounded-lg px-2 py-1 text-[12px] font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white" onClick={closeEmail}>‹ Zurück</button>
            <div className="flex items-center gap-2 text-white/65 sm:gap-4">
              <button title="Archivieren"><Archive size={17} /></button>
              <button title="Löschen" onClick={() => void deleteSelected()}><Trash2 size={17} /></button>
              <button title="Später"><Clock3 size={17} /></button>
              <button title="Mehr"><MoreHorizontal size={18} /></button>
              <button title="Schließen" onClick={closeEmail}><X size={18} /></button>
            </div>
          </div>
          <h2 className="max-w-[820px] text-[21px] font-semibold leading-8 tracking-[-0.025em] sm:text-[24px]">{selectedEmail.subject || "(Kein Betreff)"}</h2>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent)/0.22)] text-[13px] font-semibold">
                {initials(selectedEmail.sender)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[13px] font-semibold">{selectedEmail.sender || "Unbekannter Absender"}</div>
                  {senderContact.email ? (
                    <button
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.07] text-white/45 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:text-[rgb(var(--accent))]"
                      disabled={senderSaved}
                      title={senderSaved ? "Kontakt ist gespeichert" : "Als Kontakt speichern"}
                      onClick={() => void saveContact({ name: senderContact.name, email: senderContact.email, isFavorite: false })}
                    >
                      {senderSaved ? <Check size={13} /> : <UserPlus size={13} />}
                    </button>
                  ) : null}
                </div>
                <div className="truncate text-[12px] text-white/45">an {selectedEmail.recipients || "mich"} ˅</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-[12px] text-white/65 sm:gap-5">
              <time>{new Date(selectedEmail.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              <button title="Antworten" onClick={replyToSelected}><Reply size={16} /></button>
              <button title="Allen antworten" onClick={replyToSelected}><ReplyAll size={16} /></button>
              <button title="Weiterleiten" onClick={forwardSelected}><Forward size={16} /></button>
            </div>
          </div>
          {selectedEmail.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedEmail.tags.map((tag) => (
                <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-white/60">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <section className="max-w-full text-[14px] font-medium leading-8 text-white/90">
          {selectedEmail.bodyHtml && selectedEmail.bodyHtml.length > MAX_HTML_LENGTH ? (
            <Notice>Sehr große HTML-Mail wird aus Performance-Gründen als Text angezeigt.</Notice>
          ) : null}
          {htmlView?.blockedRemoteImages ? (
            <Notice>{htmlView.blockedRemoteImages} externe Bilder wurden blockiert.</Notice>
          ) : null}
          {htmlView?.document ? (
            <iframe
              className="h-[min(68vh,720px)] w-full rounded-xl border border-white/[0.08] bg-white"
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
            <pre className="max-w-[820px] whitespace-pre-wrap rounded-2xl bg-white/[0.03] p-5 font-sans text-[15px] leading-8 text-white/86">{bodyFallback}</pre>
          )}
        </section>

        {selectedEmail.attachments.length > 0 ? (
          <section className="mt-7 max-w-[820px] border-t border-white/[0.06] pt-4">
            <div className="mb-3 text-[12px] font-medium text-white/55">{selectedEmail.attachments.length} Anhänge</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedEmail.attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  className="tr-card tr-card-hover flex h-[58px] items-center gap-4 rounded-md px-4 text-left"
                  onClick={() => void downloadAttachment(attachment.id, attachment.fileName)}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08]">
                    <Paperclip size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">{attachment.fileName}</span>
                    <span className="block text-[11px] text-white/45">{formatBytes(attachment.size)}</span>
                  </span>
                  <Download size={15} className="text-white/45" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="mt-7 flex flex-wrap gap-3">
          <ActionButton icon={<Reply size={15} />} label="Antworten" onClick={replyToSelected} />
          <ActionButton icon={<ReplyAll size={15} />} label="Allen antworten" onClick={replyToSelected} />
          <ActionButton icon={<Forward size={15} />} label="Weiterleiten" onClick={forwardSelected} />
        </footer>
      </article>
    </div>,
    document.body
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="mb-5 rounded-md border border-white/[0.06] bg-[#151515] px-4 py-3 text-[13px] text-white/65">{children}</div>;
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="inline-flex h-10 items-center gap-3 rounded-md bg-[#151515] px-5 text-[13px] font-medium transition hover:bg-[#1B1B1B]" onClick={onClick}>
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
