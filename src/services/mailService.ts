import { invokeDesktop, isDesktop } from "./desktop";
import type {
  Account,
  BackupPayload,
  Contact,
  ContactInput,
  DiagnoseAccountResult,
  DiagnoseInboxResult,
  Draft,
  Email,
  Folder,
  HealthStatus,
  AttachmentPreview,
  IcsPreview,
  MailRule,
  MailCounts,
  SmartCategory,
  RuleInput,
  ServerMessageSummary,
  Settings,
  SyncReport,
  Tag
} from "../types";

export type AccountTestResult = {
  imapOk: boolean;
  smtpOk: boolean;
  imapError?: string;
  smtpError?: string;
};

export type AccountInput = Omit<Account, "id" | "isDefault"> & {
  password: string;
  smtpPassword?: string;
  isDefault?: boolean;
  useTls?: boolean;
};

export type MailQueryFilters = {
  unreadOnly?: boolean;
  favoriteOnly?: boolean;
  importantOnly?: boolean;
  hasAttachment?: boolean;
  dateRange?: "today" | "week";
  tagId?: number;
  from?: string;
  to?: string;
  subject?: string;
  isRead?: boolean;
  before?: string;
  after?: string;
  categoryId?: number;
};

let browserSettings: Settings = {
  theme: "light",
  accentColor: "blue",
  layoutMode: "standard",
  fontSize: 16,
  syncIntervalMinutes: 15,
  externalImages: "never",
  allowLocalSecretFallback: true,
  notificationsEnabled: true,
  notificationSound: true,
  notificationPreview: true,
  runInBackground: true,
  accountNotifications: {},
  accountAppearance: {}
};

const browserService = {
  getAccounts: async (): Promise<Account[]> => [],
  saveAccount: async (): Promise<Account> => {
    throw new Error("Konten koennen nur in der Electron-Desktop-App gespeichert werden.");
  },
  getFolders: async (_accountId?: number): Promise<Folder[]> => [],
  getEmails: async (_folderId?: number, _query?: string, _view?: "favorites" | "important" | "unified_inbox", _accountId?: number, _filters?: MailQueryFilters): Promise<Email[]> => [],
  getEmail: async (_id: number): Promise<Email> => {
    throw new Error("Keine E-Mail geladen.");
  },
  hydrateEmail: async (_id: number): Promise<Email> => {
    throw new Error("Keine E-Mail geladen.");
  },
  syncInbox: async (_accountId: number): Promise<SyncReport> => ({ accountId: 0, foldersSynced: 0, messagesSynced: 0, requestedMessages: 0, errors: [], newMessages: [] }),
  syncAllMessages: async (_accountId?: number): Promise<SyncReport> => ({ accountId: 0, foldersSynced: 0, messagesSynced: 0, requestedMessages: 0, errors: [], newMessages: [] }),
  loadOlderMessages: async (_accountId: number, _folderId?: number): Promise<SyncReport> => ({ accountId: 0, foldersSynced: 0, messagesSynced: 0, requestedMessages: 0, errors: [], newMessages: [] }),
  testAccount: async (_accountId: number): Promise<AccountTestResult> => ({ imapOk: true, smtpOk: true }),
  deleteAccount: async (_accountId: number) => undefined,
  markRead: async (_id: number, _read?: boolean) => undefined,
  moveEmail: async (_id: number, _targetFolderId: number) => undefined,
  deleteEmail: async (_id: number) => undefined,
  deleteEmailsPermanently: async (_ids: number[]) => 0,
  toggleFavorite: async (_id: number) => false,
  toggleImportant: async (_id: number) => false,
  getMailCounts: async (_accountId?: number): Promise<MailCounts> => ({ favorites: 0, important: 0, unread: 0, withAttachments: 0, today: 0, thisWeek: 0, perAccount: [] }),
  downloadAttachment: async (_attachmentId: number, _destinationPath: string) => undefined,
  getFileSize: async (_path: string) => 0,
  sendMail: async (_draft: Draft) => undefined,
  saveDraft: async (_draft: Draft) => 0,
  getDrafts: async (_accountId?: number): Promise<Draft[]> => [],
  deleteDraft: async (_id: number) => undefined,
  getTags: async (): Promise<Tag[]> => [],
  createTag: async (_name: string, _color: string): Promise<Tag> => ({ id: 0, name: "", color: "" }),
  deleteTag: async (_id: number) => undefined,
  setEmailTags: async (_emailId: number, _tagIds: number[]) => undefined,
  getCategories: async (): Promise<SmartCategory[]> => [],
  getRules: async (_accountId?: number): Promise<MailRule[]> => [],
  saveRule: async (_rule: RuleInput): Promise<MailRule> => ({
    id: 0, name: "", enabled: true, priority: 0, field: "sender", operator: "contains", value: "", actionType: "tag", createdAt: "", updatedAt: ""
  }),
  deleteRule: async (_id: number) => undefined,
  getContacts: async (_query?: string): Promise<Contact[]> => [],
  saveContact: async (_contact: ContactInput): Promise<Contact> => ({
    id: 0, name: "", email: "", usageCount: 0, isFavorite: false, createdAt: "", updatedAt: ""
  }),
  deleteContact: async (_id: number) => undefined,
  exportBackup: async (): Promise<BackupPayload> => ({
    version: "0.0.0",
    exportedAt: new Date().toISOString(),
    accounts: [],
    settings: browserSettings,
    rules: [],
    contacts: [],
    tags: []
  }),
  importBackup: async (_backup: BackupPayload) => undefined,
  exportBackupToFile: async (_path: string) => undefined,
  importBackupFromFile: async (_path: string) => undefined,
  previewIcsAttachment: async (_attachmentId: number): Promise<IcsPreview | null> => null,
  getAttachmentPreview: async (_attachmentId: number): Promise<AttachmentPreview | null> => null,
  processSyncQueue: async (_accountId?: number) => 0,
  runIntegrityCheck: async (): Promise<{ duplicateMessageIds: number; orphanAttachments: number; accountFolderMismatches: number }> => ({
    duplicateMessageIds: 0,
    orphanAttachments: 0,
    accountFolderMismatches: 0
  }),
  getHealthStatus: async (): Promise<HealthStatus> => ({
    sync: { queuePendingTotal: 0, queueFailedTotal: 0, queueInFlightTotal: 0, accounts: [] },
    queue: { pending: 0, failed: 0, inFlight: 0 },
    databaseSizeBytes: 0,
    totalMails: 0,
    totalAttachments: 0,
    keyringAvailable: true,
    integrity: { duplicateMessageIds: 0, orphanAttachments: 0, accountFolderMismatches: 0 }
  }),
  getDatabaseSize: async () => 0,
  diagnoseAccount: async (_accountId: number): Promise<DiagnoseAccountResult> => ({
    accountId: _accountId,
    email: "",
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    loginStatus: "unavailable",
    localInboxMails: 0,
    idleActive: false,
    pollingActive: true
  }),
  diagnoseInbox: async (_accountId: number): Promise<DiagnoseInboxResult> => ({
    accountId: _accountId,
    mailboxes: [],
    localInboxMails: 0
  }),
  fetchLatestServerMessages: async (_accountId: number, _limit = 10): Promise<ServerMessageSummary[]> => [],
  forceFullInboxSync: async (_accountId: number, _limit = 50): Promise<SyncReport> => ({ accountId: _accountId, foldersSynced: 0, messagesSynced: 0, requestedMessages: 0, errors: [], newMessages: [] }),
  forceIncrementalSync: async (_accountId: number): Promise<SyncReport> => ({ accountId: _accountId, foldersSynced: 0, messagesSynced: 0, requestedMessages: 0, errors: [], newMessages: [] }),
  setPollingActive: async (_accountId: number, _active: boolean) => undefined,
  search: async (_query: string): Promise<Email[]> => [],
  getSettings: async () => browserSettings,
  saveSettings: async (settings: Settings) => {
    browserSettings = settings;
  },
  testDesktopNotification: async () => "Nur in der Desktop-App verfügbar.",
  requestClose: async () => undefined
};

const electronService = {
  getAccounts: () => invokeDesktop<Account[]>("get_accounts"),
  saveAccount: (account: AccountInput) => invokeDesktop<Account>("save_account", { account }),
  getFolders: (accountId?: number) => invokeDesktop<Folder[]>("get_folders", { accountId }),
  getEmails: (folderId?: number, query?: string, view?: "favorites" | "important" | "unified_inbox", accountId?: number, filters?: MailQueryFilters) => invokeDesktop<Email[]>("get_emails", { accountId, folderId, query, view, filters }),
  getEmail: (id: number) => invokeDesktop<Email>("get_email", { id }),
  hydrateEmail: (id: number) => invokeDesktop<Email>("hydrate_email", { id }),
  syncInbox: (accountId: number) => invokeDesktop<SyncReport>("sync_inbox", { accountId }),
  syncAllMessages: (accountId?: number) => invokeDesktop<SyncReport>("sync_all_messages", { accountId }),
  loadOlderMessages: (accountId: number, folderId?: number) => invokeDesktop<SyncReport>("load_older_messages", { accountId, folderId }),
  testAccount: (accountId: number) => invokeDesktop<AccountTestResult>("test_account", { accountId }),
  deleteAccount: (accountId: number) => invokeDesktop<void>("delete_account", { accountId }),
  markRead: (id: number, read = true) => invokeDesktop<void>("mark_email_read", { id, read }),
  deleteEmail: (id: number) => invokeDesktop<void>("delete_email", { id }),
  deleteEmailsPermanently: (ids: number[]) => invokeDesktop<number>("delete_emails_permanently", { ids }),
  moveEmail: (id: number, targetFolderId: number) => invokeDesktop<void>("move_email", { id, targetFolderId }),
  toggleFavorite: (id: number) => invokeDesktop<boolean>("toggle_favorite", { id }),
  toggleImportant: (id: number) => invokeDesktop<boolean>("toggle_important", { id }),
  getMailCounts: (accountId?: number) => invokeDesktop<MailCounts>("get_mail_counts", { accountId }),
  downloadAttachment: (attachmentId: number, destinationPath: string) => invokeDesktop<void>("download_attachment", { attachmentId, destinationPath }),
  getFileSize: (path: string) => invokeDesktop<number>("get_file_size", { path }),
  sendMail: (draft: Draft) => invokeDesktop<void>("send_mail", { draft }),
  saveDraft: (draft: Draft) => invokeDesktop<number>("save_draft", { draft }),
  getDrafts: (accountId?: number) => invokeDesktop<Draft[]>("get_drafts", { accountId }),
  deleteDraft: (id: number) => invokeDesktop<void>("delete_draft", { id }),
  getTags: () => invokeDesktop<Tag[]>("get_tags"),
  createTag: (name: string, color: string) => invokeDesktop<Tag>("create_tag", { name, color }),
  deleteTag: (id: number) => invokeDesktop<void>("delete_tag", { id }),
  setEmailTags: (emailId: number, tagIds: number[]) => invokeDesktop<void>("set_email_tags", { emailId, tagIds }),
  getCategories: () => invokeDesktop<SmartCategory[]>("get_categories"),
  getRules: (accountId?: number) => invokeDesktop<MailRule[]>("get_rules", { accountId }),
  saveRule: (rule: RuleInput) => invokeDesktop<MailRule>("save_rule", { rule }),
  deleteRule: (id: number) => invokeDesktop<void>("delete_rule", { id }),
  getContacts: (query?: string) => invokeDesktop<Contact[]>("get_contacts", { query }),
  saveContact: (contact: ContactInput) => invokeDesktop<Contact>("save_contact", { contact }),
  deleteContact: (id: number) => invokeDesktop<void>("delete_contact", { id }),
  exportBackup: () => invokeDesktop<BackupPayload>("export_backup"),
  importBackup: (backup: BackupPayload) => invokeDesktop<void>("import_backup", { backup }),
  exportBackupToFile: (path: string) => invokeDesktop<void>("export_backup_to_file", { path }),
  importBackupFromFile: (path: string) => invokeDesktop<void>("import_backup_from_file", { path }),
  previewIcsAttachment: (attachmentId: number) => invokeDesktop<IcsPreview | null>("preview_ics_attachment", { attachmentId }),
  getAttachmentPreview: (attachmentId: number) => invokeDesktop<AttachmentPreview | null>("get_attachment_preview", { attachmentId }),
  processSyncQueue: (accountId?: number) => invokeDesktop<number>("process_sync_queue", { accountId }),
  runIntegrityCheck: () => invokeDesktop<{ duplicateMessageIds: number; orphanAttachments: number; accountFolderMismatches: number }>("run_integrity_check"),
  getHealthStatus: () => invokeDesktop<HealthStatus>("get_health_status"),
  getDatabaseSize: () => invokeDesktop<number>("get_database_size"),
  diagnoseAccount: (accountId: number) => invokeDesktop<DiagnoseAccountResult>("diagnose_account", { accountId }),
  diagnoseInbox: (accountId: number) => invokeDesktop<DiagnoseInboxResult>("diagnose_inbox", { accountId }),
  fetchLatestServerMessages: (accountId: number, limit = 10) => invokeDesktop<ServerMessageSummary[]>("fetch_latest_server_messages", { accountId, limit }),
  forceFullInboxSync: (accountId: number, limit = 50) => invokeDesktop<SyncReport>("force_full_inbox_sync", { accountId, limit }),
  forceIncrementalSync: (accountId: number) => invokeDesktop<SyncReport>("force_incremental_sync", { accountId }),
  setPollingActive: (accountId: number, active: boolean) => invokeDesktop<void>("set_polling_active", { accountId, active }),
  search: (query: string) => invokeDesktop<Email[]>("search_emails", { query }),
  getSettings: () => invokeDesktop<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invokeDesktop<void>("save_settings", { settings }),
  testDesktopNotification: () => invokeDesktop<string>("test_desktop_notification"),
  requestClose: () => invokeDesktop<void>("request_close")
};

export const mailService = isDesktop ? electronService : browserService;
