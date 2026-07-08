import { create } from "zustand";
import { isDesktop, listenDesktop } from "../services/desktop";
import type { Account, Contact, Draft, Email, Folder, HealthStatus, MailCounts, MailRule, RuleInput, Settings, SmartCategory, SyncReport, Tag } from "../types";
import { mailService, type MailQueryFilters } from "../services/mailService";
import { ensureNotificationPermission, showDesktopNotification } from "../services/notifications";
import { parseSearchQuery } from "../lib/searchParser";

const notifiedMessageIds = new Set<number>();
let refreshScheduled: number | undefined;
let listenersReady = false;

type MailState = {
  accounts: Account[];
  folders: Folder[];
  emails: Email[];
  selectedAccountId?: number;
  selectedFolderId?: number;
  selectedView: "folder" | "favorites" | "important" | "unifiedInbox" | "dashboard" | "health";
  selectedSpecialAccountId?: number;
  selectedCategoryId?: number;
  selectedEmail?: Email;
  selectedEmailIds: number[];
  mailCounts: MailCounts;
  mailCountsAccountId?: number;
  tags: Tag[];
  categories: SmartCategory[];
  rules: MailRule[];
  contacts: Contact[];
  searchFilters: MailQueryFilters;
  query: string;
  loading: boolean;
  startupStatus?: string;
  syncing: boolean;
  accountSyncing: Record<number, boolean>;
  syncStatus: string;
  syncError?: string;
  hasSynced: boolean;
  lastSyncAt?: string;
  databaseSizeBytes: number;
  healthStatus?: HealthStatus;
  settings: Settings;
  composer?: Partial<Draft>;
  drafts: Draft[];
  settingsOpen: boolean;
  loadInitial: () => Promise<void>;
  saveAccount: (account: Parameters<typeof mailService.saveAccount>[0]) => Promise<void>;
  connectGoogleAccount: (clientId: string) => Promise<void>;
  deleteAccount: (accountId: number) => Promise<void>;
  testAccount: (accountId: number) => Promise<void>;
  selectAccount: (accountId: number) => Promise<void>;
  selectFolder: (folderId: number) => Promise<void>;
  selectSpecialView: (view: "favorites" | "important", accountId: number) => Promise<void>;
  openUnifiedInbox: (accountId?: number) => Promise<void>;
  openHealth: () => Promise<void>;
  selectCategory: (categoryId?: number) => Promise<void>;
  openDashboard: () => void;
  selectEmail: (email: Email) => Promise<void>;
  toggleEmailSelection: (id: number, selected: boolean) => void;
  setEmailSelection: (ids: number[]) => void;
  clearEmailSelection: () => void;
  refreshCurrentView: () => Promise<void>;
  closeEmail: () => void;
  sync: (allAccounts?: boolean) => Promise<void>;
  realtimeSyncInboxes: () => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  search: (query: string) => Promise<void>;
  setSearchFilters: (filters: MailQueryFilters) => Promise<void>;
  openComposer: (draft?: Partial<Draft>) => void;
  editDraft: (draft: Draft) => void;
  closeComposer: () => void;
  loadDrafts: (accountId?: number) => Promise<void>;
  saveComposerDraft: (draft: Draft) => Promise<number>;
  deleteComposerDraft: (id: number) => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;
  sendComposer: (draft: Draft) => Promise<void>;
  deleteSelected: () => Promise<void>;
  markReadSelected: () => Promise<void>;
  archiveSelected: () => Promise<void>;
  moveSelected: (targetFolderId: number) => Promise<void>;
  toggleFavoriteSelected: () => Promise<void>;
  toggleImportantSelected: () => Promise<void>;
  replyToSelected: () => void;
  forwardSelected: () => void;
  updateSettings: (settings: Settings) => Promise<void>;
  loadTags: () => Promise<void>;
  loadRules: (accountId?: number) => Promise<void>;
  saveRule: (rule: RuleInput) => Promise<void>;
  deleteRule: (id: number) => Promise<void>;
  loadContacts: (query?: string) => Promise<void>;
  saveContact: (contact: Parameters<typeof mailService.saveContact>[0]) => Promise<void>;
  deleteContact: (id: number) => Promise<void>;
  createTag: (name: string, color: string) => Promise<void>;
  saveTag: (tag: Tag | Omit<Tag, "id">) => Promise<void>;
  deleteTag: (id: number) => Promise<void>;
  setEmailTags: (emailId: number, tagIds: number[]) => Promise<void>;
  setSelectedEmailTags: (tagIds: number[]) => Promise<void>;
  quickAction: (emailId: number, action: "delete" | "favorite" | "important" | "read" | "archive") => Promise<void>;
  handleSyncAccountComplete: (report: SyncReport) => void;
  handleSyncAccountError: (payload: { accountId: number; message: string }) => void;
  handleEmailHydrated: (email: Email) => void;
};

const defaultSettings: Settings = {
  theme: "dark",
  accentColor: "white",
  layoutMode: "standard",
  fontSize: 16,
  syncIntervalMinutes: 15,
  externalImages: "never",
  allowLocalSecretFallback: false,
  notificationsEnabled: true,
  notificationSound: true,
  notificationPreview: false,
  runInBackground: true,
  accountNotifications: {},
  accountAppearance: {}
};

function normalizeSettings(settings: Settings): Settings {
  return { ...defaultSettings, ...settings };
}

function resolveCountScopeAccountId(state: Pick<MailState, "selectedAccountId" | "selectedSpecialAccountId" | "accounts">): number | undefined {
  return state.selectedSpecialAccountId ?? state.selectedAccountId ?? state.accounts[0]?.id;
}

function resolveBackendView(view: MailState["selectedView"]): "favorites" | "important" | "unified_inbox" | undefined {
  if (view === "favorites" || view === "important") return view;
  if (view === "unifiedInbox") return "unified_inbox";
  return undefined;
}

type StoreGet = () => MailState;
type StoreSet = (
  partial: Partial<MailState> | ((state: MailState) => Partial<MailState>)
) => void;

function patchReadState(set: StoreSet, ids: number[], read: boolean) {
  const idSet = new Set(ids);
  set((state) => {
    let unreadDelta = 0;
    const folderDeltas = new Map<number, number>();
    for (const id of ids) {
      const previous = state.emails.find((item) => item.id === id);
      if (!previous || previous.isRead === read) continue;
      const delta = read ? -1 : 1;
      unreadDelta += delta;
      folderDeltas.set(previous.folderId, (folderDeltas.get(previous.folderId) ?? 0) + delta);
    }
    return {
      emails: state.emails.map((item) => (idSet.has(item.id) ? { ...item, isRead: read } : item)),
      selectedEmail:
        state.selectedEmail && idSet.has(state.selectedEmail.id)
          ? { ...state.selectedEmail, isRead: read }
          : state.selectedEmail,
      mailCounts: unreadDelta === 0
        ? state.mailCounts
        : {
            ...state.mailCounts,
            unread: Math.max(0, state.mailCounts.unread + unreadDelta)
          },
      folders: folderDeltas.size === 0
        ? state.folders
        : state.folders.map((folder) => {
            const delta = folderDeltas.get(folder.id);
            return delta ? { ...folder, unreadCount: Math.max(0, folder.unreadCount + delta) } : folder;
          })
    };
  });
}

function isAnyAccountSyncing(accountSyncing: Record<number, boolean>) {
  return Object.values(accountSyncing).some(Boolean);
}

function setAccountSyncing(
  set: StoreSet,
  accountIds: number[],
  syncing: boolean
) {
  set((state) => {
    const accountSyncing = { ...state.accountSyncing };
    for (const id of accountIds) {
      accountSyncing[id] = syncing;
    }
    return {
      accountSyncing,
      syncing: isAnyAccountSyncing(accountSyncing)
    };
  });
}

async function refreshMailboxMetadata(get: StoreGet, set: StoreSet) {
  const countScopeAccountId = resolveCountScopeAccountId(get());
  try {
    const [folders, mailCounts] = await Promise.all([
      mailService.getFolders(),
      mailService.getMailCounts(countScopeAccountId)
    ]);
    set({ folders, mailCounts, mailCountsAccountId: countScopeAccountId });
  } catch {
    // Background refresh should not block UI interactions.
  }
}

async function refreshVisibleEmails(get: StoreGet, set: StoreSet) {
  const view = get().selectedView;
  const specialAccountId = get().selectedSpecialAccountId;
  const countScopeAccountId = resolveCountScopeAccountId(get());
  const [emails, folders, mailCounts] = await Promise.all([
    view === "folder"
      ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
      : view === "dashboard" || view === "health"
        ? Promise.resolve(get().emails)
        : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters),
    mailService.getFolders(),
    mailService.getMailCounts(countScopeAccountId)
  ]);
  window.requestAnimationFrame(() => {
    set({
      emails,
      folders,
      mailCounts,
      mailCountsAccountId: countScopeAccountId
    });
  });
}

function scheduleBackgroundRefresh(get: StoreGet, set: StoreSet) {
  if (refreshScheduled) window.clearTimeout(refreshScheduled);
  refreshScheduled = window.setTimeout(() => {
    refreshScheduled = undefined;
    void refreshVisibleEmails(get, set);
  }, 300);
}

async function notifyNewMessages(report: SyncReport, state: MailState) {
  const allNewMessages = report.newMessages ?? [];
  const notificationsEnabled = state.settings.notificationsEnabled;
  if (!notificationsEnabled || allNewMessages.length === 0) return;
  if (document.hasFocus() && !document.hidden) return;

  const permissionGranted = await ensureNotificationPermission();
  if (!permissionGranted) return;

  for (const item of allNewMessages) {
    if (notifiedMessageIds.has(item.emailId)) continue;
    if (item.isRead) continue;
    if (item.folderRole === "spam" || item.folderRole === "drafts") continue;
    const accountAllowed = state.settings.accountNotifications?.[String(item.accountId)] ?? true;
    if (!accountAllowed) continue;
    notifiedMessageIds.add(item.emailId);
    const account = state.accounts.find((entry) => entry.id === item.accountId);
    const title = state.settings.notificationPreview ? (item.subject || "Neue Mail") : "Neue Mail";
    const body = state.settings.notificationPreview
      ? `${item.sender} · ${account?.displayName ?? account?.email ?? "Account"}`
      : `Neuer Eingang in ${account?.displayName ?? account?.email ?? "Account"}`;
    await showDesktopNotification({
      title,
      body,
      silent: !state.settings.notificationSound,
      target: {
        emailId: item.emailId,
        accountId: item.accountId,
        folderId: item.folderId
      },
      onOpen: async (target) => {
        const store = useMailStore.getState();
        await store.selectAccount(target.accountId);
        await store.selectFolder(target.folderId);
        const full = await mailService.getEmail(target.emailId);
        await store.selectEmail(full);
      }
    });
  }
}

export function setupMailStoreListeners() {
  if (listenersReady || !isDesktop) return;
  listenersReady = true;
  void listenDesktop<SyncReport>("sync-account-complete", (event) => {
    useMailStore.getState().handleSyncAccountComplete(event.payload);
  });
  void listenDesktop<{ accountId: number; message: string }>("sync-account-error", (event) => {
    useMailStore.getState().handleSyncAccountError(event.payload);
  });
  void listenDesktop<Email>("email-hydrated", (event) => {
    useMailStore.getState().handleEmailHydrated(event.payload);
  });
}

export const useMailStore = create<MailState>((set, get) => ({
  accounts: [],
  folders: [],
  emails: [],
  query: "",
  selectedView: "folder",
  selectedEmailIds: [],
  loading: false,
  startupStatus: undefined,
  syncing: false,
  accountSyncing: {},
  syncStatus: "",
  hasSynced: false,
  databaseSizeBytes: 0,
  settings: defaultSettings,
  mailCounts: { favorites: 0, important: 0, unread: 0, withAttachments: 0, today: 0, thisWeek: 0, perAccount: [] },
  mailCountsAccountId: undefined,
  tags: [],
  categories: [],
  rules: [],
  contacts: [],
  searchFilters: {},
  drafts: [],
  settingsOpen: false,
  async loadInitial() {
    set({ loading: true, startupStatus: "Konten laden..." });
    try {
      const accounts = await mailService.getAccounts();
      set({ startupStatus: "Ordner und Einstellungen laden..." });
      const [folders, settings, tags, categories, rules, contacts, databaseSizeBytes, healthStatus] = await Promise.all([
        mailService.getFolders(),
        mailService.getSettings(),
        mailService.getTags(),
        mailService.getCategories(),
        mailService.getRules(),
        mailService.getContacts(),
        mailService.getDatabaseSize(),
        mailService.getHealthStatus()
      ]);
      const normalizedSettings = normalizeSettings(settings);
      const selectedAccountId = normalizedSettings.defaultAccountId ?? accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id;
      const accountFolders = selectedAccountId
        ? folders.filter((folder) => folder.accountId === selectedAccountId)
        : folders;
      const selectedFolderId = accountFolders.find((folder) => folder.role === "inbox")?.id ?? accountFolders[0]?.id;
      set({ startupStatus: "Mails und Entwürfe laden..." });
      const [emails, drafts, mailCounts] = await Promise.all([
        selectedFolderId ? mailService.getEmails(selectedFolderId) : Promise.resolve([]),
        mailService.getDrafts(selectedAccountId),
        mailService.getMailCounts(selectedAccountId)
      ]);
      set({ accounts, folders, settings: normalizedSettings, selectedAccountId, selectedFolderId, selectedView: "dashboard", selectedSpecialAccountId: undefined, selectedCategoryId: undefined, emails, selectedEmailIds: [], mailCounts, mailCountsAccountId: selectedAccountId, drafts, tags, categories, rules, contacts, databaseSizeBytes, healthStatus });
    } finally {
      set({ loading: false, startupStatus: undefined });
    }
  },
  async saveAccount(account) {
    set({ loading: true, syncError: undefined, syncStatus: "Konto wird gespeichert..." });
    try {
      const saved = await mailService.saveAccount(account);
      set({ selectedAccountId: saved.id, syncStatus: "Konto gespeichert." });
      await get().loadInitial();
      // Run first sync in background to avoid blocking UI after account save.
      set({ syncStatus: "Konto gespeichert. Initiale Synchronisation läuft im Hintergrund..." });
      void get().sync(false);
    } catch (error) {
      set({ syncError: String(error), syncStatus: "Konto konnte nicht gespeichert werden" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  async connectGoogleAccount(clientId) {
    set({ loading: true, syncError: undefined, syncStatus: "Google-Anmeldung wird geöffnet..." });
    try {
      const saved = await mailService.connectGoogleAccount(clientId);
      set({ selectedAccountId: saved.id, syncStatus: "Google-Konto verbunden." });
      await get().loadInitial();
      set({ syncStatus: "Google-Konto verbunden. Initiale Synchronisation läuft im Hintergrund..." });
      void get().sync(false);
    } catch (error) {
      set({ syncError: String(error), syncStatus: "Google-Konto konnte nicht verbunden werden" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  async deleteAccount(accountId) {
    set({ loading: true, syncError: undefined });
    try {
      await mailService.deleteAccount(accountId);
      await get().loadInitial();
    } catch (error) {
      set({ syncError: String(error) });
    } finally {
      set({ loading: false });
    }
  },
  async testAccount(accountId) {
    set({ syncStatus: "Verbindung wird getestet...", syncError: undefined });
    try {
      const result = await mailService.testAccount(accountId);
      if (result.imapOk && result.smtpOk) {
        set({ syncStatus: "IMAP und SMTP erfolgreich" });
        return;
      }
      const errors = [result.imapError, result.smtpError].filter(Boolean).join("\n");
      set({
        syncError: errors || "Kontotest fehlgeschlagen",
        syncStatus: "IMAP/SMTP Test fehlgeschlagen"
      });
    } catch (error) {
      set({ syncError: String(error), syncStatus: "Verbindung fehlgeschlagen" });
    }
  },
  async selectAccount(accountId) {
    const folders = get().folders.filter((folder) => folder.accountId === accountId);
    const selectedFolderId = folders.find((folder) => folder.role === "inbox")?.id ?? folders[0]?.id;
    set({ selectedAccountId: accountId, selectedFolderId, selectedView: "folder", selectedSpecialAccountId: undefined, selectedCategoryId: undefined, selectedEmail: undefined, selectedEmailIds: [], searchFilters: {}, loading: true });
    try {
      const [emails, mailCounts] = await Promise.all([
        selectedFolderId ? mailService.getEmails(selectedFolderId, get().query, undefined, accountId, get().searchFilters) : Promise.resolve([]),
        mailService.getMailCounts(accountId)
      ]);
      set({ emails, mailCounts, mailCountsAccountId: accountId });
    } catch (error) {
      set({ syncError: `Ordner konnte nicht geladen werden: ${String(error)}`, emails: [] });
    } finally {
      set({ loading: false });
    }
  },
  async selectFolder(folderId) {
    const folder = get().folders.find((item) => item.id === folderId);
    set({ selectedAccountId: folder?.accountId ?? get().selectedAccountId, selectedFolderId: folderId, selectedView: "folder", selectedSpecialAccountId: undefined, selectedCategoryId: undefined, selectedEmail: undefined, selectedEmailIds: [], searchFilters: {}, loading: true });
    try {
      const [emails, mailCounts] = await Promise.all([
        mailService.getEmails(folderId, get().query, undefined, folder?.accountId, get().searchFilters),
        mailService.getMailCounts(folder?.accountId ?? get().selectedAccountId)
      ]);
      set({ emails, mailCounts, mailCountsAccountId: folder?.accountId ?? get().selectedAccountId });
    } catch (error) {
      set({ syncError: `Ordner konnte nicht geladen werden: ${String(error)}`, emails: [] });
    } finally {
      set({ loading: false });
    }
  },
  async selectSpecialView(view, accountId) {
    set({ selectedView: view, selectedAccountId: accountId, selectedSpecialAccountId: accountId, selectedFolderId: undefined, selectedCategoryId: undefined, selectedEmail: undefined, selectedEmailIds: [], searchFilters: {}, loading: true });
    try {
      const [emails, mailCounts] = await Promise.all([
        mailService.getEmails(undefined, get().query, view, accountId, get().searchFilters),
        mailService.getMailCounts(accountId)
      ]);
      set({ emails, mailCounts, mailCountsAccountId: accountId });
    } catch (error) {
      set({ syncError: `Ansicht konnte nicht geladen werden: ${String(error)}`, emails: [] });
    } finally {
      set({ loading: false });
    }
  },
  async openUnifiedInbox(accountId) {
    set({ selectedView: "unifiedInbox", selectedSpecialAccountId: accountId, selectedFolderId: undefined, selectedCategoryId: undefined, selectedEmail: undefined, selectedEmailIds: [], loading: true });
    try {
      const [emails, mailCounts] = await Promise.all([
        mailService.getEmails(undefined, get().query, "unified_inbox", accountId, get().searchFilters),
        mailService.getMailCounts(accountId)
      ]);
      set({ emails, mailCounts, mailCountsAccountId: accountId });
    } catch (error) {
      set({ syncError: `Die gemeinsamen Posteingänge konnten nicht geladen werden: ${String(error)}`, emails: [] });
    } finally {
      set({ loading: false });
    }
  },
  async openHealth() {
    set({ selectedView: "health", selectedEmail: undefined, selectedEmailIds: [], loading: true, syncError: undefined });
    try {
      const [healthStatus, categories] = await Promise.all([
        mailService.getHealthStatus(),
        mailService.getCategories()
      ]);
      set({ healthStatus, categories });
    } catch (error) {
      set({ syncError: `Der Systemstatus konnte nicht geladen werden: ${String(error)}` });
    } finally {
      set({ loading: false });
    }
  },
  async selectCategory(categoryId) {
    set({ selectedCategoryId: categoryId, selectedView: "unifiedInbox", selectedFolderId: undefined, selectedEmail: undefined, selectedEmailIds: [], loading: true });
    try {
      const filters = { ...get().searchFilters, categoryId };
      const emails = await mailService.getEmails(undefined, get().query, "unified_inbox", get().selectedSpecialAccountId, filters);
      set({ searchFilters: filters, emails });
    } finally {
      set({ loading: false });
    }
  },
  openDashboard() {
    set({ selectedView: "dashboard", selectedFolderId: undefined, selectedSpecialAccountId: undefined, selectedCategoryId: undefined, selectedEmail: undefined, selectedEmailIds: [], searchFilters: {} });
  },
  async selectEmail(email) {
    set({ syncError: undefined, selectedEmail: email, selectedEmailIds: [] });
    if (!email.isRead) {
      patchReadState(set, [email.id], true);
      void mailService.markRead(email.id, true);
    }
    void mailService
      .getEmail(email.id)
      .then((detail) => {
        set((state) => ({
          selectedEmail:
            state.selectedEmail?.id === email.id ? { ...state.selectedEmail, ...detail } : state.selectedEmail
        }));
      })
      .catch((error) => set({ syncError: `Mail konnte nicht geöffnet werden: ${String(error)}` }));
    void mailService.hydrateEmail(email.id);
  },
  closeEmail() {
    set({ selectedEmail: undefined });
  },
  toggleEmailSelection(id, selected) {
    set((state) => ({
      selectedEmailIds: selected
        ? state.selectedEmailIds.includes(id)
          ? state.selectedEmailIds
          : [...state.selectedEmailIds, id]
        : state.selectedEmailIds.filter((item) => item !== id)
    }));
  },
  setEmailSelection(ids) {
    set({ selectedEmailIds: [...new Set(ids)] });
  },
  clearEmailSelection() {
    set({ selectedEmailIds: [] });
  },
  async refreshCurrentView() {
    set({ syncError: undefined });
    try {
      await refreshVisibleEmails(get, set);
      set({ selectedEmailIds: [], syncStatus: "Ansicht aktualisiert" });
    } catch (error) {
      set({ syncError: `Aktualisieren fehlgeschlagen: ${String(error)}` });
    }
  },
  async sync(allAccounts = false) {
    const accountId = allAccounts ? undefined : get().selectedAccountId ?? get().accounts[0]?.id;
    if (!allAccounts && !accountId) return;
    const targetAccountIds = allAccounts
      ? get().accounts.map((account) => account.id)
      : [accountId!];
    if (targetAccountIds.some((id) => get().accountSyncing[id])) return;

    const accountName = accountId
      ? get().accounts.find((account) => account.id === accountId)?.displayName
      : undefined;
    setAccountSyncing(set, targetAccountIds, true);
    set({
      syncError: undefined,
      syncStatus: allAccounts
        ? "Synchronisiere alle Konten..."
        : `Synchronisiere ${accountName ?? "Konto"}...`
    });
    const request = allAccounts
      ? mailService.syncAllMessages()
      : mailService.syncAllMessages(accountId);
    void request.catch((error) => {
      setAccountSyncing(set, targetAccountIds, false);
      set({
        syncStatus: "Synchronisation fehlgeschlagen",
        syncError: error instanceof Error ? error.message : String(error)
      });
    });
  },
  async realtimeSyncInboxes() {
    const accounts = get().accounts;
    if (!accounts.length) return;
    const pendingAccountIds = accounts
      .map((account) => account.id)
      .filter((id) => !get().accountSyncing[id]);
    if (!pendingAccountIds.length) return;

    setAccountSyncing(set, pendingAccountIds, true);
    set({
      syncError: undefined,
      syncStatus: "Auto-Sync aktiv..."
    });
    for (const accountId of pendingAccountIds) {
      void mailService.syncInbox(accountId).catch((error) => {
        setAccountSyncing(set, [accountId], false);
        set({
          syncStatus: "Automatische Synchronisation fehlgeschlagen",
          syncError: error instanceof Error ? error.message : String(error)
        });
      });
    }
  },
  handleSyncAccountComplete(report) {
    const accountIds =
      report.accountId <= 0 ? get().accounts.map((account) => account.id) : [report.accountId];
    setAccountSyncing(set, accountIds, false);
    set({
      hasSynced: true,
      lastSyncAt: new Date().toISOString(),
      syncStatus:
        report.messagesSynced > 0
          ? `${report.messagesSynced}/${Math.max(report.requestedMessages, report.messagesSynced)} Mails synchronisiert`
          : "Synchronisation abgeschlossen",
      syncError: report.errors.length ? report.errors.join("\n") : undefined
    });
    if (report.messagesSynced > 0 || (report.newMessages?.length ?? 0) > 0) {
      scheduleBackgroundRefresh(get, set);
    } else {
      void refreshMailboxMetadata(get, set);
    }
    if (!isDesktop) {
      void notifyNewMessages(report, get());
    }
  },
  handleSyncAccountError(payload) {
    const accountIds =
      payload.accountId <= 0 ? get().accounts.map((account) => account.id) : [payload.accountId];
    setAccountSyncing(set, accountIds, false);
    set({
      hasSynced: true,
      syncStatus: "Synchronisation fehlgeschlagen",
      syncError: payload.message
    });
  },
  handleEmailHydrated(email) {
    set((state) => ({
      selectedEmail: state.selectedEmail?.id === email.id ? email : state.selectedEmail
    }));
  },
  async loadOlderMessages() {
    const accountId = get().selectedAccountId ?? get().accounts[0]?.id;
    if (!accountId) return;
    const folderId = get().selectedView === "folder" ? get().selectedFolderId : undefined;
    set({ syncError: undefined, syncStatus: "Lade ältere Nachrichten..." });
    try {
      const report = await mailService.loadOlderMessages(accountId, folderId);
      const view = get().selectedView;
      const specialAccountId = get().selectedSpecialAccountId;
      const countScopeAccountId = resolveCountScopeAccountId(get());
      const [emails, folders, mailCounts] = await Promise.all([
        view === "folder"
          ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
          : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters),
        mailService.getFolders(),
        mailService.getMailCounts(countScopeAccountId)
      ]);
      set({
        emails,
        folders,
        mailCounts,
        mailCountsAccountId: countScopeAccountId,
        hasSynced: true,
        syncStatus: `${report.messagesSynced} ältere Nachrichten geladen`,
        syncError: report.errors.length ? report.errors.join("\n") : undefined
      });
    } catch (error) {
      set({ syncError: String(error), syncStatus: "Ältere Nachrichten konnten nicht geladen werden" });
    }
  },
  async search(query) {
    set({ query, loading: true });
    try {
      const view = get().selectedView;
      const specialAccountId = get().selectedSpecialAccountId;
      const parsed = parseSearchQuery(query);
      const mergedFilters = { ...get().searchFilters, ...parsed.filters };
      const emails = view === "folder"
        ? await mailService.getEmails(get().selectedFolderId, parsed.freeText, undefined, get().selectedAccountId, mergedFilters)
        : await mailService.getEmails(undefined, parsed.freeText, resolveBackendView(view), specialAccountId, mergedFilters);
      set({ emails });
    } finally {
      set({ loading: false });
    }
  },
  async setSearchFilters(filters) {
    set({ searchFilters: filters, loading: true });
    try {
      const view = get().selectedView;
      const specialAccountId = get().selectedSpecialAccountId;
      const parsed = parseSearchQuery(get().query);
      const mergedFilters = { ...filters, ...parsed.filters };
      const emails = view === "folder"
        ? await mailService.getEmails(get().selectedFolderId, parsed.freeText, undefined, get().selectedAccountId, mergedFilters)
        : await mailService.getEmails(undefined, parsed.freeText, resolveBackendView(view), specialAccountId, mergedFilters);
      set({ emails });
    } finally {
      set({ loading: false });
    }
  },
  openComposer(draft) {
    const accountId = draft?.accountId ?? get().selectedAccountId ?? get().accounts[0]?.id;
    set({ composer: { accountId, attachments: [], ...draft } });
    void get().loadDrafts(accountId);
  },
  editDraft(draft) {
    set({ composer: { ...draft, attachments: draft.attachments ?? [] } });
  },
  closeComposer() {
    set({ composer: undefined });
  },
  async loadDrafts(accountId) {
    const drafts = await mailService.getDrafts(accountId ?? get().selectedAccountId);
    set({ drafts });
  },
  async saveComposerDraft(draft) {
    const id = await mailService.saveDraft(draft);
    const accountId = draft.accountId ?? get().selectedAccountId;
    const drafts = await mailService.getDrafts(accountId);
    set((state) => ({
      drafts,
      composer: state.composer ? { ...state.composer, ...draft, id } : state.composer
    }));
    return id;
  },
  async deleteComposerDraft(id) {
    await mailService.deleteDraft(id);
    set((state) => ({
      drafts: state.drafts.filter((draft) => draft.id !== id),
      composer: state.composer?.id === id ? undefined : state.composer
    }));
  },
  openSettings() {
    set({ settingsOpen: true });
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  async sendComposer(draft) {
    await mailService.sendMail(draft);
    const drafts = await mailService.getDrafts(draft.accountId);
    set({ composer: undefined, drafts });
  },
  async deleteSelected() {
    const selectedIds = get().selectedEmailIds.length
      ? get().selectedEmailIds
      : get().selectedEmail
        ? [get().selectedEmail!.id]
        : [];
    if (!selectedIds.length) return;
    const selectedFolder = get().folders.find((folder) => folder.id === get().selectedFolderId);
    const emailsBeforeDelete = get().emails;
    const selectedEmailBeforeDelete = get().selectedEmail;
    const selectedIdSet = new Set(selectedIds);
    try {
      if (get().selectedView === "folder" && selectedFolder?.role === "trash") {
        set({
          emails: emailsBeforeDelete.filter((email) => !selectedIdSet.has(email.id)),
          selectedEmail: undefined,
          selectedEmailIds: [],
          syncStatus: `${selectedIds.length} Mails werden endgültig gelöscht...`,
          syncError: undefined
        });
        await mailService.deleteEmailsPermanently(selectedIds);
      } else {
        await Promise.all(selectedIds.map((id) => mailService.deleteEmail(id)));
      }
    } catch (error) {
      set({
        syncError: `Löschen fehlgeschlagen: ${String(error)}`,
        syncStatus: "Nachricht wurde nicht gelöscht",
        emails: emailsBeforeDelete,
        selectedEmail: selectedEmailBeforeDelete,
        selectedEmailIds: selectedIds
      });
      return;
    }
    const view = get().selectedView;
    const specialAccountId = get().selectedSpecialAccountId;
    const countScopeAccountId = resolveCountScopeAccountId(get());
    const [emails, folders, mailCounts] = await Promise.all([
      view === "folder"
        ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
        : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters),
      mailService.getFolders(),
      mailService.getMailCounts(countScopeAccountId)
    ]);
    set({
      selectedEmail: undefined,
      selectedEmailIds: [],
      emails,
      folders,
      mailCounts,
      mailCountsAccountId: countScopeAccountId,
      syncStatus: "Nachrichten gelöscht"
    });
  },
  async markReadSelected() {
    const selectedIds = get().selectedEmailIds.length
      ? get().selectedEmailIds
      : get().selectedEmail
        ? [get().selectedEmail!.id]
        : [];
    if (!selectedIds.length) return;
    patchReadState(set, selectedIds, true);
    set({ selectedEmailIds: [] });
    void Promise.all(selectedIds.map((id) => mailService.markRead(id, true)));
  },
  async archiveSelected() {
    const selectedIds = get().selectedEmailIds.length
      ? get().selectedEmailIds
      : get().selectedEmail
        ? [get().selectedEmail!.id]
        : [];
    if (!selectedIds.length) return;

    const emailsById = new Map(get().emails.map((email) => [email.id, email]));
    const archiveByAccount = new Map(
      get().folders
        .filter((folder) => folder.role === "archive")
        .map((folder) => [folder.accountId, folder.id])
    );

    await Promise.all(selectedIds.map(async (id) => {
      const email = emailsById.get(id);
      if (!email) return;
      const archiveFolderId = archiveByAccount.get(email.accountId);
      if (!archiveFolderId) {
        throw new Error("Kein Archiv-Ordner gefunden.");
      }
      await mailService.moveEmail(id, archiveFolderId);
    }));

    const view = get().selectedView;
    const specialAccountId = get().selectedSpecialAccountId;
    const countScopeAccountId = resolveCountScopeAccountId(get());
    const [emails, folders, mailCounts] = await Promise.all([
      view === "folder"
        ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
        : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters),
      mailService.getFolders(),
      mailService.getMailCounts(countScopeAccountId)
    ]);
    set({ selectedEmail: undefined, selectedEmailIds: [], emails, folders, mailCounts, mailCountsAccountId: countScopeAccountId });
  },
  async moveSelected(targetFolderId) {
    const selectedIds = get().selectedEmailIds.length
      ? get().selectedEmailIds
      : get().selectedEmail
        ? [get().selectedEmail!.id]
        : [];
    if (!selectedIds.length) return;
    await Promise.all(selectedIds.map((id) => mailService.moveEmail(id, targetFolderId)));
    const view = get().selectedView;
    const specialAccountId = get().selectedSpecialAccountId;
    const countScopeAccountId = resolveCountScopeAccountId(get());
    const [emails, folders, mailCounts] = await Promise.all([
      view === "folder"
        ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
        : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters),
      mailService.getFolders(),
      mailService.getMailCounts(countScopeAccountId)
    ]);
    set({ selectedEmail: undefined, selectedEmailIds: [], emails, folders, mailCounts, mailCountsAccountId: countScopeAccountId });
  },
  async toggleFavoriteSelected() {
    const selectedIds = get().selectedEmailIds.length
      ? get().selectedEmailIds
      : get().selectedEmail
        ? [get().selectedEmail!.id]
        : [];
    if (!selectedIds.length) return;
    await Promise.all(selectedIds.map((id) => mailService.toggleFavorite(id)));
    const view = get().selectedView;
    const specialAccountId = get().selectedSpecialAccountId;
    const countScopeAccountId = resolveCountScopeAccountId(get());
    const [mailCounts, emails] = await Promise.all([
      mailService.getMailCounts(countScopeAccountId),
      view === "folder"
        ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
        : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters)
    ]);
    set({ mailCounts, emails, selectedEmailIds: [], mailCountsAccountId: countScopeAccountId });
  },
  async toggleImportantSelected() {
    const selectedIds = get().selectedEmailIds.length
      ? get().selectedEmailIds
      : get().selectedEmail
        ? [get().selectedEmail!.id]
        : [];
    if (!selectedIds.length) return;
    await Promise.all(selectedIds.map((id) => mailService.toggleImportant(id)));
    const view = get().selectedView;
    const specialAccountId = get().selectedSpecialAccountId;
    const countScopeAccountId = resolveCountScopeAccountId(get());
    const [mailCounts, emails] = await Promise.all([
      mailService.getMailCounts(countScopeAccountId),
      view === "folder"
        ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
        : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters)
    ]);
    set({ mailCounts, emails, selectedEmailIds: [], mailCountsAccountId: countScopeAccountId });
  },
  replyToSelected() {
    const selected = get().selectedEmail;
    if (!selected) return;
    const receivedAt = new Date(selected.receivedAt).toLocaleString();
    const quotedBody = [
      "",
      `Am ${receivedAt} schrieb ${selected.sender}:`,
      "> " + (selected.bodyText || selected.preview || "").split("\n").join("\n> ")
    ].join("\n");
    set({
      composer: {
        accountId: selected.accountId,
        to: selected.sender,
        subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
        body: quotedBody,
        attachments: []
      }
    });
    void get().loadDrafts(selected.accountId);
  },
  forwardSelected() {
    const selected = get().selectedEmail;
    if (!selected) return;
    const receivedAt = new Date(selected.receivedAt).toLocaleString();
    const forwardBody = [
      "",
      "--- Weitergeleitete Nachricht ---",
      `Von: ${selected.sender}`,
      `Betreff: ${selected.subject}`,
      `Datum: ${receivedAt}`,
      "",
      selected.bodyText || selected.preview || ""
    ].join("\n");
    set({
      composer: {
        accountId: selected.accountId,
        to: "",
        subject: selected.subject.startsWith("Fwd:") ? selected.subject : `Fwd: ${selected.subject}`,
        body: forwardBody,
        attachments: []
      }
    });
    void get().loadDrafts(selected.accountId);
  },
  async updateSettings(settings) {
    await mailService.saveSettings(settings);
    set({ settings });
  },
  async loadTags() {
    const tags = await mailService.getTags();
    set({ tags });
  },
  async loadRules(accountId) {
    const rules = await mailService.getRules(accountId ?? get().selectedAccountId);
    set({ rules });
  },
  async saveRule(rule) {
    await mailService.saveRule(rule);
    const rules = await mailService.getRules(get().selectedAccountId);
    set({ rules });
  },
  async deleteRule(id) {
    await mailService.deleteRule(id);
    const rules = await mailService.getRules(get().selectedAccountId);
    set({ rules });
  },
  async loadContacts(query) {
    const contacts = await mailService.getContacts(query);
    set({ contacts });
  },
  async saveContact(contact) {
    await mailService.saveContact(contact);
    const contacts = await mailService.getContacts();
    set({ contacts });
  },
  async deleteContact(id) {
    await mailService.deleteContact(id);
    const contacts = await mailService.getContacts();
    set({ contacts });
  },
  async createTag(name, color) {
    await mailService.createTag(name, color);
    const tags = await mailService.getTags();
    set({ tags });
  },
  async saveTag(tag) {
    await mailService.saveTag(tag);
    const tags = await mailService.getTags();
    set({ tags });
  },
  async deleteTag(id) {
    await mailService.deleteTag(id);
    const tags = await mailService.getTags();
    set({ tags });
  },
  async setEmailTags(emailId, tagIds) {
    await mailService.setEmailTags(emailId, tagIds);
    const view = get().selectedView;
    const specialAccountId = get().selectedSpecialAccountId;
    const emails = view === "folder"
      ? await mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
      : await mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters);
    const selectedEmail = get().selectedEmail?.id === emailId
      ? await mailService.getEmail(emailId)
      : get().selectedEmail;
    set({ emails, selectedEmail });
  },
  async setSelectedEmailTags(tagIds) {
    const emailIds = get().selectedEmailIds;
    if (!emailIds.length) return;
    await mailService.setEmailsTags(emailIds, tagIds);
    await get().refreshCurrentView();
  },
  async quickAction(emailId, action) {
    const email = get().emails.find((item) => item.id === emailId);
    if (!email) return;
    if (action === "delete") {
      try {
        await mailService.deleteEmail(emailId);
      } catch (error) {
        set({
          syncError: `Löschen fehlgeschlagen: ${String(error)}`,
          syncStatus: "Nachricht wurde nicht gelöscht"
        });
        return;
      }
    } else if (action === "favorite") {
      await mailService.toggleFavorite(emailId);
    } else if (action === "important") {
      await mailService.toggleImportant(emailId);
    } else if (action === "read") {
      patchReadState(set, [emailId], true);
      void mailService.markRead(emailId, true);
      return;
    } else if (action === "archive") {
      const archiveFolder = get().folders.find((folder) => folder.accountId === email.accountId && folder.role === "archive");
      if (!archiveFolder) {
        set({ syncError: "Kein Archiv-Ordner gefunden." });
        return;
      }
      await mailService.moveEmail(emailId, archiveFolder.id);
    }
    const view = get().selectedView;
    const specialAccountId = get().selectedSpecialAccountId;
    const countScopeAccountId = resolveCountScopeAccountId(get());
    const [emails, folders, mailCounts] = await Promise.all([
      view === "folder"
        ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
        : view === "dashboard"
          ? mailService.getEmails(get().selectedFolderId, get().query, undefined, get().selectedAccountId, get().searchFilters)
          : mailService.getEmails(undefined, get().query, resolveBackendView(view), specialAccountId, get().searchFilters),
      mailService.getFolders(),
      mailService.getMailCounts(countScopeAccountId)
    ]);
    set({ emails, folders, mailCounts, mailCountsAccountId: countScopeAccountId });
  }
}));
