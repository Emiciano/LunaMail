// Demo-Bridge für Design-Screenshots: ersetzt window.electronAPI im Browser durch
// feste Beispieldaten, damit die Oberfläche ohne echtes Konto gezeigt werden kann.
// Wird nur von scripts/screenshots/capture.mjs per Playwright eingeschleust.
(() => {
  const theme = new URLSearchParams(location.search).get("theme") || "light";
  const now = Date.now();
  const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const accounts = [
    { id: 1, displayName: "Emilio", email: "emilio@hypnotic.one", provider: "custom", imapHost: "mail.hypnotic.one", imapPort: 993, imapSecure: true, smtpHost: "mail.hypnotic.one", smtpPort: 465, smtpSecure: true, username: "emilio@hypnotic.one", isDefault: true },
    { id: 2, displayName: "All Seasons Production", email: "info@allseasons.example", provider: "custom", imapHost: "imap.example", imapPort: 993, imapSecure: true, smtpHost: "smtp.example", smtpPort: 465, smtpSecure: true, username: "info", isDefault: false }
  ];
  const folders = [
    { id: 11, accountId: 1, name: "INBOX", remoteName: "INBOX", role: "inbox", unreadCount: 3 },
    { id: 12, accountId: 1, name: "Sent", remoteName: "Sent", role: "sent", unreadCount: 0 },
    { id: 13, accountId: 1, name: "Drafts", remoteName: "Drafts", role: "drafts", unreadCount: 0 },
    { id: 14, accountId: 1, name: "Archive", remoteName: "Archive", role: "archive", unreadCount: 0 },
    { id: 15, accountId: 1, name: "Trash", remoteName: "Trash", role: "trash", unreadCount: 0 },
    { id: 16, accountId: 1, name: "Projekte", remoteName: "Projekte", role: "custom", unreadCount: 1 },
    { id: 21, accountId: 2, name: "INBOX", remoteName: "INBOX", role: "inbox", unreadCount: 2 }
  ];
  const tags = [{ id: 1, name: "Projekt", color: "#3F6BF0" }, { id: 2, name: "Rechnung", color: "#F5A623" }];
  const mail = (id, sender, subject, preview, minutes, extra = {}) => ({
    id, accountId: 1, folderId: 11, messageId: `<${id}@demo>`, sender, recipients: "emilio@hypnotic.one", subject, preview,
    bodyText: `${preview}\n\nViele Grüße\n${sender.replace(/<.*>/, "").trim()}`,
    receivedAt: ago(minutes), isRead: false, isFavorite: false, isImportant: false, hasAttachments: false, attachments: [], tags: [], ...extra
  });
  let emails = [
    mail(101, "Hypnotic One <support@hypnotic.one>", "Dein Postfach ist eingerichtet", "Willkommen bei Hypnotic One. Deine Zugangsdaten für IMAP und SMTP findest du in dieser Nachricht.", 12),
    mail(102, "Lena Hoffmann <lena@studio.example>", "Drehplan für Freitag", "Hi Emilio, anbei der finale Drehplan. Treffpunkt ist um 8 Uhr am Studio, Catering ist bestellt.", 48, { hasAttachments: true, attachments: [{ id: 1, fileName: "Drehplan_Freitag.pdf", contentType: "application/pdf", size: 248_000 }], tags: [tags[0]], isFavorite: true }),
    mail(103, "GitHub <noreply@github.com>", "[LunaMail] Release android-latest veröffentlicht", "Ein neuer Build der Android-App steht zum Download bereit.", 130, { isRead: true }),
    mail(104, "Max Berger <max@agentur.example>", "Re: Angebot Imagefilm", "Danke für das Angebot! Wir würden gern nächste Woche telefonieren, passt dir Dienstag?", 60 * 20, { isRead: true, isImportant: true }),
    mail(105, "Deutsche Bahn <noreply@bahn.de>", "Ihre Buchungsbestätigung", "Vielen Dank für Ihre Buchung. Ihr Ticket finden Sie im Anhang.", 60 * 28, { isRead: true, hasAttachments: true, tags: [tags[1]] }),
    mail(106, "Sophie Wagner <sophie@example.com>", "Fotos vom Wochenende", "Hier sind die Bilder vom Samstag, die schönsten habe ich markiert.", 60 * 50, { isRead: true }),
    mail(107, "Adobe <mail@adobe.example>", "Ihre Rechnung für Oktober", "Ihre monatliche Rechnung für Creative Cloud ist jetzt verfügbar.", 60 * 80, { isRead: true }),
    mail(108, "Jonas Keller <jonas@example.com>", "Kurze Frage zum Schnitt", "Kannst du mir die Projektdatei von letzter Woche schicken? Ich finde sie nicht mehr.", 60 * 120, { isRead: true })
  ];
  const settings = {
    theme, accentColor: "white", layoutMode: "standard", fontSize: 16, syncIntervalMinutes: 15, externalImages: "never", senderLogos: true,
    allowLocalSecretFallback: false, notificationsEnabled: false, notificationSound: false, notificationPreview: false,
    runInBackground: true, accountNotifications: {}, accountAppearance: {}
  };
  const counts = { favorites: 1, important: 1, unread: 5, withAttachments: 2, today: 3, thisWeek: 8, perAccount: [{ accountId: 1, favorites: 1, important: 1 }, { accountId: 2, favorites: 0, important: 0 }] };
  const health = {
    sync: { queuePendingTotal: 0, queueFailedTotal: 0, queueInFlightTotal: 0, accounts: [
      { accountId: 1, idleActive: true, pollingActive: false, pollingIntervalSeconds: 900, queuePending: 0, queueFailed: 0, queueInFlight: 0, lastSyncAt: new Date(Date.now() - 60_000).toISOString(), lastSyncDurationMs: 1200, consecutiveFailures: 0 },
      { accountId: 2, idleActive: false, pollingActive: true, pollingIntervalSeconds: 900, queuePending: 0, queueFailed: 0, queueInFlight: 0, lastSyncAt: new Date(Date.now() - 360_000).toISOString(), lastSyncDurationMs: 2800, consecutiveFailures: 0 }
    ] },
    queue: { pending: 0, failed: 0, inFlight: 0 }, databaseSizeBytes: 18_400_000, totalMails: 1284, totalAttachments: 212,
    keyringAvailable: true, integrity: { duplicateMessageIds: 0, orphanAttachments: 0, accountFolderMismatches: 0 }
  };
  const handlers = {
    get_accounts: () => accounts,
    get_folders: () => folders,
    get_settings: () => settings,
    save_settings: ({ settings: next }) => Object.assign(settings, next),
    get_tags: () => tags,
    get_categories: () => [],
    get_rules: () => [],
    get_contacts: () => [],
    get_database_size: () => 18_400_000,
    get_health_status: () => health,
    get_mail_counts: () => counts,
    get_drafts: () => [],
    get_emails: () => emails.slice(),
    move_email: ({ id }) => { emails = emails.filter((email) => email.id !== id); },
    delete_email: ({ id }) => { emails = emails.filter((email) => email.id !== id); },
    search_emails: () => emails,
    get_email: ({ id }) => emails.find((email) => email.id === id),
    hydrate_email: ({ id }) => emails.find((email) => email.id === id),
    mark_email_read: () => undefined
  };
  const noop = () => Promise.resolve(undefined);
  // Platzhalter-Logos für die Demo (die echte App lädt sie im Hauptprozess).
  const demoLogos = { "hypnotic.one": ["#111111", "#FFFFFF", "H1"], "github.com": ["#24292F", "#FFFFFF", "GH"], "bahn.de": ["#FFFFFF", "#EC0016", "DB"], "adobe.example": ["#FA0F00", "#FFFFFF", "A"] };
  function demoLogo(address) {
    const entry = demoLogos[String(address).split("@").pop()];
    if (!entry) return null;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    context.fillStyle = entry[0];
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = entry[1];
    context.font = "800 54px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(entry[2], 64, 68);
    return canvas.toDataURL("image/png");
  }
  window.electronAPI = {
    senderLogo: (address) => Promise.resolve(demoLogo(address)),
    updates: {
      status: () => Promise.resolve({ status: "available", version: "0.9.60" }),
      check: () => Promise.resolve({ status: "available", version: "0.9.60" }),
      download: noop,
      install: () => Promise.resolve(false)
    },
    invoke: (command, args = {}) => Promise.resolve(handlers[command] ? handlers[command](args) : undefined),
    on: () => () => undefined,
    getVersion: () => Promise.resolve("0.9.58"),
    getReleaseHistory: () => Promise.resolve([]),
    openDialog: () => Promise.resolve(null),
    saveDialog: () => Promise.resolve(null),
    confirm: () => Promise.resolve(false),
    window: { minimize: noop, toggleMaximize: noop, isMaximized: () => Promise.resolve(false), startDragging: noop, setTheme: noop, show: noop, focus: noop, onMaximizedChange: () => () => undefined }
  };
})();
