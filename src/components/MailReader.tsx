import DOMPurify from "dompurify";
import { Archive, Clock3, Download, Forward, MoreHorizontal, Paperclip, Reply, ReplyAll, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import type { MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { desktopDialog, invokeDesktop, isDesktop } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import { useShallow } from "zustand/react/shallow";

const MAX_HTML_LENGTH = 150_000;
const SAFE_LINK_SCHEME = /^(https:|mailto:|tel:)/i;

export function MailReader() {
  const { selectedEmail, settings, closeEmail, replyToSelected, forwardSelected, deleteSelected } = useMailStore(useShallow((state) => ({
    selectedEmail: state.selectedEmail,
    settings: state.settings,
    closeEmail: state.closeEmail,
    replyToSelected: state.replyToSelected,
    forwardSelected: state.forwardSelected,
    deleteSelected: state.deleteSelected
  })));

  const htmlView = useMemo(() => {
    if (!selectedEmail?.bodyHtml || selectedEmail.bodyHtml.length > MAX_HTML_LENGTH) return undefined;
    return sanitizeEmailHtml(selectedEmail.bodyHtml, settings.externalImages === "always");
  }, [selectedEmail?.bodyHtml, settings.externalImages]);

  if (!selectedEmail) return null;

  const bodyFallback = selectedEmail.bodyText || selectedEmail.preview || "";

  function handleReaderClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    const link = target?.closest("a[href]") as HTMLAnchorElement | null;
    const href = link?.getAttribute("href");
    if (!href || !SAFE_LINK_SCHEME.test(href)) return;
    event.preventDefault();
    event.stopPropagation();
    void openExternalUrl(href);
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/76 p-6" onClick={closeEmail}>
      <article
        className="tr-shell mail-scroll max-h-[min(900px,calc(100vh-3rem))] w-[min(1080px,calc(100vw-3rem))] overflow-y-auto rounded-[10px] bg-[#0B0B0B] px-9 py-5"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-7 border-b border-white/[0.06] pb-5">
          <div className="mb-8 flex items-center justify-between">
            <button className="text-[12px] font-medium text-white/55 hover:text-white" onClick={closeEmail}>‹ Zurück</button>
            <div className="flex items-center gap-5 text-white/65">
              <button title="Archivieren"><Archive size={17} /></button>
              <button title="Löschen" onClick={() => void deleteSelected()}><Trash2 size={17} /></button>
              <button title="Später"><Clock3 size={17} /></button>
              <button title="Mehr"><MoreHorizontal size={18} /></button>
              <button title="Schließen" onClick={closeEmail}><X size={18} /></button>
            </div>
          </div>
          <h2 className="max-w-[760px] text-[22px] font-semibold leading-8 tracking-[-0.035em]">{selectedEmail.subject || "(Kein Betreff)"}</h2>
          <div className="mt-6 flex items-start justify-between gap-6">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent)/0.22)] text-[13px] font-semibold">
                {initials(selectedEmail.sender)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{selectedEmail.sender || "Unbekannter Absender"}</div>
                <div className="truncate text-[12px] text-white/45">an {selectedEmail.recipients || "mich"} ˅</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-5 text-[12px] text-white/65">
              <time>{new Date(selectedEmail.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              <button title="Antworten" onClick={replyToSelected}><Reply size={16} /></button>
              <button title="Allen antworten" onClick={replyToSelected}><ReplyAll size={16} /></button>
              <button title="Weiterleiten" onClick={forwardSelected}><Forward size={16} /></button>
            </div>
          </div>
        </header>

        <section className="max-w-[760px] text-[14px] font-medium leading-8 text-white/90">
          {selectedEmail.bodyHtml && selectedEmail.bodyHtml.length > MAX_HTML_LENGTH ? (
            <Notice>Sehr große HTML-Mail wird aus Performance-Gründen als Text angezeigt.</Notice>
          ) : null}
          {htmlView?.blockedRemoteImages ? (
            <Notice>{htmlView.blockedRemoteImages} externe Bilder wurden blockiert.</Notice>
          ) : null}
          <div
            className="reader-content"
            dangerouslySetInnerHTML={htmlView?.html ? { __html: htmlView.html } : undefined}
            onClick={handleReaderClick}
          >
            {!htmlView?.html ? <pre className="whitespace-pre-wrap font-sans">{bodyFallback}</pre> : null}
          </div>
        </section>

        {selectedEmail.attachments.length > 0 ? (
          <section className="mt-7 max-w-[760px] border-t border-white/[0.06] pt-4">
            <div className="mb-3 text-[12px] font-medium text-white/55">{selectedEmail.attachments.length} Anhänge</div>
            <div className="grid grid-cols-2 gap-3">
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

        <footer className="mt-7 flex gap-3">
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
    <button className="inline-flex h-10 items-center gap-3 rounded-md bg-[#151515] px-5 text-[13px] font-medium hover:bg-[#1B1B1B]" onClick={onClick}>
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

async function openExternalUrl(href: string) {
  if (!SAFE_LINK_SCHEME.test(href)) return;
  if (isDesktop) {
    await invokeDesktop("open_external_link", { url: href });
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function sanitizeEmailHtml(rawHtml: string, allowExternalImages: boolean): { html: string; blockedRemoteImages: number } {
  const clean = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style", "link", "meta", "base"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "srcdoc", "style"],
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

  if (!allowExternalImages) {
    for (const element of doc.body.querySelectorAll("*")) {
      for (const attr of ["src", "srcset", "poster", "background", "data", "xlink:href"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        if (/https?:\/\//i.test(value)) {
          element.removeAttribute(attr);
          blockedRemoteImages += 1;
        }
      }
    }
  }

  return { html: doc.body.innerHTML, blockedRemoteImages };
}

function initials(value: string) {
  const parts = value.replace(/<[^>]+>/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (parts[0]?.[0] || "L").toUpperCase() + (parts[1]?.[0] || "M").toUpperCase();
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
