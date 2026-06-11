import { useEffect, useMemo, useState } from "react";
import { mailService } from "../services/mailService";
import type { AttachmentPreview, Email } from "../types";

type Props = {
  email: Email;
  onClose: () => void;
};

export function QuickLook({ email, onClose }: Props) {
  const [activeAttachmentId, setActiveAttachmentId] = useState<number | null>(email.attachments[0]?.id ?? null);
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);

  useEffect(() => {
    if (!activeAttachmentId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void mailService.getAttachmentPreview(activeAttachmentId).then((value) => {
      if (!cancelled) setPreview(value);
    });
    return () => {
      cancelled = true;
    };
  }, [activeAttachmentId]);

  const src = useMemo(() => {
    if (!preview) return undefined;
    return `data:${preview.contentType};base64,${preview.dataBase64}`;
  }, [preview]);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-8" onClick={onClose}>
      <div className="tr-panel grid h-[80vh] w-[80vw] grid-cols-[320px_1fr] gap-4 rounded-[10px] p-4 text-white" onClick={(event) => event.stopPropagation()}>
        <div className="overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-sm font-semibold">Quick Look</div>
          <div className="mb-2 text-xs text-slate-400">{email.sender}</div>
          <div className="mb-3 text-sm font-medium">{email.subject || "(Kein Betreff)"}</div>
          <div className="mb-4 whitespace-pre-wrap text-xs text-slate-300">{email.preview}</div>
          <div className="space-y-1">
            {email.attachments.map((attachment) => (
              <button
                key={attachment.id}
                className={`w-full rounded-lg px-2 py-1 text-left text-xs transition ${activeAttachmentId === attachment.id ? "bg-white/15" : "bg-white/[0.04] hover:bg-white/[0.1]"}`}
                onClick={() => setActiveAttachmentId(attachment.id)}
              >
                {attachment.fileName}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {!preview ? <div className="text-sm text-slate-400">Kein Vorschauformat verfügbar.</div> : null}
          {preview?.contentType.startsWith("image/") && src ? <img src={src} alt={preview.fileName} className="max-h-full max-w-full object-contain" /> : null}
          {preview?.contentType === "application/pdf" && src ? <iframe title={preview.fileName} src={src} className="h-full min-h-[60vh] w-full rounded-lg" /> : null}
          {preview?.contentType.startsWith("text/") && src ? (
            <pre className="whitespace-pre-wrap text-xs text-slate-200">{atob(preview.dataBase64)}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
