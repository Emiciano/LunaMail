export type ThemeMode = "light" | "dark";
export type AccentColor = "blue" | "green" | "orange" | "red" | "purple" | "teal" | "pink" | "gray";

export type LayoutMode = "compact" | "standard" | "comfortable";

export type AccountAppearance = {
  color?: string;
  emoji?: string;
  avatarUrl?: string;
};

export type Account = {
  id: number;
  displayName: string;
  email: string;
  provider: "custom" | "gmail" | string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  authType?: "password" | "oauth2";
  isDefault: boolean;
};

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type Folder = {
  id: number;
  accountId: number;
  name: string;
  remoteName: string;
  role: "inbox" | "sent" | "drafts" | "trash" | "spam" | "promotions" | "archive" | "custom";
  lastUid?: number;
  unreadCount: number;
};

export type Attachment = {
  id: number;
  emailId?: number;
  draftId?: number;
  fileName: string;
  contentType: string;
  size: number;
  path?: string;
};

export type Email = {
  id: number;
  accountId: number;
  folderId: number;
  uid?: number;
  messageId: string;
  sender: string;
  recipients: string;
  cc?: string;
  bcc?: string;
  subject: string;
  preview: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: string;
  isRead: boolean;
  isFavorite: boolean;
  isImportant: boolean;
  deletedAt?: string;
  updatedAt?: string;
  hasAttachments: boolean;
  attachments: Attachment[];
  tags: Tag[];
};

export type MailCounts = {
  favorites: number;
  important: number;
  unread: number;
  withAttachments: number;
  today: number;
  thisWeek: number;
  perAccount: { accountId: number; favorites: number; important: number }[];
};

export type SyncReport = {
  accountId: number;
  foldersSynced: number;
  messagesSynced: number;
  requestedMessages: number;
  errors: string[];
  newMessages: NewMessageSummary[];
};

export type NewMessageSummary = {
  emailId: number;
  accountId: number;
  folderId: number;
  folderRole: string;
  sender: string;
  subject: string;
  isRead: boolean;
};

export type MailboxInfo = {
  name: string;
  attributes: string[];
  inferredRole: string;
};

export type ServerMessageSummary = {
  uid: number;
  messageId: string;
  subject: string;
  sender: string;
  date: string;
  flags: string[];
  seen: boolean;
};

export type DiagnoseAccountResult = {
  accountId: number;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  loginStatus: string;
  inboxRemoteName?: string;
  lastKnownUid?: number;
  highestUidOnServer?: number;
  localInboxMails: number;
  lastSyncAt?: string;
  lastSyncError?: string;
  idleActive: boolean;
  pollingActive: boolean;
};

export type DiagnoseInboxResult = {
  accountId: number;
  inboxRemoteName?: string;
  lastKnownUid?: number;
  highestUidOnServer?: number;
  mailboxes: MailboxInfo[];
  localInboxMails: number;
};

export type Draft = {
  id?: number;
  accountId: number;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  updatedAt?: string;
  attachments: Attachment[];
};

export type Settings = {
  theme: ThemeMode;
  accentColor: AccentColor;
  layoutMode: LayoutMode;
  fontSize: number;
  syncIntervalMinutes: number;
  externalImages: "never" | "ask" | "always";
  allowLocalSecretFallback: boolean;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationPreview: boolean;
  runInBackground: boolean;
  accountNotifications: Record<string, boolean>;
  accountAppearance: Record<string, AccountAppearance>;
  googleOAuthClientId?: string;
  defaultAccountId?: number;
};

export type MailRule = {
  id: number;
  accountId?: number;
  name: string;
  enabled: boolean;
  priority: number;
  field: "sender" | "subject" | "to";
  operator: "contains" | "equals" | "startsWith" | "endsWith";
  value: string;
  actionType: "tag" | "favorite" | "important" | "read" | "move";
  actionValue?: string;
  createdAt: string;
  updatedAt: string;
};

export type RuleInput = Partial<Pick<MailRule, "id" | "accountId" | "enabled" | "priority" | "actionValue">> &
  Pick<MailRule, "name" | "field" | "operator" | "value" | "actionType">;

export type Contact = {
  id: number;
  name: string;
  email: string;
  lastContactAt?: string;
  usageCount: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = {
  id?: number;
  name: string;
  email: string;
  isFavorite?: boolean;
};

export type BackupAccount = {
  displayName: string;
  email: string;
  provider: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  authType?: "password" | "oauth2";
  isDefault: boolean;
};

export type BackupPayload = {
  version: string;
  exportedAt: string;
  accounts: BackupAccount[];
  settings: Settings;
  rules: MailRule[];
  contacts: Contact[];
  tags: Tag[];
};

export type IcsPreview = {
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  organizer?: string;
};

export type SmartCategory = {
  id: number;
  key: string;
  label: string;
  count: number;
};

export type AccountRuntimeStatus = {
  accountId: number;
  idleActive: boolean;
  pollingActive: boolean;
  pollingIntervalSeconds: number;
  queuePending: number;
  queueFailed: number;
  queueInFlight: number;
  lastSyncAt?: string;
  lastSyncError?: string;
  lastSyncDurationMs?: number;
  consecutiveFailures: number;
};

export type QueueStatusSnapshot = {
  pending: number;
  failed: number;
  inFlight: number;
};

export type IntegrityDiagnostics = {
  duplicateMessageIds: number;
  orphanAttachments: number;
  accountFolderMismatches: number;
};

export type HealthStatus = {
  sync: {
    queuePendingTotal: number;
    queueFailedTotal: number;
    queueInFlightTotal: number;
    accounts: AccountRuntimeStatus[];
  };
  queue: QueueStatusSnapshot;
  databaseSizeBytes: number;
  totalMails: number;
  totalAttachments: number;
  keyringAvailable: boolean;
  integrity: IntegrityDiagnostics;
};

export type AttachmentPreview = {
  attachmentId: number;
  fileName: string;
  contentType: string;
  dataBase64: string;
};
