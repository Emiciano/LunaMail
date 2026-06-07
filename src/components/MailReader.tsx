import DOMPurify from "dompurify";
import { Download, Forward, Paperclip, Reply, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { desktopDialog, invokeDesktop, isDesktop } from "../services/desktop";
import { useShallow } from "zustand/react/shallow";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import type { IcsPreview } from "../types";

const MAX_HTML_LENGTH = 150_000;
const SAFE_LINK_SCHEME = /^(https:|mailto:|tel:)/i;

export function MailReader() {
  const { selectedEmail, tags, settings, syncError, composer, closeEmail, replyToSelected, forwardSelected, createTag, setEmailTags } = useMailStore(useShallow((state) => ({
    selectedEmail: state.selectedEmail,
    tags: state.tags,
    settings: state.settings,
    syncError: state.syncError,
    composer: state.composer,
    closeEmail: state.closeEmail,
    replyToSelected: state.replyToSelected,
    forwardSelected: state.forwardSelected,
    createTag: state.createTag,
    setEmailTags: state.setEmailTags
  })));
  const [allowExternalForCurrentMail, setAllowExternalForCurrentMail] = useState(false);
  const [icsPreviews, setIcsPreviews] = useState<Record<number, IcsPreview>>({});

  useEffect(() => {
    setAllowExternalForCurrentMail(false);
  }, [selectedEmail?.id]);

  useEffect(() => {
    let active = true;
    setIcsPreviews({});
    if (!selectedEmail?.attachments.length) return;
    void (async () => {
      const entries: Array<[number, IcsPreview]> = [];
      for (const attachment of selectedEmail.attachments) {
        const isCalendar = attachment.fileName.toLowerCase().endsWith(".ics")
          || attachment.contentType.toLowerCase().includes("calendar");
        if (!isCalendar) continue;
        const preview = await mailService.previewIcsAttachment(attachment.id).catch(() => null);
        if (preview) entries.push([attachment.id, preview]);
      }
      if (active) {
        setIcsPreviews(Object.fromEntries(entries));
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedEmail?.attachments, selectedEmail?.id]);

  const htmlView = useMemo(() => {
    if (!selectedEmail?.bodyHtml || selectedEmail.bodyHtml.length > MAX_HTML_LENGTH) return undefined;
    const policy = settings.externalImages ?? "never";
    const allowExternal = policy === "always" || (policy === "ask" && allowExternalForCurrentMail);
    return sanitizeEmailHtml(selectedEmail.bodyHtml, allowExternal);
  }, [allowExternalForCurrentMail, selectedEmail?.bodyHtml, settings.externalImages]);

  if (!selectedEmail) return null;
  const composerOpen = Boolean(composer);
  const selectedTagIds = selectedEmail.tags.map((tag) => tag.id);

  function handleReaderClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const link = target.closest("a[href]") as HTMLAnchorElement | null;
    const buttonLike = target.closest("button[data-url], button[data-href], button[formaction]") as HTMLElement | null;
    const href =
      link?.getAttribute("href") ??
      buttonLike?.getAttribute("data-url") ??
      buttonLike?.getAttribute("data-href") ??
      buttonLike?.getAttribute("formaction");
    if (!href) return;
    if (!SAFE_LINK_SCHEME.test(href)) return;
    event.preventDefault();
    event.stopPropagation();
    void openExternalUrl(href);
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[2147483646] flex items-center justify-center p-4 backdrop-blur-[4px] motion-soft ${
        composerOpen ? "bg-slate-950/56 dark:bg-black/72" : "bg-slate-950/30 dark:bg-black/50"
      }`}
      onClick={closeEmail}
    >
      <article
        className={`glass-panel mail-scroll flex h-[min(860px,calc(100vh-2rem))] w-[min(1120px,calc(100vw-2rem))] flex-col overflow-y-auto rounded-[24px] transition-all duration-150 ${
          composerOpen ? "pointer-events-none scale-[0.995] opacity-55" : "opacity-100"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-white/30 bg-[rgb(var(--surface-elevated)/0.62)] px-8 py-7 text-[rgb(var(--text-primary))] backdrop-blur-[10px] dark:border-white/[0.08] dark:bg-[rgb(var(--surface-elevated)/0.64)]">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold tracking-normal text-[rgb(var(--text-primary))]">{selectedEmail.subject || "(Kein Betreff)"}</h2>
              <div className="surface-text-secondary mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--text-primary))]">{selectedEmail.sender}</span>
                <span>an {selectedEmail.recipients}</span>
                <time>{new Date(selectedEmail.receivedAt).toLocaleString()}</time>
              </div>
            </div>
            <button
              className="inline-flex h-9 items-center gap-1 rounded-full border border-white/35 bg-white/30 px-3 text-xs text-[rgb(var(--text-primary))] backdrop-blur transition-colors duration-150 ease-out hover:bg-white/44 dark:border-white/[0.14] dark:bg-white/[0.09] dark:text-slate-100 dark:hover:bg-white/[0.15]"
              onClick={replyToSelected}
              title="Antworten"
            >
              <Reply size={14} />
              Antworten
            </button>
            <button
              className="inline-flex h-9 items-center gap-1 rounded-full border border-white/35 bg-white/30 px-3 text-xs text-[rgb(var(--text-primary))] backdrop-blur transition-colors duration-150 ease-out hover:bg-white/44 dark:border-white/[0.14] dark:bg-white/[0.09] dark:text-slate-100 dark:hover:bg-white/[0.15]"
              onClick={forwardSelected}
              title="Weiterleiten"
            >
              <Forward size={14} />
              Weiterleiten
            </button>
            <button
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/30 text-[rgb(var(--text-primary))] backdrop-blur transition-colors duration-150 ease-out hover:bg-white/44 dark:border-white/[0.14] dark:bg-white/[0.09] dark:text-slate-100 dark:hover:bg-white/[0.15] active:scale-95"
              onClick={closeEmail}
              title="Mail schließen"
            >
              <X size={17} />
            </button>
          </div>
        </header>
        <div className="px-8 py-6">
          {syncError ? (
            <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-100">
              {syncError}
            </div>
          ) : null}
          {selectedEmail.bodyHtml && selectedEmail.bodyHtml.length > MAX_HTML_LENGTH ? (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
              Sehr große HTML-Mail wird aus Performance-Gründen als Text angezeigt.
            </div>
          ) : null}
          {selectedEmail.bodyHtml && (htmlView?.blockedRemoteImages ?? 0) > 0 ? (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <span>{htmlView?.blockedRemoteImages} externe Bilder wurden blockiert.</span>
              {settings.externalImages === "ask" ? (
                <button
                  type="button"
                  className="rounded-lg border border-amber-300/80 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 dark:border-amber-300/30 dark:hover:bg-amber-400/15"
                  onClick={() => setAllowExternalForCurrentMail(true)}
                >
                  Ja, Bilder laden
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            className="reader-content w-full leading-8 text-slate-800 dark:text-slate-100"
            style={{ fontSize: settings.fontSize }}
            dangerouslySetInnerHTML={htmlView?.html ? { __html: htmlView.html } : undefined}
            onClick={handleReaderClick}
          >
            {!htmlView?.html ? <pre className="whitespace-pre-wrap font-sans">{selectedEmail.bodyText || selectedEmail.preview}</pre> : null}
          </div>
          <section className="mt-5 rounded-xl border border-slate-200/70 px-4 py-3 dark:border-white/[0.08]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tags</div>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs ${active ? "text-white" : "text-slate-700 dark:text-slate-200"}`}
                    style={{ background: active ? tag.color : `${tag.color}22` }}
                    onClick={() => {
                      const next = active ? selectedTagIds.filter((id) => id !== tag.id) : [...selectedTagIds, tag.id];
                      void setEmailTags(selectedEmail.id, next);
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
              <button
                type="button"
                className="rounded-full border border-slate-200/70 px-3 py-1 text-xs hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.08]"
                onClick={() => {
                  const name = window.prompt("Neuer Tag-Name");
                  if (!name?.trim()) return;
                  const color = window.prompt("Farbe (z.B. #3b82f6)", "#3b82f6") ?? "#3b82f6";
                  void createTag(name.trim(), color);
                }}
              >
                + Tag
              </button>
            </div>
          </section>
          {selectedEmail.attachments.length > 0 ? (
            <section className="mt-8 border-t border-slate-200 pt-5 dark:border-white/10">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <Paperclip size={16} />
                Anhänge
              </h3>
              <div className="grid gap-2">
                {selectedEmail.attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <button
                      className="flex w-full items-center justify-between text-left text-sm transition-colors hover:text-[rgb(var(--accent))]"
                      onClick={() => void downloadAttachment(attachment.id, attachment.fileName)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{attachment.fileName}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {attachment.contentType} · {formatBytes(attachment.size)}
                        </span>
                      </span>
                      <Download size={16} />
                    </button>
                    {icsPreviews[attachment.id] ? (
                      <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-700 dark:bg-white/[0.06] dark:text-slate-300">
                        <div className="font-semibold">Kalendereinladung erkannt</div>
                        <div>Titel: {icsPreviews[attachment.id].title ?? "—"}</div>
                        <div>Start: {icsPreviews[attachment.id].start ?? "—"}</div>
                        <div>Ende: {icsPreviews[attachment.id].end ?? "—"}</div>
                        <div>Ort: {icsPreviews[attachment.id].location ?? "—"}</div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </article>
    </div>,
    document.body
  );

  async function downloadAttachment(attachmentId: number, fileName: string) {
    const destinationPath = await desktopDialog.save({ defaultPath: fileName });
    if (!destinationPath) return;
    await mailService.downloadAttachment(attachmentId, destinationPath);
  }
}

async function openExternalUrl(href: string) {
  if (!SAFE_LINK_SCHEME.test(href)) {
    window.alert("Unsicherer Link wurde blockiert.");
    return;
  }
  if (!(await confirmOpenExternalUrl(href))) return;
  if (isDesktop) {
    try {
      await invokeDesktop("open_external_link", { url: href });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Unbekannter Fehler");
      window.alert(`Link konnte aus Sicherheitsgründen nicht geöffnet werden.\n${message}`);
      return;
    }
  }
  const popup = window.open(href, "_blank", "noopener,noreferrer");
  if (!popup) {
    const fallback = document.createElement("a");
    fallback.href = href;
    fallback.target = "_blank";
    fallback.rel = "noopener noreferrer";
    fallback.style.display = "none";
    document.body.appendChild(fallback);
    fallback.click();
    fallback.remove();
  }
}

async function confirmOpenExternalUrl(href: string): Promise<boolean> {
  const domain = getUrlDomainLabel(href);
  const message = `Externer Link:\n${href}\n\nDomain: ${domain}\n\nMöchtest du diesen Link wirklich öffnen?`;
  if (isDesktop) {
    try {
      return await desktopDialog.confirm(message, {
        title: "Sicherheitsabfrage",
        kind: "warning",
        okLabel: "Link öffnen",
        cancelLabel: "Abbrechen"
      });
    } catch {
      // fall back to browser confirm
    }
  }
  return window.confirm(message);
}

function getUrlDomainLabel(href: string): string {
  try {
    const parsed = new URL(href);
    return parsed.hostname || "unbekannt";
  } catch {
    return "unbekannt";
  }
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

  linkifyPlainUrls(doc.body);

  if (!allowExternalImages) {
    for (const element of doc.body.querySelectorAll("*")) {
      for (const attr of ["src", "srcset", "poster", "background", "data", "xlink:href"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        if (attr === "srcset" ? hasRemoteSrcset(value) : isRemoteResource(value)) {
          element.removeAttribute(attr);
          blockedRemoteImages += 1;
        }
      }
      if (element.tagName !== "A") {
        const href = element.getAttribute("href");
        if (href && isRemoteResource(href)) {
          element.removeAttribute("href");
          blockedRemoteImages += 1;
        }
      }
    }
  }

  return { html: doc.body.innerHTML, blockedRemoteImages };
}

function linkifyPlainUrls(root: HTMLElement) {
  const urlPattern = /(https:\/\/[^\s<>"']+)/gi;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest("a, code, pre, script, style")) continue;
    if (!urlPattern.test(node.nodeValue ?? "")) continue;
    textNodes.push(node);
  }

  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    urlPattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = urlPattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const start = match.index;
      let end = start + fullMatch.length;
      let cleanUrl = fullMatch;

      while (/[),.;!?]$/.test(cleanUrl)) {
        cleanUrl = cleanUrl.slice(0, -1);
        end -= 1;
      }

      if (start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const link = document.createElement("a");
      link.href = cleanUrl;
      link.textContent = cleanUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      fragment.appendChild(link);

      if (end < start + fullMatch.length) {
        fragment.appendChild(document.createTextNode(text.slice(end, start + fullMatch.length)));
      }

      lastIndex = start + fullMatch.length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  }
}

function isRemoteResource(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("//");
}

function hasRemoteSrcset(value: string): boolean {
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0] ?? "")
    .some((candidate) => isRemoteResource(candidate));
}
