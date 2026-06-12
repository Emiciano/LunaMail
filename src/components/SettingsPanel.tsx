import { ChevronDown, ExternalLink, Info, Pencil, Plus, ShieldCheck, Star, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { desktopDialog, isDesktop, listenDesktop, openExternalLink, type AppRelease, type AppUpdateStatus } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import type { AccentColor, Contact, DiagnoseAccountResult, DiagnoseInboxResult, MailRule, ServerMessageSummary, Settings, Tag } from "../types";
import packageJson from "../../package.json";
import { useShallow } from "zustand/react/shallow";

type Tab = "accounts" | "general" | "themes" | "security" | "sync" | "rules" | "contacts" | "tags" | "backup" | "about";

const accentOptions: { value: AccentColor; label: string; className: string }[] = [
  { value: "white", label: "Weiß", className: "border border-white/20 bg-white" },
  { value: "blue", label: "Blau", className: "bg-blue-600" },
  { value: "green", label: "Grün", className: "bg-green-600" },
  { value: "orange", label: "Orange", className: "bg-orange-600" },
  { value: "red", label: "Rot", className: "bg-red-600" },
  { value: "purple", label: "Lila", className: "bg-purple-600" },
  { value: "teal", label: "Türkis", className: "bg-teal-600" },
  { value: "pink", label: "Pink", className: "bg-pink-600" },
  { value: "gray", label: "Grau", className: "bg-slate-600" }
];

const accentVars: Record<AccentColor, CSSProperties> = {
  white: { "--accent": "255 255 255", "--accent-soft": "21 21 21", "--accent-contrast": "11 11 11" } as CSSProperties,
  blue: { "--accent": "37 99 235", "--accent-soft": "239 246 255", "--accent-contrast": "255 255 255" } as CSSProperties,
  green: { "--accent": "22 163 74", "--accent-soft": "240 253 244", "--accent-contrast": "255 255 255" } as CSSProperties,
  orange: { "--accent": "234 88 12", "--accent-soft": "255 247 237", "--accent-contrast": "255 255 255" } as CSSProperties,
  red: { "--accent": "220 38 38", "--accent-soft": "254 242 242", "--accent-contrast": "255 255 255" } as CSSProperties,
  purple: { "--accent": "147 51 234", "--accent-soft": "245 243 255", "--accent-contrast": "255 255 255" } as CSSProperties,
  teal: { "--accent": "13 148 136", "--accent-soft": "240 253 250", "--accent-contrast": "255 255 255" } as CSSProperties,
  pink: { "--accent": "219 39 119", "--accent-soft": "253 242 248", "--accent-contrast": "255 255 255" } as CSSProperties,
  gray: { "--accent": "71 85 105", "--accent-soft": "248 250 252", "--accent-contrast": "255 255 255" } as CSSProperties
};

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const {
    accounts,
    rules,
    contacts,
    tags,
    settings,
    selectedAccountId,
    selectedSpecialAccountId,
    mailCountsAccountId,
    mailCounts,
    updateSettings,
    loadRules,
    saveRule,
    deleteRule,
    loadContacts,
    saveContact,
    deleteContact,
    loadTags,
    saveTag,
    deleteTag,
    saveAccount,
    connectGoogleAccount,
    deleteAccount,
    testAccount,
    sync,
    syncError,
    syncStatus
  } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    rules: state.rules,
    contacts: state.contacts,
    tags: state.tags,
    settings: state.settings,
    selectedAccountId: state.selectedAccountId,
    selectedSpecialAccountId: state.selectedSpecialAccountId,
    mailCountsAccountId: state.mailCountsAccountId,
    mailCounts: state.mailCounts,
    updateSettings: state.updateSettings,
    loadRules: state.loadRules,
    saveRule: state.saveRule,
    deleteRule: state.deleteRule,
    loadContacts: state.loadContacts,
    saveContact: state.saveContact,
    deleteContact: state.deleteContact,
    loadTags: state.loadTags,
    saveTag: state.saveTag,
    deleteTag: state.deleteTag,
    saveAccount: state.saveAccount,
    connectGoogleAccount: state.connectGoogleAccount,
    deleteAccount: state.deleteAccount,
    testAccount: state.testAccount,
    sync: state.sync,
    syncError: state.syncError,
    syncStatus: state.syncStatus
  })));
  const [tab, setTab] = useState<Tab>("accounts");
  const [draft, setDraft] = useState<Settings>(settings);
  const [testNotificationStatus, setTestNotificationStatus] = useState<string | null>(null);
  const [provider, setProvider] = useState<"custom" | "gmail">("custom");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [message, setMessage] = useState("");
  const [googleAuthBusy, setGoogleAuthBusy] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<number | undefined>();
  const [appVersion, setAppVersion] = useState<string>(packageJson.version);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [releasesBusy, setReleasesBusy] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [diagnoseAccountId, setDiagnoseAccountId] = useState<number | undefined>();
  const [diagnoseAccount, setDiagnoseAccount] = useState<DiagnoseAccountResult | undefined>();
  const [diagnoseInbox, setDiagnoseInbox] = useState<DiagnoseInboxResult | undefined>();
  const [serverMessages, setServerMessages] = useState<ServerMessageSummary[]>([]);
  const [diagnoseBusy, setDiagnoseBusy] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | undefined>();
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactFavorite, setContactFavorite] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [tagFormOpen, setTagFormOpen] = useState(false);
  const [editingTagId, setEditingTagId] = useState<number | undefined>();
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#737373");
  const [tagError, setTagError] = useState<string | null>(null);
  const editingAccount = accounts.find((account) => account.id === editingAccountId);

  useEffect(() => {
    void loadRules(selectedAccountId);
    void loadContacts();
    void loadTags();
  }, [loadContacts, loadRules, loadTags, selectedAccountId]);

  useEffect(() => {
    if (!isDesktop) return;
    void window.electronAPI?.getVersion().then(setAppVersion).catch(() => setAppVersion(packageJson.version));
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    let unsubscribe = () => {};
    let disposed = false;
    void listenDesktop<AppUpdateStatus>("app-update-status", ({ payload }) => {
      setUpdateStatus(payload);
      if (payload.status === "checking" || payload.status === "downloading" || payload.status === "downloaded") {
        setUpdateBusy(true);
      }
      if (payload.status === "available" || payload.status === "not-available" || payload.status === "error") {
        setUpdateBusy(false);
      }
    }).then((removeListener) => {
      if (disposed) {
        removeListener();
        return;
      }
      unsubscribe = removeListener;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (tab !== "about" || !isDesktop || !window.electronAPI?.getReleaseHistory) return;
    let active = true;
    setReleasesBusy(true);
    setReleasesError(null);
    void window.electronAPI.getReleaseHistory()
      .then((items) => {
        if (active) setReleases(items);
      })
      .catch((error) => {
        if (active) setReleasesError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setReleasesBusy(false);
      });
    return () => {
      active = false;
    };
  }, [tab]);

  async function checkForAppUpdate() {
    if (!isDesktop || !window.electronAPI?.checkForUpdates) {
      setUpdateStatus({ status: "error", message: "Updates sind nur in der Desktop-App verfügbar." });
      return;
    }
    setUpdateBusy(true);
    setUpdateStatus({ status: "checking" });
    try {
      const result = await window.electronAPI.checkForUpdates() as { skipped?: boolean; reason?: string };
      if (result?.skipped) {
        setUpdateBusy(false);
        setUpdateStatus({
          status: "error",
          message: result.reason === "development"
            ? "Updates sind nur in der installierten Desktop-Version verfügbar."
            : "Update-Prüfung wurde übersprungen."
        });
      }
    } catch (error) {
      setUpdateBusy(false);
      setUpdateStatus({
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  function formatUpdateStatus(status: AppUpdateStatus | null): string {
    if (!status) return "Beim Start wird automatisch nach Updates gesucht.";
    switch (status.status) {
      case "checking":
        return "Suche nach Updates...";
      case "available":
        return `Version ${status.version} ist verfügbar. Bestätige die Installation im eingeblendeten Fenster.`;
      case "not-available":
        return "LunaMail ist auf dem neuesten Stand.";
      case "downloading":
        return `Update wird heruntergeladen... ${Math.round(status.percent)}%`;
      case "downloaded":
        return `Update ${status.version} ist bereit. Der Installer startet gleich...`;
      case "error":
        return `Update fehlgeschlagen: ${status.message}`;
      default:
        return "";
    }
  }

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (!accounts.length) {
      setDiagnoseAccountId(undefined);
      return;
    }
    setDiagnoseAccountId((current) => current ?? accounts[0]?.id);
  }, [accounts]);

  async function saveSettings() {
    await updateSettings(draft);
    onClose();
  }

  function applySettings(nextSettings: Settings) {
    setDraft(nextSettings);
    void updateSettings(nextSettings).catch((error) => {
      setMessage(`Einstellung konnte nicht gespeichert werden: ${String(error)}`);
    });
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("Konto wird gespeichert und synchronisiert...");
    try {
      await saveAccount({
        displayName: String(form.get("displayName")),
        email: String(form.get("email")).trim(),
        provider,
        username: String(form.get("username") || form.get("email")).trim(),
        imapHost: String(form.get("imapHost")).trim(),
        imapPort: Number(form.get("imapPort")),
        imapSecure: form.get("imapSecure") === "on",
        smtpHost: String(form.get("smtpHost")).trim(),
        smtpPort: Number(form.get("smtpPort")),
        smtpSecure: form.get("smtpSecure") === "on",
        password: String(form.get("password")),
        smtpPassword: String(form.get("smtpPassword") || form.get("password")),
        isDefault: accounts.length === 0
      });
      formElement.reset();
      setEditingAccountId(undefined);
      setShowAccountForm(false);
      setMessage("Konto gespeichert.");
    } catch (error) {
      setMessage(`Konto konnte nicht gespeichert werden: ${String(error)}`);
    }
  }

  async function connectGoogle() {
    const clientId = String(draft.googleOAuthClientId || "").trim();
    if (!clientId) {
      setMessage("Bitte zuerst die Google OAuth Desktop-Client-ID eintragen.");
      return;
    }
    setGoogleAuthBusy(true);
    setMessage("Google-Anmeldung wurde im Browser geöffnet...");
    try {
      await updateSettings({ ...draft, googleOAuthClientId: clientId });
      await connectGoogleAccount(clientId);
      setEditingAccountId(undefined);
      setShowAccountForm(false);
      setMessage("Google-Konto wurde erfolgreich verbunden.");
    } catch (error) {
      setMessage(`Google-Konto konnte nicht verbunden werden: ${String(error)}`);
    } finally {
      setGoogleAuthBusy(false);
    }
  }

  async function runDiagnoseAccount() {
    if (!diagnoseAccountId) return;
    setDiagnoseBusy(true);
    try {
      const result = await mailService.diagnoseAccount(diagnoseAccountId);
      setDiagnoseAccount(result);
    } catch (error) {
      setMessage(`Diagnose fehlgeschlagen: ${String(error)}`);
    } finally {
      setDiagnoseBusy(false);
    }
  }

  async function runDiagnoseInbox() {
    if (!diagnoseAccountId) return;
    setDiagnoseBusy(true);
    try {
      const result = await mailService.diagnoseInbox(diagnoseAccountId);
      setDiagnoseInbox(result);
    } catch (error) {
      setMessage(`Inbox-Diagnose fehlgeschlagen: ${String(error)}`);
    } finally {
      setDiagnoseBusy(false);
    }
  }

  async function runLatestServerMessages() {
    if (!diagnoseAccountId) return;
    setDiagnoseBusy(true);
    try {
      const result = await mailService.fetchLatestServerMessages(diagnoseAccountId, 10);
      setServerMessages(result);
    } catch (error) {
      setMessage(`Server-Mails konnten nicht geladen werden: ${String(error)}`);
    } finally {
      setDiagnoseBusy(false);
    }
  }

  async function runForceFullInboxSync() {
    if (!diagnoseAccountId) return;
    setDiagnoseBusy(true);
    try {
      const report = await mailService.forceFullInboxSync(diagnoseAccountId, 50);
      setMessage(`Vollständige Posteingangssynchronisierung: ${report.messagesSynced} Mails gespeichert.`);
      await sync(false);
      await runDiagnoseAccount();
      await runDiagnoseInbox();
    } catch (error) {
      setMessage(`Vollständige Posteingangssynchronisierung fehlgeschlagen: ${String(error)}`);
    } finally {
      setDiagnoseBusy(false);
    }
  }

  async function runForceIncrementalSync() {
    if (!diagnoseAccountId) return;
    setDiagnoseBusy(true);
    try {
      const report = await mailService.forceIncrementalSync(diagnoseAccountId);
      setMessage(`Synchronisierung neuer Nachrichten: ${report.messagesSynced} neue Mails.`);
      await sync(false);
      await runDiagnoseAccount();
    } catch (error) {
      setMessage(`Synchronisierung neuer Nachrichten fehlgeschlagen: ${String(error)}`);
    } finally {
      setDiagnoseBusy(false);
    }
  }

  async function createRule() {
    const name = window.prompt("Regelname", "Neue Regel");
    if (!name?.trim()) return;
    const field = (window.prompt("Feld: sender | subject | to", "sender") ?? "sender") as MailRule["field"];
    const value = window.prompt("Wert enthält", "") ?? "";
    if (!value.trim()) return;
    const actionType = (window.prompt("Aktion: tag | favorite | important | read | move", "tag") ?? "tag") as MailRule["actionType"];
    const actionValue = window.prompt("Aktionswert (z.B. Tagname oder Ordner-ID/Rolle)", actionType === "tag" ? "Rechnung" : "");
    await saveRule({
      accountId: selectedAccountId,
      name: name.trim(),
      field,
      operator: "contains",
      value: value.trim(),
      actionType,
      actionValue: actionValue?.trim() || undefined,
      enabled: true,
      priority: 0
    });
  }

  function openContactForm(contact?: Contact) {
    setEditingContactId(contact?.id);
    setContactName(contact?.name ?? "");
    setContactEmail(contact?.email ?? "");
    setContactFavorite(contact?.isFavorite ?? false);
    setContactError(null);
    setContactFormOpen(true);
  }

  function closeContactForm() {
    setContactFormOpen(false);
    setEditingContactId(undefined);
    setContactName("");
    setContactEmail("");
    setContactFavorite(false);
    setContactError(null);
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = contactEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactError("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    try {
      await saveContact({
        id: editingContactId,
        name: contactName.trim(),
        email,
        isFavorite: contactFavorite
      });
      closeContactForm();
      setMessage(editingContactId ? "Kontakt gespeichert." : "Kontakt erstellt.");
    } catch (error) {
      setContactError(error instanceof Error ? error.message : String(error));
    }
  }

  function openTagForm(tag?: Tag) {
    setEditingTagId(tag?.id);
    setTagName(tag?.name ?? "");
    setTagColor(tag?.color ?? "#737373");
    setTagError(null);
    setTagFormOpen(true);
  }

  function closeTagForm() {
    setTagFormOpen(false);
    setEditingTagId(undefined);
    setTagName("");
    setTagColor("#737373");
    setTagError(null);
  }

  async function submitTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) {
      setTagError("Bitte einen Namen für den Tag eingeben.");
      return;
    }
    try {
      await saveTag(editingTagId ? { id: editingTagId, name, color: tagColor } : { name, color: tagColor });
      closeTagForm();
      setMessage(editingTagId ? "Tag gespeichert." : "Tag erstellt.");
    } catch (error) {
      setTagError(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportBackupToFile() {
    const path = await desktopDialog.save({
      title: "Backup exportieren",
      defaultPath: `lunamail-backup-${new Date().toISOString().slice(0, 10)}.json`
    });
    if (!path) return;
    await mailService.exportBackupToFile(path);
    setMessage(`Backup exportiert: ${path}`);
  }

  async function importBackupFromFile() {
    const file = await desktopDialog.open({
      title: "Backup importieren",
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (!file || Array.isArray(file)) return;
    await mailService.importBackupFromFile(String(file));
    setMessage("Datensicherung importiert. Konten ohne Passwort bleiben unverändert.");
    await sync(true);
    await loadRules(selectedAccountId);
    await loadContacts();
  }

  return createPortal(
    <div
      className="flex items-center justify-center bg-black/72 p-6"
      style={{ position: "fixed", inset: 0, zIndex: 2147483647, ...accentVars[draft.accentColor] }}
    >
      <section className="tr-panel flex h-[min(760px,calc(100vh-2rem))] w-[min(980px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[10px]">
        <header className="flex h-16 items-center justify-between border-b border-white/[0.06] px-6">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Einstellungen</h2>
            <p className="text-xs text-white/45">LunaMail im minimalistischen Desktop-Stil</p>
          </div>
          <button className="rounded-lg p-2 text-white/55 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white" onClick={onClose} title="Schließen">
            <X size={18} />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
          <nav className="border-r border-white/[0.06] bg-[#0B0B0B] p-4">
            <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} label="Konten" />
            <TabButton active={tab === "general"} onClick={() => setTab("general")} label="Allgemein" />
            <TabButton active={tab === "themes"} onClick={() => setTab("themes")} label="Design" />
            <TabButton active={tab === "security"} onClick={() => setTab("security")} label="Sicherheit" />
            <TabButton active={tab === "sync"} onClick={() => setTab("sync")} label="Synchronisierung" />
            <TabButton active={tab === "rules"} onClick={() => setTab("rules")} label="Regeln" />
            <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")} label="Kontakte" />
            <TabButton active={tab === "tags"} onClick={() => setTab("tags")} label="Tags" />
            <TabButton active={tab === "backup"} onClick={() => setTab("backup")} label="Datensicherung" />
            <TabButton active={tab === "about"} onClick={() => setTab("about")} label="Über" />
          </nav>
          <div className="mail-scroll min-h-0 overflow-y-auto bg-[#111] p-6 text-white">
            {tab === "accounts" ? (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Vorhandene Konten</h3>
                  <div className="grid gap-3">
                    {accounts.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                        Noch kein Konto verbunden
                      </div>
                    ) : null}
                    {accounts.map((account) => (
                      <div key={account.id} className="rounded-2xl border border-slate-200/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{account.displayName}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">{account.email}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {account.provider} · {account.imapHost}:{account.imapPort} · {account.smtpHost}:{account.smtpPort}
                            </div>
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={draft.accountNotifications?.[String(account.id)] ?? true}
                                onChange={(event) =>
                                  applySettings({
                                    ...draft,
                                    accountNotifications: {
                                      ...draft.accountNotifications,
                                      [String(account.id)]: event.target.checked
                                    }
                                  })
                                }
                                className="h-4 w-4 accent-[rgb(var(--accent))]"
                              />
                              Benachrichtigungen für dieses Konto
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="rounded-xl border border-slate-200/70 px-3 py-2 text-sm hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.055]"
                              onClick={() => {
                                setEditingAccountId(account.id);
                                setProvider(account.provider === "gmail" ? "gmail" : "custom");
                                setShowAccountForm(true);
                                setMessage(account.authType === "oauth2"
                                  ? "Google-Konto erneut anmelden, um die Berechtigung zu erneuern."
                                  : "Passwort neu eingeben und speichern, um den Keyring-Eintrag zu erneuern.");
                              }}
                              title="Bearbeiten"
                            >
                              <Pencil size={16} />
                            </button>
                            <button className="rounded-xl border border-slate-200/70 px-3 py-2 text-sm hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.055]" onClick={() => void testAccount(account.id)}>
                              Testen
                            </button>
                            <button className="rounded-lg border border-white/[0.06] px-3 py-2 text-sm text-white/55 hover:bg-white/[0.05] hover:text-white" onClick={() => void deleteAccount(account.id)} title="Löschen">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                {showAccountForm ? (
                  <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                    <div className="mb-4 flex items-center gap-2">
                      <Plus size={17} />
                      <h3 className="font-semibold">{editingAccount ? "Konto bearbeiten" : "Neues Konto anlegen"}</h3>
                    </div>
                    <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Anbieter</div>
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <button type="button" className={providerButton(provider === "custom")} onClick={() => setProvider("custom")}>IMAP</button>
                      <button type="button" className={providerButton(provider === "gmail")} onClick={() => setProvider("gmail")}>Gmail hinzufügen</button>
                    </div>
                    {provider === "gmail" ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-white/[0.06] bg-[#151515] px-4 py-3 text-sm text-white/70">
                          LunaMail öffnet die sichere Google-Anmeldung im Standardbrowser. E-Mail-Adresse, Passwort und Bestätigung werden ausschließlich bei Google eingegeben.
                        </div>
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">Google OAuth Desktop-Client-ID</span>
                          <input
                            value={draft.googleOAuthClientId ?? ""}
                            onChange={(event) => setDraft({ ...draft, googleOAuthClientId: event.target.value })}
                            placeholder="123456789-abc.apps.googleusercontent.com"
                            className="h-11 w-full rounded-lg border border-white/[0.06] bg-[#151515] px-3 text-sm text-white outline-none focus:border-white/[0.16]"
                          />
                          <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">
                            Einmalige App-Konfiguration aus der Google Cloud Console. Typ: Desktop-App.
                          </span>
                        </label>
                        <button
                          type="button"
                          className="accent-primary flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[rgb(var(--accent)/0.45)] px-4 font-semibold transition-colors disabled:cursor-wait disabled:opacity-60"
                          disabled={googleAuthBusy}
                          onClick={() => void connectGoogle()}
                        >
                          <span className="text-xl font-bold text-[rgb(var(--accent-contrast))]">G</span>
                          {googleAuthBusy ? "Google-Anmeldung läuft..." : editingAccount ? "Erneut mit Google anmelden" : "Mit Google anmelden"}
                        </button>
                      </div>
                    ) : (
                      <form key={editingAccount?.id ?? provider} onSubmit={submitAccount} className="grid grid-cols-2 gap-4">
                        <Field name="displayName" label="Name" defaultValue={editingAccount?.displayName} required />
                        <Field name="email" label="E-Mail" type="email" defaultValue={editingAccount?.email} required />
                        <Field name="username" label="Benutzername (meist volle E-Mail)" defaultValue={editingAccount?.username ?? editingAccount?.email} />
                        <Field name="imapHost" label="IMAP-Server" defaultValue={editingAccount?.imapHost ?? ""} required />
                        <Field name="imapPort" label="IMAP Port" type="number" defaultValue={String(editingAccount?.imapPort ?? 993)} required />
                        <CheckboxField name="imapSecure" label="IMAP SSL/TLS" defaultChecked={editingAccount?.imapSecure ?? true} />
                        <Field name="smtpHost" label="SMTP-Server" defaultValue={editingAccount?.smtpHost ?? ""} required />
                        <Field name="smtpPort" label="SMTP Port" type="number" defaultValue={String(editingAccount?.smtpPort ?? 465)} required />
                        <CheckboxField name="smtpSecure" label="SMTP SSL/TLS" defaultChecked={editingAccount?.smtpSecure ?? true} />
                        <Field name="password" label={editingAccount ? "IMAP Passwort (neu eingeben)" : "IMAP Passwort"} type="password" required />
                        <Field name="smtpPassword" label="SMTP Passwort" type="password" />
                        <div className="col-span-2 flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-xl px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/8"
                            onClick={() => {
                              setEditingAccountId(undefined);
                              setShowAccountForm(false);
                            }}
                          >
                            Abbrechen
                          </button>
                          <button className="accent-primary rounded-lg px-4 py-2 text-sm font-semibold">Speichern</button>
                        </div>
                      </form>
                    )}
                    {provider === "gmail" ? (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          className="rounded-xl px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/8"
                          onClick={() => {
                            setEditingAccountId(undefined);
                            setShowAccountForm(false);
                          }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/70 px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:bg-white/[0.055]"
                    onClick={() => {
                      setEditingAccountId(undefined);
                      setProvider("custom");
                      setShowAccountForm(true);
                      setMessage("");
                    }}
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.08] text-white">
                      <Plus size={17} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">Neues Konto anlegen</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">IMAP-/SMTP-Konto hinzufügen</span>
                    </span>
                  </button>
                )}
              </div>
            ) : null}
            {tab === "general" ? (
              <div className="space-y-6">
                <SettingsSection title="Darstellung" description="Passe Lesbarkeit und Dichte der Oberfläche an.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="rounded-xl border border-white/[0.07] bg-[#151515] p-4">
                      <span className="flex items-center justify-between text-sm font-medium">
                        Schriftgröße
                        <span className="rounded-md bg-white/[0.07] px-2 py-1 text-xs text-white/65">{draft.fontSize}px</span>
                      </span>
                      <input
                        type="range"
                        min="14"
                        max="22"
                        value={draft.fontSize}
                        onChange={(event) => {
                          const fontSize = Number(event.target.value);
                          setDraft({ ...draft, fontSize });
                          document.documentElement.style.setProperty("--app-font-size", `${fontSize}px`);
                        }}
                        onPointerUp={(event) => applySettings({ ...draft, fontSize: Number(event.currentTarget.value) })}
                        onBlur={(event) => applySettings({ ...draft, fontSize: Number(event.currentTarget.value) })}
                        className="mt-4 w-full accent-[rgb(var(--accent))]"
                      />
                    </label>
                    <div className="space-y-3">
                      <ModernSelect label="Darstellung" value={draft.layoutMode} onChange={(value) => applySettings({ ...draft, layoutMode: value as Settings["layoutMode"] })} options={[["compact", "Kompakt"], ["standard", "Standard"], ["comfortable", "Komfortabel"]]} />
                      <ModernSelect label="Externe Bilder" value={draft.externalImages} onChange={(value) => applySettings({ ...draft, externalImages: value as Settings["externalImages"] })} options={[["never", "Nie laden"], ["ask", "Fragen"], ["always", "Immer laden"]]} />
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection title="Konto & App" description="Lege das Standardkonto und das Verhalten beim Schließen fest.">
                  <ModernSelect label="Standardkonto" value={String(draft.defaultAccountId ?? "")} onChange={(value) => setDraft({ ...draft, defaultAccountId: Number(value) })} options={accounts.map((account) => [String(account.id), account.email])} />
                  <ModernToggle
                    label="Im Hintergrund weiterlaufen"
                    description="LunaMail bleibt im Windows-Infobereich aktiv und synchronisiert weiter."
                    checked={draft.runInBackground ?? true}
                    onChange={(checked) => applySettings({ ...draft, runInBackground: checked })}
                  />
                </SettingsSection>

                <SettingsSection title="Benachrichtigungen" description="Bestimme, welche Informationen Windows anzeigen darf.">
                  <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-[#151515]">
                    <ModernToggle label="Desktop-Benachrichtigungen" description="Zeigt neue Nachrichten im Windows-Benachrichtigungscenter." checked={draft.notificationsEnabled} onChange={(checked) => applySettings({ ...draft, notificationsEnabled: checked })} flat />
                    <ModernToggle label="Benachrichtigungston" description="Spielt bei neuen Nachrichten einen kurzen Ton ab." checked={draft.notificationSound} onChange={(checked) => applySettings({ ...draft, notificationSound: checked })} flat />
                    <ModernToggle label="Vorschautext anzeigen" description="Zeigt Absender und Betreff in der Benachrichtigung." checked={draft.notificationPreview} onChange={(checked) => applySettings({ ...draft, notificationPreview: checked })} flat />
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                    onClick={() => {
                      setTestNotificationStatus("Sende Test...");
                      void mailService.testDesktopNotification()
                        .then((message: string) => setTestNotificationStatus(message))
                        .catch((error: unknown) => setTestNotificationStatus(error instanceof Error ? error.message : String(error)));
                    }}
                  >
                    Testbenachrichtigung senden
                  </button>
                  {testNotificationStatus ? <p className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-white/60">{testNotificationStatus}</p> : null}
                </SettingsSection>
              </div>
            ) : null}
            {tab === "themes" ? (
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Dunkelmodus</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Wechselt die Oberfläche sofort und speichert die Einstellung.</p>
                    </div>
                    <button
                      type="button"
                      className={`relative h-8 w-14 rounded-full transition-colors duration-150 ${
                        draft.theme === "dark" ? "bg-[rgb(var(--accent))]" : "bg-white/16"
                      }`}
                      onClick={() => applySettings({ ...draft, theme: draft.theme === "dark" ? "light" : "dark" })}
                      aria-pressed={draft.theme === "dark"}
                    >
                      <span
                        className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-[rgb(var(--accent-contrast))] shadow-sm transition-transform duration-150 ${
                          draft.theme === "dark" ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </section>
                <section>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Akzentfarbe</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {accentOptions.map((option) => {
                      const active = draft.accentColor === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            active
                              ? "border-transparent bg-[rgb(var(--accent-soft))] shadow-none ring-1 ring-[rgb(var(--accent)/0.25)] dark:bg-[rgb(var(--accent)/0.16)]"
                              : "border-slate-200/70 hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.055]"
                          }`}
                          onClick={() => applySettings({ ...draft, accentColor: option.value })}
                        >
                          <span className={`h-6 w-6 rounded-full ${option.className}`} />
                          <span className="font-medium">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Vorschau</div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-[rgb(var(--accent-contrast))]">Neue Mail</span>
                    <span className="rounded-lg bg-white/[0.08] px-4 py-3 text-sm">
                      Ausgewählte Mail
                    </span>
                  </div>
                </section>
              </div>
            ) : null}
            {tab === "security" ? (
              <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex gap-3 rounded-2xl border border-slate-200/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <ShieldCheck size={20} />
                  <div>Passwörter werden in der Windows-Anmeldeinformationsverwaltung gespeichert und niemals in SQLite abgelegt.</div>
                </div>
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <div>
                    <div className="font-medium text-slate-700 dark:text-slate-200">Lokalen Passwort-Fallback erlauben</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Wenn deaktiviert, werden Passwörter nur über den Windows-Benutzerschutz gelesen.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`relative h-8 w-14 rounded-full transition-colors duration-150 ${
                      draft.allowLocalSecretFallback ? "bg-[rgb(var(--accent))]" : "bg-white/16"
                    }`}
                    onClick={() => applySettings({ ...draft, allowLocalSecretFallback: !draft.allowLocalSecretFallback })}
                    aria-pressed={draft.allowLocalSecretFallback}
                  >
                    <span
                      className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-[rgb(var(--accent-contrast))] shadow-sm transition-transform duration-150 ${
                        draft.allowLocalSecretFallback ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
                <div>IMAP/SMTP erzwingen TLS. Zertifikate werden vom nativen TLS-Stack validiert.</div>
                <div>Externe Bilder folgen der Einstellung (Nie/Fragen/Immer); HTML wird vor der Anzeige sanitisiert.</div>
              </div>
            ) : null}
            {tab === "sync" ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/70 px-3 py-2 dark:border-white/[0.08]">
                  <span>Automatische Synchronisierung</span>
                  <span className="font-medium">Alle 30 Sekunden</span>
                </div>
                <div className="rounded-2xl border border-slate-200/70 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <div className="font-medium">Status</div>
                  <div className="mt-1 whitespace-pre-wrap text-slate-500 dark:text-slate-400">{syncError || syncStatus || "Bereit"}</div>
                </div>
                <button
                  className="accent-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={accounts.length === 0}
                  onClick={() => void sync(true)}
                >
                  Sync starten
                </button>
                <section className="rounded-2xl border border-slate-200/70 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <div className="mb-3 font-medium">Synchronisierungsdiagnose</div>
                  <label className="mb-3 flex items-center justify-between gap-4">
                    <span>Konto</span>
                    <select
                      className="min-w-56 rounded-xl border border-slate-200/70 bg-transparent px-3 py-2 dark:border-white/[0.08]"
                      value={diagnoseAccountId ?? ""}
                      onChange={(event) => setDiagnoseAccountId(Number(event.target.value))}
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.email}</option>
                      ))}
                    </select>
                  </label>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button className="rounded-xl border border-slate-200/70 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.08]" disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runDiagnoseAccount()}>
                      Sync testen
                    </button>
                    <button className="rounded-xl border border-slate-200/70 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.08]" disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runDiagnoseInbox()}>
                      Posteingangs-UIDs prüfen
                    </button>
                    <button className="rounded-xl border border-slate-200/70 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.08]" disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runLatestServerMessages()}>
                      Letzte 10 Server-Mails anzeigen
                    </button>
                    <button className="rounded-xl border border-slate-200/70 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.08]" disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runForceFullInboxSync()}>
                      Vollständigen Posteingang synchronisieren
                    </button>
                    <button className="rounded-xl border border-slate-200/70 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.08]" disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runForceIncrementalSync()}>
                      Neue Nachrichten synchronisieren
                    </button>
                  </div>
                  {diagnoseAccount ? (
                    <div className="grid gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Kontodiagnose</div>
                      <DiagRow label="Konto-ID" value={String(diagnoseAccount.accountId)} />
                      <DiagRow label="E-Mail" value={diagnoseAccount.email} />
                      <DiagRow label="IMAP" value={`${diagnoseAccount.imapHost}:${diagnoseAccount.imapPort} · ${diagnoseAccount.imapSecure ? "TLS" : "Plain"}`} />
                      <DiagRow label="Anmeldung" value={diagnoseAccount.loginStatus} />
                      <DiagRow label="Posteingang" value={diagnoseAccount.inboxRemoteName ?? "—"} />
                      <DiagRow label="Lokale UID" value={String(diagnoseAccount.lastKnownUid ?? "—")} />
                      <DiagRow label="Server UID" value={String(diagnoseAccount.highestUidOnServer ?? "—")} />
                      <DiagRow label="Lokale Posteingangsmails" value={String(diagnoseAccount.localInboxMails)} />
                      <DiagRow label="Letzte Synchronisierung" value={diagnoseAccount.lastSyncAt ?? "—"} />
                      <DiagRow label="Letzter Fehler" value={diagnoseAccount.lastSyncError ?? "—"} />
                      <div className="mt-1 flex gap-2">
                        <DiagBadge label="IDLE" active={diagnoseAccount.idleActive} />
                        <DiagBadge label="Polling" active={diagnoseAccount.pollingActive} />
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Smart-Counts Diagnose</div>
                    <DiagRow label="Aktives Konto" value={String(selectedAccountId ?? "—")} />
                    <DiagRow label="Konto der Spezialansicht" value={String(selectedSpecialAccountId ?? "—")} />
                    <DiagRow label="Konto der Zähler" value={String(mailCountsAccountId ?? "—")} />
                    <DiagRow label="Ungelesen / Anhang" value={`${mailCounts.unread} / ${mailCounts.withAttachments}`} />
                    <DiagRow label="Heute / Diese Woche" value={`${mailCounts.today} / ${mailCounts.thisWeek}`} />
                  </div>
                  {diagnoseInbox ? (
                    <div className="mt-2 grid gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Posteingangsdiagnose</div>
                      <DiagRow label="Posteingang" value={diagnoseInbox.inboxRemoteName ?? "—"} />
                      <DiagRow label="Lokale UID" value={String(diagnoseInbox.lastKnownUid ?? "—")} />
                      <DiagRow label="Server UID" value={String(diagnoseInbox.highestUidOnServer ?? "—")} />
                      <DiagRow label="Lokale Posteingangsmails" value={String(diagnoseInbox.localInboxMails)} />
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mailboxen</div>
                      <div className="mail-scroll max-h-32 overflow-auto rounded-lg border border-slate-200/70 bg-white/70 p-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                        {diagnoseInbox.mailboxes.map((mailbox) => (
                          <div key={mailbox.name} className="mb-1 last:mb-0">
                            <div className="font-medium">{mailbox.name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{mailbox.inferredRole}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {serverMessages.length > 0 ? (
                    <div className="mt-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Letzte Server-Mails</div>
                      <div className="mail-scroll max-h-40 overflow-auto rounded-lg border border-slate-200/70 bg-white/70 p-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                        {serverMessages.map((mail) => (
                          <div key={`${mail.uid}-${mail.messageId}`} className="mb-2 rounded-lg border border-slate-200/70 px-2 py-1.5 last:mb-0 dark:border-white/[0.08]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">UID {mail.uid}</span>
                              <DiagBadge label={mail.seen ? "Seen" : "Unseen"} active={!mail.seen} />
                            </div>
                            <div className="truncate text-[11px]">{mail.subject || "(Kein Betreff)"}</div>
                            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{mail.sender}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
            {tab === "rules" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Regeln & Automatisierung</h3>
                  <button className="accent-primary rounded-lg px-3 py-2 text-xs font-semibold" onClick={() => void createRule()}>
                    Regel hinzufügen
                  </button>
                </div>
                {rules.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/70 p-4 text-sm text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
                    Noch keine Regeln vorhanden.
                  </div>
                ) : null}
                <div className="grid gap-2">
                  {rules.map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-slate-200/70 p-3 text-sm dark:border-white/[0.08]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{rule.name}</div>
                        <button className="rounded-lg border border-white/[0.06] px-2 py-1 text-xs text-white/55 hover:bg-white/[0.05] hover:text-white" onClick={() => void deleteRule(rule.id)}>
                          Löschen
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Wenn {rule.field} {rule.operator} &quot;{rule.value}&quot; → {rule.actionType}
                        {rule.actionValue ? ` (${rule.actionValue})` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {tab === "contacts" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Kontakte</h3>
                    <p className="mt-1 text-xs text-white/45">Gespeicherte Kontakte werden beim Verfassen vorgeschlagen.</p>
                  </div>
                  <button className="accent-primary rounded-lg px-3 py-2 text-xs font-semibold" onClick={() => openContactForm()}>
                    Kontakt hinzufügen
                  </button>
                </div>
                {contactFormOpen ? (
                  <form className="rounded-2xl border border-white/[0.08] bg-[#151515] p-4" onSubmit={(event) => void submitContact(event)}>
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-semibold">{editingContactId ? "Kontakt bearbeiten" : "Neuen Kontakt erstellen"}</h4>
                      <button type="button" className="rounded-lg p-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white" onClick={closeContactForm}>
                        <X size={16} />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-white/55">Name</span>
                        <input
                          className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#111] px-3 text-sm outline-none focus:border-white/20"
                          value={contactName}
                          onChange={(event) => setContactName(event.target.value)}
                          placeholder="Max Mustermann"
                          autoFocus
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-white/55">E-Mail-Adresse</span>
                        <input
                          type="email"
                          required
                          className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#111] px-3 text-sm outline-none focus:border-white/20"
                          value={contactEmail}
                          onChange={(event) => setContactEmail(event.target.value)}
                          placeholder="max@example.de"
                        />
                      </label>
                    </div>
                    <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-white/65">
                      <input type="checkbox" checked={contactFavorite} onChange={(event) => setContactFavorite(event.target.checked)} className="mail-checkbox h-4 w-4" />
                      Als Favorit markieren
                    </label>
                    {contactError ? <p className="mt-3 text-xs text-red-300">{contactError}</p> : null}
                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" className="rounded-lg px-3 py-2 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white" onClick={closeContactForm}>Abbrechen</button>
                      <button type="submit" className="accent-primary rounded-lg px-4 py-2 text-xs font-semibold">Kontakt speichern</button>
                    </div>
                  </form>
                ) : null}
                {contacts.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/70 p-4 text-sm text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
                    Noch keine Kontakte gespeichert.
                  </div>
                ) : null}
                <div className="grid gap-2">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="rounded-xl border border-slate-200/70 p-3 text-sm dark:border-white/[0.08]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold">
                            {(contact.name || contact.email).charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium">
                              <span className="truncate">{contact.name || contact.email}</span>
                              {contact.isFavorite ? <Star size={13} className="shrink-0 fill-[rgb(var(--accent))] text-[rgb(var(--accent))]" /> : null}
                            </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{contact.email}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Letzter Kontakt: {contact.lastContactAt ? new Date(contact.lastContactAt).toLocaleString() : "—"} · Nutzungen: {contact.usageCount}
                          </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button className="rounded-lg border border-white/[0.06] p-2 text-white/55 hover:bg-white/[0.05] hover:text-white" title="Bearbeiten" onClick={() => openContactForm(contact)}>
                            <Pencil size={14} />
                          </button>
                          <button className="rounded-lg border border-red-500/20 p-2 text-red-300 hover:bg-red-500/10" title="Löschen" onClick={() => void deleteContact(contact.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {tab === "tags" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tags</h3>
                    <p className="mt-1 text-xs text-white/45">Erstelle frei benennbare Tags und ordne sie ausgewählten Mails zu.</p>
                  </div>
                  <button className="accent-primary rounded-lg px-3 py-2 text-xs font-semibold" onClick={() => openTagForm()}>
                    Tag hinzufügen
                  </button>
                </div>
                {tagFormOpen ? (
                  <form className="rounded-2xl border border-white/[0.08] bg-[#151515] p-4" onSubmit={(event) => void submitTag(event)}>
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-semibold">{editingTagId ? "Tag bearbeiten" : "Neuen Tag erstellen"}</h4>
                      <button type="button" className="rounded-lg p-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white" onClick={closeTagForm}>
                        <X size={16} />
                      </button>
                    </div>
                    <div className="grid items-end gap-3 sm:grid-cols-[1fr_120px]">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-white/55">Name</span>
                        <input
                          required
                          maxLength={40}
                          className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#111] px-3 text-sm outline-none focus:border-white/20"
                          value={tagName}
                          onChange={(event) => setTagName(event.target.value)}
                          placeholder="z. B. Rechnung"
                          autoFocus
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-white/55">Farbe</span>
                        <input
                          type="color"
                          className="h-10 w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#111] p-1"
                          value={tagColor}
                          onChange={(event) => setTagColor(event.target.value)}
                        />
                      </label>
                    </div>
                    {tagError ? <p className="mt-3 text-xs text-red-300">{tagError}</p> : null}
                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" className="rounded-lg px-3 py-2 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white" onClick={closeTagForm}>Abbrechen</button>
                      <button type="submit" className="accent-primary rounded-lg px-4 py-2 text-xs font-semibold">Tag speichern</button>
                    </div>
                  </form>
                ) : null}
                {tags.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.08] p-4 text-sm text-white/45">Noch keine Tags vorhanden.</div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {tags.map((tag) => (
                    <div key={tag.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                        <span className="truncate text-sm font-medium">{tag.name}</span>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button className="rounded-lg border border-white/[0.06] p-2 text-white/55 hover:bg-white/[0.05] hover:text-white" title="Bearbeiten" onClick={() => openTagForm(tag)}>
                          <Pencil size={14} />
                        </button>
                        <button className="rounded-lg border border-red-500/20 p-2 text-red-300 hover:bg-red-500/10" title="Löschen" onClick={() => void deleteTag(tag.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {tab === "backup" ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Datensicherung und Wiederherstellung</h3>
                <div className="rounded-2xl border border-slate-200/70 p-4 text-sm text-slate-600 dark:border-white/[0.08] dark:text-slate-300">
                  Exportiert Konten ohne Passwörter, Einstellungen, Regeln, Kontakte und Schlagwörter. Passwörter bleiben geschützt gespeichert.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="accent-primary rounded-lg px-4 py-2 text-sm font-semibold" onClick={() => void exportBackupToFile()}>
                    Datensicherung exportieren
                  </button>
                  <button className="rounded-xl border border-slate-200/70 px-4 py-2 text-sm hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.08]" onClick={() => void importBackupFromFile()}>
                    Datensicherung importieren
                  </button>
                </div>
              </div>
            ) : null}
            {tab === "about" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200/70 p-5 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <div className="flex items-start gap-4">
                    <img src="./icon.png" alt="" className="h-14 w-14 rounded-2xl shadow-sm" />
                    <div>
                      <div className="flex items-center gap-2 text-lg font-semibold">
                        <Info size={18} />
                        LunaMail
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Moderner E-Mail-Client für Windows</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-200/70 px-3 py-2 text-sm text-slate-600 dark:border-white/[0.08] dark:text-slate-300">
                    Installierte Version: <span className="font-semibold text-slate-800 dark:text-white">{appVersion}</span>
                  </div>
                  {isDesktop ? (
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        className="accent-primary w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={updateBusy}
                        onClick={() => void checkForAppUpdate()}
                      >
                        {updateBusy ? "Update wird verarbeitet..." : "Auf Updates prüfen"}
                      </button>
                      <p className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300">
                        {formatUpdateStatus(updateStatus)}
                      </p>
                      {updateStatus?.status === "downloading" ? (
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, updateStatus.percent))}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-slate-200/70 p-5 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Versionsverlauf</h3>
                      <p className="mt-1 text-xs text-white/45">Letzte veröffentlichte Versionen</p>
                    </div>
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/55">{releases.length}</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {releasesBusy ? (
                      <div className="rounded-xl border border-white/[0.06] px-3 py-3 text-xs text-white/45">Versionen werden geladen...</div>
                    ) : null}
                    {releasesError ? (
                      <div className="rounded-xl border border-white/[0.08] px-3 py-3 text-xs text-white/60">{releasesError}</div>
                    ) : null}
                    {!releasesBusy && !releasesError && releases.length === 0 ? (
                      <div className="rounded-xl border border-white/[0.06] px-3 py-3 text-xs text-white/45">Keine Versionen gefunden.</div>
                    ) : null}
                    {releases.map((release) => (
                      <button
                        key={`${release.version}-${release.publishedAt}`}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-3 text-left transition-colors hover:bg-white/[0.04]"
                        onClick={() => void openExternalLink(release.url)}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            Version {release.version}
                            {release.version === appVersion ? (
                              <span className="ml-2 text-[10px] font-medium text-[rgb(var(--accent))]">Installiert</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-white/45">
                            {release.publishedAt
                              ? new Date(release.publishedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
                              : "Datum unbekannt"}
                          </span>
                        </span>
                        <ExternalLink size={14} className="shrink-0 text-white/35" />
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
            {message ? <div className="mt-5 rounded-lg border border-white/[0.06] bg-[#151515] px-4 py-3 text-sm text-white/75">{message}</div> : null}
            {syncError ? <div className="mt-5 rounded-lg border border-white/[0.12] bg-[#151515] px-4 py-3 text-sm text-white">{syncError}</div> : null}
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/[0.06] bg-[#0B0B0B] px-6 py-4">
          <button className="rounded-lg px-4 py-2 text-sm text-white/65 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white" onClick={onClose}>Abbrechen</button>
          <button className="accent-primary rounded-lg px-4 py-2 text-sm font-semibold" onClick={() => void saveSettings()}>Speichern</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className={`mb-1 h-9 w-full rounded-md px-3 text-left text-[13px] ${
        active
          ? "bg-white/[0.08] text-white"
          : "text-white/55 transition-colors duration-150 hover:bg-white/[0.05] hover:text-white"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-white/40">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ModernSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#151515] px-4 py-2.5">
      <span className="text-sm font-medium text-white/80">{label}</span>
      <span className="relative min-w-52">
        <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-white/[0.07] bg-[#101010] px-3 py-2 pr-10 text-sm text-white outline-none focus:border-[rgb(var(--accent)/0.45)]">
          {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60" />
      </span>
    </label>
  );
}

function ModernToggle({ label, description, checked, onChange, flat = false }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; flat?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-5 px-4 py-3 ${flat ? "" : "rounded-xl border border-white/[0.07] bg-[#151515]"}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white/85">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-white/40">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mail-checkbox h-4 w-4 shrink-0" />
    </label>
  );
}

function Field(props: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium text-white/55">{props.label}</span>
      <input {...props} className="h-11 w-full rounded-lg border border-white/[0.06] bg-[#151515] px-3 text-sm text-white outline-none focus:border-white/[0.16]" />
    </label>
  );
}

function CheckboxField(props: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex h-11 items-center gap-3 rounded-lg border border-white/[0.06] bg-[#151515] px-3 text-sm text-white/75">
      <input name={props.name} type="checkbox" defaultChecked={props.defaultChecked} className="h-4 w-4 accent-white" />
      <span>{props.label}</span>
    </label>
  );
}

function providerButton(active: boolean) {
  return `rounded-lg border px-4 py-3 text-left text-sm ${active ? "border-white/[0.14] bg-white/[0.08] text-white" : "border-white/[0.06] text-white/55 hover:bg-white/[0.04] hover:text-white"}`;
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function DiagBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${active ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]" : "bg-white/[0.08] text-white/65"}`}>
      {label}
    </span>
  );
}
