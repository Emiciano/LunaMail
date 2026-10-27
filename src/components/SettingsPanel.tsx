import { Check, ChevronDown, Download, ExternalLink, HardDrive, Image, Info, ListFilter, Lock, Palette, Pencil, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Star, Tag as TagIcon, Trash2, Upload, UserRound, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { desktopDialog, isDesktop, openExternalLink, type AppRelease } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";
import type { AccentColor, Contact, DiagnoseAccountResult, DiagnoseInboxResult, MailRule, ServerMessageSummary, Settings, Tag, ThemeMode } from "../types";
import packageJson from "../../package.json";
import { useShallow } from "zustand/react/shallow";
import { useAppUpdate } from "../hooks/useAppUpdate";
import { cn } from "../lib/cn";
import { SenderAvatar } from "./SenderAvatar";

type Tab = "accounts" | "general" | "themes" | "security" | "sync" | "rules" | "contacts" | "tags" | "backup" | "about";

const accentOptions: { value: AccentColor; label: string; className: string }[] = [
  { value: "white", label: "Standard", className: "bg-ink" },
  { value: "blue", label: "Blau", className: "bg-blue-600" },
  { value: "green", label: "Grün", className: "bg-green-600" },
  { value: "orange", label: "Orange", className: "bg-orange-600" },
  { value: "red", label: "Rot", className: "bg-red-600" },
  { value: "purple", label: "Lila", className: "bg-purple-600" },
  { value: "teal", label: "Türkis", className: "bg-teal-600" },
  { value: "pink", label: "Pink", className: "bg-pink-600" },
  { value: "gray", label: "Grau", className: "bg-[#475569]" }
];

const themeOptions: { value: ThemeMode; label: string; preview: [string, string, string] }[] = [
  { value: "light", label: "Hell", preview: ["#FFFFFF", "#F3F3F3", "#000000"] },
  { value: "dark", label: "Dunkel", preview: ["#000000", "#161616", "#FFFFFF"] },
  { value: "silver", label: "Silber", preview: ["#2D2E32", "#3A3B40", "#F3F3F5"] }
];

const accentVars: Record<AccentColor, CSSProperties> = {
  white: {} as CSSProperties,
  blue: { "--accent": "37 99 235", "--accent-soft": "239 246 255", "--accent-contrast": "255 255 255" } as CSSProperties,
  green: { "--accent": "22 163 74", "--accent-soft": "240 253 244", "--accent-contrast": "255 255 255" } as CSSProperties,
  orange: { "--accent": "234 88 12", "--accent-soft": "255 247 237", "--accent-contrast": "255 255 255" } as CSSProperties,
  red: { "--accent": "220 38 38", "--accent-soft": "254 242 242", "--accent-contrast": "255 255 255" } as CSSProperties,
  purple: { "--accent": "147 51 234", "--accent-soft": "245 243 255", "--accent-contrast": "255 255 255" } as CSSProperties,
  teal: { "--accent": "13 148 136", "--accent-soft": "240 253 250", "--accent-contrast": "255 255 255" } as CSSProperties,
  pink: { "--accent": "219 39 119", "--accent-soft": "253 242 248", "--accent-contrast": "255 255 255" } as CSSProperties,
  gray: { "--accent": "71 85 105", "--accent-soft": "248 250 252", "--accent-contrast": "255 255 255" } as CSSProperties
};

/** Kleiner Passwort-Dialog im Stil der App; der Wert verlässt die Funktion nur über das Promise. */
function requestSecret(title: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay-enter fixed inset-0 grid place-items-center bg-scrim/30 px-4 backdrop-blur-[6px]";
    overlay.style.zIndex = "2147483647";
    const panel = document.createElement("form");
    panel.className = "dialog-enter w-full max-w-sm rounded-3xl border border-line bg-canvas p-6 text-ink shadow-float";
    const label = document.createElement("label");
    label.className = "block font-display text-[18px] font-extrabold leading-6";
    label.textContent = title;
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "new-password";
    input.maxLength = 256;
    input.className = "mt-4 h-11 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:ring-2 focus:ring-ink/15";
    label.append(input);
    const actions = document.createElement("div");
    actions.className = "mt-5 flex justify-end gap-2";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "pressable h-10 rounded-full bg-surface px-4 text-[14px] font-semibold text-ink hover:bg-surface-2";
    cancel.textContent = "Abbrechen";
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = "pressable accent-primary h-10 rounded-full px-5 text-[14px] font-bold";
    ok.textContent = "OK";
    const close = (value?: string) => {
      overlay.remove();
      resolve(value);
    };
    cancel.onclick = () => close();
    panel.onkeydown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    panel.onsubmit = (event) => {
      event.preventDefault();
      close(input.value);
    };
    actions.append(cancel, ok);
    panel.append(label, actions);
    overlay.append(panel);
    document.body.append(overlay);
    input.focus();
  });
}

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
    const password = await requestSecret("Backup-Passwort festlegen (mindestens 12 Zeichen)");
    if (!password) return;
    if (password.length < 12) {
      setMessage("Backup-Passwort muss mindestens 12 Zeichen lang sein.");
      return;
    }
    const confirmation = await requestSecret("Backup-Passwort wiederholen");
    if (password !== confirmation) {
      setMessage("Backup-Passwoerter stimmen nicht ueberein.");
      return;
    }
    const path = await desktopDialog.save({
      title: "Backup exportieren",
      defaultPath: `lunamail-backup-${new Date().toISOString().slice(0, 10)}.lmbak`
    });
    if (!path) return;
    await mailService.exportBackupToFile(path, password);
    setMessage(`Verschluesseltes Backup exportiert: ${path}`);
  }

  async function importBackupFromFile() {
    const file = await desktopDialog.open({
      title: "Backup importieren",
      multiple: false,
      filters: [{ name: "LunaMail Backup", extensions: ["lmbak", "json"] }]
    });
    if (!file || Array.isArray(file)) return;
    const password = String(file).toLowerCase().endsWith(".json")
      ? undefined
      : await requestSecret("Backup-Passwort eingeben");
    await mailService.importBackupFromFile(String(file), password);
    setMessage("Datensicherung importiert. Konten ohne Passwort bleiben unverändert.");
    await sync(true);
    await loadRules(selectedAccountId);
    await loadContacts();
  }


  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) void saveSettings();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];

  function startAccountForm(account?: (typeof accounts)[number]) {
    setEditingAccountId(account?.id);
    setProvider(account?.provider === "gmail" ? "gmail" : "custom");
    setShowAccountForm(true);
    setMessage(account
      ? account.authType === "oauth2"
        ? "Google-Konto erneut anmelden, um die Berechtigung zu erneuern."
        : "Passwort neu eingeben und speichern, um den Keyring-Eintrag zu erneuern."
      : "");
  }

  function closeAccountForm() {
    setEditingAccountId(undefined);
    setShowAccountForm(false);
  }

  return createPortal(
    <div
      className="overlay-enter flex items-center justify-center bg-scrim/30 p-6 backdrop-blur-[6px]"
      style={{ position: "fixed", inset: 0, zIndex: 2147483647, ...accentVars[draft.accentColor] }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
        className="dialog-enter flex h-[min(860px,calc(100vh-3rem))] w-[min(1180px,calc(100vw-3rem))] overflow-hidden rounded-3xl border border-line bg-canvas text-ink shadow-float"
      >
        <nav className="mail-scroll flex w-[248px] shrink-0 flex-col overflow-y-auto bg-sidebar px-3 pb-4 pt-7">
          <h2 className="px-3 font-display text-[26px] font-extrabold leading-8">Einstellungen</h2>
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className="mb-1.5 mt-6 px-3 text-[12px] font-bold uppercase tracking-[0.04em] text-label-3">{group.title}</div>
              <div className="space-y-0.5">
                {group.tabs.map((id) => {
                  const item = tabs.find((entry) => entry.id === id)!;
                  const Icon = item.icon;
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      className={cn(
                        "pressable flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px]",
                        active ? "bg-ink/[0.08] font-semibold text-ink" : "font-medium text-ink/80 hover:bg-ink/[0.04] hover:text-ink"
                      )}
                      onClick={() => setTab(id)}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon size={17} className={active ? "text-ink" : "text-label-2"} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-6 px-10 pb-5 pt-8">
            <div className="min-w-0">
              <h3 className="font-display text-[32px] font-extrabold leading-9">{activeTab.label}</h3>
              <p className="mt-1.5 text-[15px] text-label-2">{activeTab.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="pressable accent-primary h-10 rounded-full px-5 text-[14px] font-bold" onClick={() => void saveSettings()}>
                Fertig
              </button>
              <button className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-surface text-label-2 hover:bg-surface-2 hover:text-ink" onClick={onClose} title="Schließen" aria-label="Schließen">
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="mail-scroll min-h-0 flex-1 overflow-y-auto px-10 pb-10">
            <div key={tab} className="view-enter mx-auto max-w-[820px] space-y-7">
              {message ? <Notice>{message}</Notice> : null}
              {syncError ? <Notice tone="danger">{syncError}</Notice> : null}

              {tab === "accounts" ? (
                <>
                  <Group title="Verbundene Konten">
                    {accounts.length === 0 ? <EmptyRow>Noch kein Konto verbunden.</EmptyRow> : null}
                    {accounts.map((account) => (
                      <div key={account.id} className="flex items-center gap-3.5 px-4 py-3.5">
                        <SenderAvatar address={account.email} name={account.displayName || account.email} className="h-11 w-11 text-[15px]" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-bold">{account.displayName || account.email}</div>
                          <div className="truncate text-[13px] text-label-2">{account.email}</div>
                          <div className="mt-0.5 truncate text-[12px] text-label-3">
                            {account.provider === "gmail" ? "Gmail" : "IMAP"} · {account.imapHost}:{account.imapPort} · {account.smtpHost}:{account.smtpPort}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <SoftButton onClick={() => void testAccount(account.id)}>Testen</SoftButton>
                          <IconButton title="Bearbeiten" onClick={() => startAccountForm(account)}><Pencil size={16} /></IconButton>
                          <IconButton title="Löschen" danger onClick={() => void deleteAccount(account.id)}><Trash2 size={16} /></IconButton>
                        </div>
                      </div>
                    ))}
                    {!showAccountForm ? (
                      <button type="button" className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2" onClick={() => startAccountForm()}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas text-ink">
                          <Plus size={19} />
                        </span>
                        <span>
                          <span className="block text-[15px] font-bold">Konto hinzufügen</span>
                          <span className="block text-[13px] text-label-2">IMAP/SMTP oder Gmail</span>
                        </span>
                      </button>
                    ) : null}
                  </Group>

                  {showAccountForm ? (
                    <Group title={editingAccount ? "Konto bearbeiten" : "Neues Konto"} padded>
                      <div className="mb-5 inline-flex rounded-full bg-canvas p-1">
                        {(["custom", "gmail"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={cn(
                              "pressable h-8 rounded-full px-4 text-[13px] font-semibold",
                              provider === value ? "bg-ink text-canvas" : "text-label-2 hover:text-ink"
                            )}
                            onClick={() => setProvider(value)}
                            aria-pressed={provider === value}
                          >
                            {value === "custom" ? "IMAP / SMTP" : "Gmail"}
                          </button>
                        ))}
                      </div>
                      {provider === "gmail" ? (
                        <div className="space-y-4">
                          <p className="text-[14px] leading-6 text-label-2">
                            LunaMail öffnet die sichere Google-Anmeldung im Standardbrowser. E-Mail-Adresse, Passwort und Bestätigung werden ausschließlich bei Google eingegeben.
                          </p>
                          <label className="block">
                            <span className="mb-1.5 block text-[13px] font-semibold text-label-2">Google OAuth Desktop-Client-ID</span>
                            <input
                              value={draft.googleOAuthClientId ?? ""}
                              onChange={(event) => setDraft({ ...draft, googleOAuthClientId: event.target.value })}
                              placeholder="123456789-abc.apps.googleusercontent.com"
                              className={inputClass}
                            />
                            <span className="mt-1.5 block text-[12px] text-label-2">Einmalige App-Konfiguration aus der Google Cloud Console. Typ: Desktop-App.</span>
                          </label>
                          <div className="flex justify-end gap-2 pt-1">
                            <SoftButton onClick={closeAccountForm}>Abbrechen</SoftButton>
                            <PrimaryButton disabled={googleAuthBusy} onClick={() => void connectGoogle()}>
                              {googleAuthBusy ? "Google-Anmeldung läuft …" : editingAccount ? "Erneut mit Google anmelden" : "Mit Google anmelden"}
                            </PrimaryButton>
                          </div>
                        </div>
                      ) : (
                        <form key={editingAccount?.id ?? provider} onSubmit={submitAccount} className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                          <Field name="displayName" label="Name" defaultValue={editingAccount?.displayName} required />
                          <Field name="email" label="E-Mail" type="email" defaultValue={editingAccount?.email} required />
                          <div className="col-span-2">
                            <Field name="username" label="Benutzername (meist die volle E-Mail)" defaultValue={editingAccount?.username ?? editingAccount?.email} />
                          </div>
                          <Field name="imapHost" label="IMAP-Server" defaultValue={editingAccount?.imapHost ?? ""} required />
                          <div className="grid grid-cols-[110px_1fr] items-end gap-3">
                            <Field name="imapPort" label="Port" type="number" defaultValue={String(editingAccount?.imapPort ?? 993)} required />
                            <SwitchField name="imapSecure" label="SSL/TLS" defaultChecked={editingAccount?.imapSecure ?? true} />
                          </div>
                          <Field name="smtpHost" label="SMTP-Server" defaultValue={editingAccount?.smtpHost ?? ""} required />
                          <div className="grid grid-cols-[110px_1fr] items-end gap-3">
                            <Field name="smtpPort" label="Port" type="number" defaultValue={String(editingAccount?.smtpPort ?? 465)} required />
                            <SwitchField name="smtpSecure" label="SSL/TLS" defaultChecked={editingAccount?.smtpSecure ?? true} />
                          </div>
                          <Field name="password" label={editingAccount ? "IMAP-Passwort (neu eingeben)" : "IMAP-Passwort"} type="password" required />
                          <Field name="smtpPassword" label="SMTP-Passwort (falls abweichend)" type="password" />
                          <div className="col-span-2 flex justify-end gap-2 pt-2">
                            <SoftButton onClick={closeAccountForm}>Abbrechen</SoftButton>
                            <PrimaryButton type="submit">Speichern</PrimaryButton>
                          </div>
                        </form>
                      )}
                    </Group>
                  ) : null}

                  {accounts.length > 0 ? (
                    <Group title="Benachrichtigungen je Konto">
                      {accounts.map((account) => (
                        <Row key={account.id} label={account.email}>
                          <Switch
                            label={`Benachrichtigungen für ${account.email}`}
                            checked={draft.accountNotifications?.[String(account.id)] ?? true}
                            onChange={(checked) =>
                              applySettings({
                                ...draft,
                                accountNotifications: { ...draft.accountNotifications, [String(account.id)]: checked }
                              })
                            }
                          />
                        </Row>
                      ))}
                    </Group>
                  ) : null}
                </>
              ) : null}

              {tab === "general" ? (
                <>
                  <Group title="Darstellung">
                    <Row label="Schriftgröße" description="Gilt für Liste, Lesebereich und Seitenleiste.">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="14"
                          max="22"
                          value={draft.fontSize}
                          aria-label="Schriftgröße"
                          onChange={(event) => {
                            const fontSize = Number(event.target.value);
                            setDraft({ ...draft, fontSize });
                            document.documentElement.style.setProperty("--app-font-size", `${fontSize}px`);
                          }}
                          onPointerUp={(event) => applySettings({ ...draft, fontSize: Number(event.currentTarget.value) })}
                          onBlur={(event) => applySettings({ ...draft, fontSize: Number(event.currentTarget.value) })}
                          className="w-44 accent-[rgb(var(--accent))]"
                        />
                        <span className="w-12 rounded-full bg-canvas py-1 text-center text-[13px] font-semibold">{draft.fontSize}px</span>
                      </div>
                    </Row>
                    <Row label="Dichte">
                      <SelectControl label="Dichte" value={draft.layoutMode} onChange={(value) => applySettings({ ...draft, layoutMode: value as Settings["layoutMode"] })} options={[["compact", "Kompakt"], ["standard", "Standard"], ["comfortable", "Komfortabel"]]} />
                    </Row>
                    <Row label="Externe Bilder" description="Bilder von fremden Servern verraten dem Absender, dass du die Mail geöffnet hast.">
                      <SelectControl label="Externe Bilder" value={draft.externalImages} onChange={(value) => applySettings({ ...draft, externalImages: value as Settings["externalImages"] })} options={[["never", "Nie laden"], ["ask", "Fragen"], ["always", "Immer laden"]]} />
                    </Row>
                    <Row label="Absender-Logos" description="Lädt das Logo der Absender-Domain von deren Website oder über DuckDuckGo. Privatadressen wie Gmail bleiben bei Initialen.">
                      <Switch label="Absender-Logos" checked={draft.senderLogos} onChange={(checked) => applySettings({ ...draft, senderLogos: checked })} />
                    </Row>
                  </Group>

                  <Group title="Konto & App">
                    <Row label="Standardkonto" description="Absender für neue Nachrichten.">
                      <SelectControl
                        label="Standardkonto"
                        value={String(draft.defaultAccountId ?? "")}
                        onChange={(value) => applySettings({ ...draft, defaultAccountId: Number(value) })}
                        options={accounts.map((account) => [String(account.id), account.email])}
                      />
                    </Row>
                    <Row label="Im Hintergrund weiterlaufen" description="LunaMail bleibt im Windows-Infobereich aktiv und synchronisiert weiter.">
                      <Switch label="Im Hintergrund weiterlaufen" checked={draft.runInBackground ?? true} onChange={(checked) => applySettings({ ...draft, runInBackground: checked })} />
                    </Row>
                  </Group>

                  <Group title="Benachrichtigungen" footer={testNotificationStatus ?? undefined}>
                    <Row label="Desktop-Benachrichtigungen" description="Zeigt neue Nachrichten im Windows-Benachrichtigungscenter.">
                      <Switch label="Desktop-Benachrichtigungen" checked={draft.notificationsEnabled} onChange={(checked) => applySettings({ ...draft, notificationsEnabled: checked })} />
                    </Row>
                    <Row label="Ton" description="Spielt bei neuen Nachrichten einen kurzen Ton ab.">
                      <Switch label="Benachrichtigungston" checked={draft.notificationSound} onChange={(checked) => applySettings({ ...draft, notificationSound: checked })} />
                    </Row>
                    <Row label="Vorschau anzeigen" description="Zeigt Absender und Betreff in der Benachrichtigung.">
                      <Switch label="Vorschautext anzeigen" checked={draft.notificationPreview} onChange={(checked) => applySettings({ ...draft, notificationPreview: checked })} />
                    </Row>
                    <Row label="Testbenachrichtigung">
                      <SoftButton
                        onClick={() => {
                          setTestNotificationStatus("Sende Test …");
                          void mailService.testDesktopNotification()
                            .then((result: string) => setTestNotificationStatus(result))
                            .catch((error: unknown) => setTestNotificationStatus(error instanceof Error ? error.message : String(error)));
                        }}
                      >
                        Senden
                      </SoftButton>
                    </Row>
                  </Group>
                </>
              ) : null}

              {tab === "themes" ? (
                <>
                  <Group title="Erscheinungsbild" footer="Dieselben drei Designs wie in der Android-App." padded>
                    <div className="grid grid-cols-3 gap-4">
                      {themeOptions.map((option) => {
                        const active = draft.theme === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className="pressable group text-left"
                            onClick={() => applySettings({ ...draft, theme: option.value })}
                            aria-pressed={active}
                          >
                            <span
                              className={cn(
                                "flex h-28 overflow-hidden rounded-2xl border transition-shadow",
                                active ? "border-transparent ring-[2.5px] ring-[rgb(var(--accent))] ring-offset-2 ring-offset-surface" : "border-line group-hover:shadow-md"
                              )}
                              style={{ background: option.preview[0] }}
                            >
                              <span className="w-[34%]" style={{ background: option.preview[1] }} />
                              <span className="flex flex-1 flex-col justify-center gap-2 px-3">
                                <span className="h-2 w-3/4 rounded-full" style={{ background: option.preview[2] }} />
                                <span className="h-2 w-1/2 rounded-full opacity-40" style={{ background: option.preview[2] }} />
                                <span className="h-2 w-2/3 rounded-full opacity-25" style={{ background: option.preview[2] }} />
                              </span>
                            </span>
                            <span className="mt-2.5 flex items-center gap-1.5 px-1 text-[14px] font-bold">
                              {option.label}
                              {active ? <Check size={15} strokeWidth={3} /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Group>

                  <Group title="Akzentfarbe" footer="Färbt Knöpfe, Schalter und Markierungen." padded>
                    <div className="flex flex-wrap gap-x-5 gap-y-4">
                      {accentOptions.map((option) => {
                        const active = draft.accentColor === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className="pressable flex w-14 flex-col items-center gap-2"
                            onClick={() => applySettings({ ...draft, accentColor: option.value })}
                            aria-pressed={active}
                            title={option.label}
                          >
                            <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", option.className, active && "ring-[2.5px] ring-ink/70 ring-offset-2 ring-offset-surface")}>
                              {active ? <Check size={17} strokeWidth={3} className={option.value === "white" ? "text-canvas" : "text-white"} /> : null}
                            </span>
                            <span className={cn("text-[12px]", active ? "font-bold text-ink" : "font-medium text-label-2")}>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Group>

                  <Group title="Vorschau" padded>
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="accent-primary inline-flex h-12 w-12 items-center justify-center rounded-full shadow-float">
                        <Pencil size={19} />
                      </span>
                      <span className="accent-primary inline-flex h-10 items-center rounded-full px-5 text-[14px] font-bold">Senden</span>
                      <span className="inline-flex h-10 items-center rounded-[10px] bg-ink/[0.08] px-4 text-[14px] font-semibold">Ausgewählte Mail</span>
                      <input type="checkbox" className="ios-switch" checked readOnly aria-label="Beispielschalter" />
                    </div>
                  </Group>
                </>
              ) : null}

              {tab === "security" ? (
                <>
                  <Group title="Passwörter">
                    <Row icon={<ShieldCheck size={18} />} label="Windows-Anmeldeinformationsverwaltung" description="Passwörter liegen im geschützten Speicher von Windows und nie in der Mail-Datenbank." />
                    <Row label="Lokalen Passwort-Fallback erlauben" description="Wenn aus, werden Passwörter nur über den Windows-Benutzerschutz gelesen.">
                      <Switch
                        label="Lokalen Passwort-Fallback erlauben"
                        checked={draft.allowLocalSecretFallback}
                        onChange={(checked) => applySettings({ ...draft, allowLocalSecretFallback: checked })}
                      />
                    </Row>
                  </Group>
                  <Group title="Verbindung & Inhalte">
                    <Row icon={<Lock size={18} />} label="Verschlüsselte Verbindungen" description="IMAP und SMTP laufen über TLS. Zertifikate prüft der native TLS-Stack." />
                    <Row icon={<Image size={18} />} label="Externe Bilder" description="Folgen der Einstellung unter Allgemein. HTML wird vor der Anzeige bereinigt." />
                  </Group>
                </>
              ) : null}

              {tab === "sync" ? (
                <>
                  <Group title="Status">
                    <Row label="Automatische Synchronisierung">
                      <span className="text-[14px] font-semibold text-label-2">Alle 30 Sekunden</span>
                    </Row>
                    <Row label="Letzter Stand" description={syncError || syncStatus || "Bereit"}>
                      <PrimaryButton disabled={accounts.length === 0} onClick={() => void sync(true)}>
                        <RefreshCw size={15} />
                        Jetzt synchronisieren
                      </PrimaryButton>
                    </Row>
                  </Group>

                  <Group title="Diagnose">
                    <Row label="Konto">
                      <SelectControl
                        label="Konto für die Diagnose"
                        value={String(diagnoseAccountId ?? "")}
                        onChange={(value) => setDiagnoseAccountId(Number(value))}
                        options={accounts.map((account) => [String(account.id), account.email])}
                      />
                    </Row>
                    <div className="flex flex-wrap gap-2 px-4 py-3.5">
                      <SoftButton disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runDiagnoseAccount()}>Sync testen</SoftButton>
                      <SoftButton disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runDiagnoseInbox()}>Posteingangs-UIDs prüfen</SoftButton>
                      <SoftButton disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runLatestServerMessages()}>Letzte 10 Server-Mails</SoftButton>
                      <SoftButton disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runForceIncrementalSync()}>Neue Nachrichten holen</SoftButton>
                      <SoftButton disabled={diagnoseBusy || !diagnoseAccountId} onClick={() => void runForceFullInboxSync()}>Posteingang komplett neu laden</SoftButton>
                    </div>
                  </Group>

                  {diagnoseAccount ? (
                    <Group title="Kontodiagnose">
                      <DiagRow label="Konto-ID" value={String(diagnoseAccount.accountId)} />
                      <DiagRow label="E-Mail" value={diagnoseAccount.email} />
                      <DiagRow label="IMAP" value={`${diagnoseAccount.imapHost}:${diagnoseAccount.imapPort} · ${diagnoseAccount.imapSecure ? "TLS" : "Plain"}`} />
                      <DiagRow label="Anmeldung" value={diagnoseAccount.loginStatus} />
                      <DiagRow label="Posteingang" value={diagnoseAccount.inboxRemoteName ?? "—"} />
                      <DiagRow label="Lokale UID" value={String(diagnoseAccount.lastKnownUid ?? "—")} />
                      <DiagRow label="Server-UID" value={String(diagnoseAccount.highestUidOnServer ?? "—")} />
                      <DiagRow label="Lokale Posteingangsmails" value={String(diagnoseAccount.localInboxMails)} />
                      <DiagRow label="Letzte Synchronisierung" value={diagnoseAccount.lastSyncAt ?? "—"} />
                      <DiagRow label="Letzter Fehler" value={diagnoseAccount.lastSyncError ?? "—"} />
                      <div className="flex gap-2 px-4 py-3">
                        <DiagBadge label="IDLE" active={diagnoseAccount.idleActive} />
                        <DiagBadge label="Polling" active={diagnoseAccount.pollingActive} />
                      </div>
                    </Group>
                  ) : null}

                  <Group title="Zähler">
                    <DiagRow label="Aktives Konto" value={String(selectedAccountId ?? "—")} />
                    <DiagRow label="Konto der Spezialansicht" value={String(selectedSpecialAccountId ?? "—")} />
                    <DiagRow label="Konto der Zähler" value={String(mailCountsAccountId ?? "—")} />
                    <DiagRow label="Ungelesen / Anhang" value={`${mailCounts.unread} / ${mailCounts.withAttachments}`} />
                    <DiagRow label="Heute / Diese Woche" value={`${mailCounts.today} / ${mailCounts.thisWeek}`} />
                  </Group>

                  {diagnoseInbox ? (
                    <Group title="Posteingangsdiagnose">
                      <DiagRow label="Posteingang" value={diagnoseInbox.inboxRemoteName ?? "—"} />
                      <DiagRow label="Lokale UID" value={String(diagnoseInbox.lastKnownUid ?? "—")} />
                      <DiagRow label="Server-UID" value={String(diagnoseInbox.highestUidOnServer ?? "—")} />
                      <DiagRow label="Lokale Posteingangsmails" value={String(diagnoseInbox.localInboxMails)} />
                      <div className="mail-scroll max-h-44 overflow-auto">
                        {diagnoseInbox.mailboxes.map((mailbox) => (
                          <DiagRow key={mailbox.name} label={mailbox.name} value={mailbox.inferredRole} />
                        ))}
                      </div>
                    </Group>
                  ) : null}

                  {serverMessages.length > 0 ? (
                    <Group title="Letzte Server-Mails">
                      {serverMessages.map((mail) => (
                        <div key={`${mail.uid}-${mail.messageId}`} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-semibold">{mail.subject || "(Kein Betreff)"}</div>
                            <div className="truncate text-[12px] text-label-2">UID {mail.uid} · {mail.sender}</div>
                          </div>
                          <DiagBadge label={mail.seen ? "Gelesen" : "Ungelesen"} active={!mail.seen} />
                        </div>
                      ))}
                    </Group>
                  ) : null}
                </>
              ) : null}

              {tab === "rules" ? (
                <Group
                  title="Regeln"
                  action={<PrimaryButton small onClick={() => void createRule()}><Plus size={15} />Regel hinzufügen</PrimaryButton>}
                  footer="Regeln laufen beim Abruf neuer Mails, die oberste zuerst."
                >
                  {rules.length === 0 ? <EmptyRow>Noch keine Regeln vorhanden.</EmptyRow> : null}
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-3 px-4 py-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-label-2">
                        <ListFilter size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold">{rule.name}</div>
                        <div className="truncate text-[13px] text-label-2">
                          Wenn {ruleFieldLabels[rule.field] ?? rule.field} „{rule.value}“ enthält → {ruleActionLabels[rule.actionType] ?? rule.actionType}
                          {rule.actionValue ? ` (${rule.actionValue})` : ""}
                        </div>
                      </div>
                      <IconButton title="Löschen" danger onClick={() => void deleteRule(rule.id)}><Trash2 size={16} /></IconButton>
                    </div>
                  ))}
                </Group>
              ) : null}

              {tab === "contacts" ? (
                <>
                  {contactFormOpen ? (
                    <Group title={editingContactId ? "Kontakt bearbeiten" : "Neuer Kontakt"} padded>
                      <form onSubmit={(event) => void submitContact(event)}>
                        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1.5 block text-[13px] font-semibold text-label-2">Name</span>
                            <input className={inputClass} value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Max Mustermann" maxLength={120} autoFocus />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-[13px] font-semibold text-label-2">E-Mail-Adresse</span>
                            <input type="email" required maxLength={254} className={inputClass} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="max@example.de" />
                          </label>
                        </div>
                        <label className="mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-canvas px-4 py-3 text-[14px] font-semibold">
                          Als Favorit markieren
                          <input type="checkbox" role="switch" className="ios-switch" checked={contactFavorite} onChange={(event) => setContactFavorite(event.target.checked)} />
                        </label>
                        {contactError ? <p className="mt-3 text-[13px] font-semibold text-danger">{contactError}</p> : null}
                        <div className="mt-5 flex justify-end gap-2">
                          <SoftButton onClick={closeContactForm}>Abbrechen</SoftButton>
                          <PrimaryButton type="submit">Speichern</PrimaryButton>
                        </div>
                      </form>
                    </Group>
                  ) : null}
                  <Group
                    title="Kontakte"
                    action={contactFormOpen ? undefined : <PrimaryButton small onClick={() => openContactForm()}><Plus size={15} />Kontakt hinzufügen</PrimaryButton>}
                    footer="Gespeicherte Kontakte werden beim Verfassen vorgeschlagen."
                  >
                    {contacts.length === 0 ? <EmptyRow>Noch keine Kontakte gespeichert.</EmptyRow> : null}
                    {contacts.map((contact) => (
                      <div key={contact.id} className="flex items-center gap-3.5 px-4 py-3">
                        <SenderAvatar address={contact.email} name={contact.name || contact.email} className="h-10 w-10 text-[14px]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[15px] font-bold">{contact.name || contact.email}</span>
                            {contact.isFavorite ? <Star size={13} className="shrink-0 fill-flag text-flag" /> : null}
                          </div>
                          <div className="truncate text-[13px] text-label-2">
                            {contact.email} · {contact.usageCount}× genutzt
                            {contact.lastContactAt ? ` · zuletzt ${new Date(contact.lastContactAt).toLocaleDateString("de-DE")}` : ""}
                          </div>
                        </div>
                        <IconButton title="Bearbeiten" onClick={() => openContactForm(contact)}><Pencil size={16} /></IconButton>
                        <IconButton title="Löschen" danger onClick={() => void deleteContact(contact.id)}><Trash2 size={16} /></IconButton>
                      </div>
                    ))}
                  </Group>
                </>
              ) : null}

              {tab === "tags" ? (
                <>
                  {tagFormOpen ? (
                    <Group title={editingTagId ? "Tag bearbeiten" : "Neuer Tag"} padded>
                      <form onSubmit={(event) => void submitTag(event)}>
                        <div className="grid items-end gap-4 sm:grid-cols-[1fr_120px]">
                          <label className="block">
                            <span className="mb-1.5 block text-[13px] font-semibold text-label-2">Name</span>
                            <input required maxLength={40} className={inputClass} value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="z. B. Rechnung" autoFocus />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-[13px] font-semibold text-label-2">Farbe</span>
                            <input type="color" className="h-11 w-full cursor-pointer rounded-[12px] border border-line bg-canvas p-1.5" value={tagColor} onChange={(event) => setTagColor(event.target.value)} />
                          </label>
                        </div>
                        {tagError ? <p className="mt-3 text-[13px] font-semibold text-danger">{tagError}</p> : null}
                        <div className="mt-5 flex justify-end gap-2">
                          <SoftButton onClick={closeTagForm}>Abbrechen</SoftButton>
                          <PrimaryButton type="submit">Speichern</PrimaryButton>
                        </div>
                      </form>
                    </Group>
                  ) : null}
                  <Group
                    title="Tags"
                    action={tagFormOpen ? undefined : <PrimaryButton small onClick={() => openTagForm()}><Plus size={15} />Tag hinzufügen</PrimaryButton>}
                    footer="Tags lassen sich ausgewählten Mails über die Leiste oben zuordnen."
                  >
                    {tags.length === 0 ? <EmptyRow>Noch keine Tags vorhanden.</EmptyRow> : null}
                    {tags.map((tag) => (
                      <div key={tag.id} className="flex items-center gap-3.5 px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas">
                          <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: tag.color }} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{tag.name}</span>
                        <IconButton title="Bearbeiten" onClick={() => openTagForm(tag)}><Pencil size={16} /></IconButton>
                        <IconButton title="Löschen" danger onClick={() => void deleteTag(tag.id)}><Trash2 size={16} /></IconButton>
                      </div>
                    ))}
                  </Group>
                </>
              ) : null}

              {tab === "backup" ? (
                <Group title="Datensicherung" footer="Enthält Konten ohne Passwörter, Einstellungen, Regeln, Kontakte und Tags.">
                  <Row icon={<Download size={18} />} label="Sicherung exportieren" description="Wird mit einem eigenen Passwort (mindestens 12 Zeichen) verschlüsselt.">
                    <PrimaryButton onClick={() => void exportBackupToFile()}>Exportieren</PrimaryButton>
                  </Row>
                  <Row icon={<Upload size={18} />} label="Sicherung importieren" description="Liest eine .lmbak-Datei ein. Vorhandene Konten ohne Passwort bleiben unverändert.">
                    <SoftButton onClick={() => void importBackupFromFile()}>Importieren</SoftButton>
                  </Row>
                </Group>
              ) : null}

              {tab === "about" ? (
                <>
                  <div className="flex items-center gap-5 rounded-[22px] bg-surface px-6 py-6">
                    <img src="./icon.png" alt="" className="h-[72px] w-[72px] rounded-[18px] shadow-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[28px] font-extrabold leading-8">LunaMail</div>
                      <div className="mt-1 text-[14px] text-label-2">Version {appVersion} · E-Mail für Windows</div>
                    </div>
                  </div>
                  <Group title="Updates">
                    <UpdateStatusRow />
                  </Group>
                  <Group title="Versionsverlauf" action={<span className="rounded-full bg-surface px-2.5 py-0.5 text-[12px] font-bold text-label-2">{releases.length}</span>}>
                    {releasesBusy ? <EmptyRow>Versionen werden geladen …</EmptyRow> : null}
                    {releasesError ? <EmptyRow>{releasesError}</EmptyRow> : null}
                    {!releasesBusy && !releasesError && releases.length === 0 ? <EmptyRow>Keine Versionen gefunden.</EmptyRow> : null}
                    {releases.map((release) => (
                      <button
                        key={`${release.version}-${release.publishedAt}`}
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                        onClick={() => void openExternalLink(release.url)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[15px] font-bold">
                            Version {release.version}
                            {release.version === appVersion ? <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-canvas">Installiert</span> : null}
                          </span>
                          <span className="block text-[13px] text-label-2">
                            {release.publishedAt
                              ? new Date(release.publishedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
                              : "Datum unbekannt"}
                          </span>
                        </span>
                        <ExternalLink size={15} className="shrink-0 text-label-3" />
                      </button>
                    ))}
                  </Group>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

const tabs: { id: Tab; label: string; description: string; icon: LucideIcon }[] = [
  { id: "accounts", label: "Konten", description: "Mail-Konten verbinden, prüfen und verwalten.", icon: UserRound },
  { id: "rules", label: "Regeln", description: "Eingehende Mails automatisch sortieren und markieren.", icon: ListFilter },
  { id: "contacts", label: "Kontakte", description: "Adressen, die beim Schreiben vorgeschlagen werden.", icon: Users },
  { id: "tags", label: "Tags", description: "Eigene Schlagwörter für deine Mails.", icon: TagIcon },
  { id: "general", label: "Allgemein", description: "Darstellung, Standardkonto und Benachrichtigungen.", icon: SlidersHorizontal },
  { id: "themes", label: "Design", description: "Erscheinungsbild und Akzentfarbe.", icon: Palette },
  { id: "sync", label: "Synchronisierung", description: "Status und Diagnose der Verbindung zum Mailserver.", icon: RefreshCw },
  { id: "security", label: "Sicherheit", description: "Wie LunaMail Passwörter und Inhalte schützt.", icon: ShieldCheck },
  { id: "backup", label: "Datensicherung", description: "Einstellungen und Konten sichern und wiederherstellen.", icon: HardDrive },
  { id: "about", label: "Über LunaMail", description: "Version, Updates und Versionsverlauf.", icon: Info }
];

const navGroups: { title: string; tabs: Tab[] }[] = [
  { title: "Mail", tabs: ["accounts", "rules", "contacts", "tags"] },
  { title: "App", tabs: ["general", "themes", "sync"] },
  { title: "System", tabs: ["security", "backup", "about"] }
];

const ruleFieldLabels: Record<string, string> = { sender: "Absender", subject: "Betreff", to: "Empfänger" };
const ruleActionLabels: Record<string, string> = { tag: "Tag", favorite: "Favorit", important: "Wichtig", read: "Gelesen", move: "Verschieben" };

const inputClass = "h-11 w-full rounded-[12px] border border-line bg-canvas px-3.5 text-[15px] text-ink outline-none transition-shadow placeholder:text-label-3 focus:ring-2 focus:ring-ink/15";

/** Gruppierte Karte wie in den iOS-Einstellungen: Titel darüber, Zeilen mit Trennlinien, Hinweis darunter. */
function Group({ title, action, footer, padded = false, children }: { title: string; action?: ReactNode; footer?: string; padded?: boolean; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-8 items-end justify-between gap-3 px-1">
        <h4 className="font-display text-[18px] font-extrabold">{title}</h4>
        {action}
      </div>
      <div className={cn("overflow-hidden rounded-[18px] bg-surface", padded ? "p-5" : "divide-y divide-line")}>{children}</div>
      {footer ? <p className="mt-2 px-1 text-[13px] leading-5 text-label-2">{footer}</p> : null}
    </section>
  );
}

function Row({ icon, label, description, children }: { icon?: ReactNode; label: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3.5 px-4 py-3">
      {icon ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{label}</div>
        {description ? <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-5 text-label-2">{description}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="px-4 py-5 text-[14px] text-label-2">{children}</div>;
}

function Notice({ tone = "neutral", children }: { tone?: "neutral" | "danger"; children: ReactNode }) {
  return (
    <div className={cn("rounded-[14px] px-4 py-3 text-[14px] font-medium", tone === "danger" ? "bg-danger/10 text-danger" : "bg-surface text-ink")}>
      {children}
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <input type="checkbox" role="switch" aria-label={label} className="ios-switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />;
}

function SwitchField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex h-11 items-center justify-between gap-3 rounded-[12px] border border-line bg-canvas px-3.5 text-[14px] font-semibold">
      {label}
      <input name={name} type="checkbox" role="switch" defaultChecked={defaultChecked} className="ios-switch" />
    </label>
  );
}

function SelectControl({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <span className="relative inline-block">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-[150px] max-w-[280px] appearance-none truncate rounded-full bg-canvas pl-4 pr-9 text-[14px] font-semibold text-ink outline-none transition-shadow focus:ring-2 focus:ring-ink/15"
      >
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-label-2" />
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled, type = "button", small = false }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; small?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn("pressable accent-primary inline-flex items-center gap-1.5 rounded-full font-bold disabled:cursor-not-allowed disabled:opacity-40", small ? "h-8 px-3.5 text-[13px]" : "h-10 px-5 text-[14px]")}
    >
      {children}
    </button>
  );
}

function SoftButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="pressable inline-flex h-9 items-center rounded-full bg-canvas px-4 text-[14px] font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function IconButton({ title, onClick, danger = false, children }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn("pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full", danger ? "text-danger hover:bg-danger/10" : "text-label-2 hover:bg-canvas hover:text-ink")}
    >
      {children}
    </button>
  );
}

function Field(props: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) {
  const { label, ...inputProps } = props;
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-semibold text-label-2">{label}</span>
      <input {...inputProps} maxLength={props.type === "number" ? undefined : 320} className={inputClass} />
    </label>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-[14px]">
      <span className="text-label-2">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold">{value}</span>
    </div>
  );
}

function DiagBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-bold", active ? "accent-primary" : "bg-canvas text-label-2")}>
      {label}
    </span>
  );
}

function UpdateStatusRow() {
  const { state, check, download, install } = useAppUpdate();
  if (state.status === "unsupported") {
    return <Row icon={<Download size={18} />} label="Updates" description="Updates gibt es nur in der installierten App." />;
  }
  const text = {
    idle: "Noch nicht nach Updates gesucht.",
    checking: "Suche nach Updates …",
    current: "LunaMail ist auf dem neuesten Stand.",
    available: `Version ${state.version} ist verfügbar.`,
    downloading: `Version ${state.version} wird geladen … ${state.progress ?? 0} %`,
    ready: `Version ${state.version} wird beim Neustart installiert.`,
    error: `Update fehlgeschlagen: ${state.error ?? "Unbekannter Fehler"}`
  }[state.status];
  const action = state.status === "available" || (state.status === "error" && state.version)
    ? { label: "Jetzt installieren", run: download }
    : state.status === "ready"
      ? { label: "Neu starten", run: install }
      : state.status === "checking" || state.status === "downloading"
        ? undefined
        : { label: "Nach Updates suchen", run: check };
  return (
    <Row icon={<Download size={18} />} label="Softwareupdate" description={text}>
      {action ? <PrimaryButton onClick={action.run}>{action.label}</PrimaryButton> : null}
    </Row>
  );
}
