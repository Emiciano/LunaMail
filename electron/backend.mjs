import { Notification, safeStorage } from "electron";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { simpleParser } from "mailparser";

const AUTO_SYNC_INTERVAL_MS = 30000;

const defaultSettings = {
  theme: "dark",
  accentColor: "white",
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

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_MAIL_SCOPE = "https://mail.google.com/";

const emptyState = () => ({
  counters: { account: 0, folder: 0, email: 0, attachment: 0, draft: 0, tag: 0, rule: 0, contact: 0 },
  accounts: [],
  folders: [],
  emails: [],
  attachments: [],
  drafts: [],
  tags: [],
  emailTags: {},
  rules: [],
  contacts: [],
  settings: { ...defaultSettings },
  secrets: {},
  sync: {}
});

export class LunaBackend {
  constructor({ dataDir, emit, showWindow, openExternal }) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, "lunamail.json");
    this.emit = emit;
    this.showWindow = showWindow;
    this.openExternal = openExternal;
    this.state = emptyState();
    this.syncing = new Set();
    this.lastAutoSync = 0;
    this.autoSyncTimer = undefined;
    this.smtpTransports = new Map();
  }

  get settings() {
    return this.state.settings;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      this.state = { ...emptyState(), ...JSON.parse(await fs.readFile(this.file, "utf8")) };
      this.state.settings = { ...defaultSettings, ...this.state.settings };
    } catch {}
    const attachmentsMigrated = await this.migrateAttachmentsToDisk();
    const bodiesMigrated = await this.migrateBodiesToDisk();
    if (attachmentsMigrated || bodiesMigrated) await this.persist();
    if (this.normalizeFolders()) await this.persist();
    this.autoSyncTimer = setInterval(() => {
      this.lastAutoSync = Date.now();
      for (const account of this.state.accounts) {
        void this.syncAccount(account.id, 100).catch(() => undefined);
      }
    }, AUTO_SYNC_INTERVAL_MS);
    this.autoSyncTimer.unref();
  }

  async persist() {
    const temp = `${this.file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(this.state), "utf8");
    await fs.rename(temp, this.file);
  }

  next(type) {
    this.state.counters[type] = (this.state.counters[type] || 0) + 1;
    return this.state.counters[type];
  }

  account(id) {
    const account = this.state.accounts.find((item) => item.id === Number(id));
    if (!account) throw new Error("Account nicht gefunden.");
    return account;
  }

  folder(id) {
    const folder = this.state.folders.find((item) => item.id === Number(id));
    if (!folder) throw new Error("Ordner nicht gefunden.");
    return folder;
  }

  password(accountId, protocol) {
    const value = this.state.secrets[`${accountId}:${protocol}`];
    if (!value) throw new Error(`${protocol.toUpperCase()}-Passwort fehlt.`);
    if (!safeStorage.isEncryptionAvailable()) return Buffer.from(value, "base64").toString("utf8");
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  }

  setPassword(accountId, protocol, password) {
    if (!password) return;
    const buffer = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(password)
      : Buffer.from(password, "utf8");
    this.state.secrets[`${accountId}:${protocol}`] = buffer.toString("base64");
  }

  secret(accountId, name) {
    return this.password(accountId, name);
  }

  setSecret(accountId, name, value) {
    this.setPassword(accountId, name, value);
  }

  publicAccount(account) {
    const { useTls: _useTls, ...publicValue } = account;
    return publicValue;
  }

  emailSummary(email) {
    const attachments = this.state.attachments
      .filter((item) => item.emailId === email.id)
      .map(({ dataBase64: _data, cachePath: _cachePath, ...item }) => item);
    const tags = (this.state.emailTags[email.id] || [])
      .map((id) => this.state.tags.find((tag) => tag.id === id))
      .filter(Boolean);
    const { bodyText: _bodyText, bodyHtml: _bodyHtml, bodyPath: _bodyPath, ...summary } = email;
    return { ...summary, attachments, tags };
  }

  async emailDetail(email) {
    const summary = this.emailSummary(email);
    if (!email.bodyPath) {
      return { ...summary, bodyText: email.bodyText || "", bodyHtml: email.bodyHtml || "" };
    }
    try {
      const body = JSON.parse(await fs.readFile(email.bodyPath, "utf8"));
      return { ...summary, bodyText: body.bodyText || "", bodyHtml: body.bodyHtml || "" };
    } catch {
      return { ...summary, bodyText: "", bodyHtml: "" };
    }
  }

  async migrateAttachmentsToDisk() {
    let changed = false;
    const attachmentDir = path.join(this.dataDir, "attachments");
    await fs.mkdir(attachmentDir, { recursive: true });
    for (const attachment of this.state.attachments) {
      if (!attachment.dataBase64) continue;
      const filePath = path.join(attachmentDir, `${attachment.id}.bin`);
      await fs.writeFile(filePath, Buffer.from(attachment.dataBase64, "base64"));
      attachment.cachePath = filePath;
      delete attachment.dataBase64;
      changed = true;
    }
    return changed;
  }

  async migrateBodiesToDisk() {
    let changed = false;
    const bodyDir = path.join(this.dataDir, "bodies");
    await fs.mkdir(bodyDir, { recursive: true });
    for (const email of this.state.emails) {
      if (email.bodyPath || (!email.bodyText && !email.bodyHtml)) continue;
      const bodyPath = path.join(bodyDir, `${email.id}.json`);
      await fs.writeFile(bodyPath, JSON.stringify({
        bodyText: email.bodyText || "",
        bodyHtml: email.bodyHtml || ""
      }), "utf8");
      email.bodyPath = bodyPath;
      delete email.bodyText;
      delete email.bodyHtml;
      changed = true;
    }
    return changed;
  }

  async storeEmailBody(emailId, bodyText, bodyHtml) {
    const bodyDir = path.join(this.dataDir, "bodies");
    await fs.mkdir(bodyDir, { recursive: true });
    const bodyPath = path.join(bodyDir, `${emailId}.json`);
    await fs.writeFile(bodyPath, JSON.stringify({ bodyText, bodyHtml }), "utf8");
    return bodyPath;
  }

  async invoke(command, args) {
    const method = this[command];
    if (typeof method !== "function") throw new Error(`Unbekannter Backend-Befehl: ${command}`);
    return method.call(this, args || {});
  }

  get_accounts() {
    return this.state.accounts.map((item) => this.publicAccount(item));
  }

  async save_account({ account }) {
    account.imapHost = this.normalizeMailHost(account.imapHost, "IMAP", account.email, account.provider);
    account.smtpHost = this.normalizeMailHost(account.smtpHost, "SMTP", account.email, account.provider, account.imapHost);
    let saved = this.state.accounts.find((item) => item.id === Number(account.id))
      || this.state.accounts.find((item) => item.email.toLowerCase() === account.email.toLowerCase());
    if (account.isDefault) this.state.accounts.forEach((item) => { item.isDefault = false; });
    if (saved) Object.assign(saved, account, { id: saved.id });
    else {
      saved = { ...account, id: this.next("account"), isDefault: account.isDefault || this.state.accounts.length === 0 };
      this.state.accounts.push(saved);
      this.ensureDefaultFolders(saved.id);
    }
    this.setPassword(saved.id, "imap", account.password);
    this.setPassword(saved.id, "smtp", account.smtpPassword || account.password);
    this.closeSmtpTransport(saved.id);
    delete saved.password;
    delete saved.smtpPassword;
    await this.persist();
    return this.publicAccount(saved);
  }

  async connect_google_account({ clientId }) {
    const normalizedClientId = String(clientId || this.settings.googleOAuthClientId || "").trim();
    if (!normalizedClientId.endsWith(".apps.googleusercontent.com")) {
      throw new Error("Bitte zuerst eine gültige Google OAuth Desktop-Client-ID eintragen.");
    }
    if (!this.openExternal) throw new Error("Der Systembrowser ist nicht verfügbar.");

    this.state.settings.googleOAuthClientId = normalizedClientId;
    const authorization = await this.authorizeGoogle(normalizedClientId);
    const account = await this.save_account({
      account: {
        displayName: authorization.name || authorization.email,
        email: authorization.email,
        provider: "gmail",
        authType: "oauth2",
        username: authorization.email,
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        password: "",
        smtpPassword: "",
        isDefault: this.state.accounts.length === 0
      }
    });
    const stored = this.account(account.id);
    stored.authType = "oauth2";
    stored.oauthExpiresAt = Date.now() + authorization.expiresIn * 1000;
    this.setSecret(stored.id, "oauth_access", authorization.accessToken);
    this.setSecret(stored.id, "oauth_refresh", authorization.refreshToken);
    await this.persist();
    this.showWindow?.();
    return this.publicAccount(stored);
  }

  async authorizeGoogle(clientId) {
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(24).toString("base64url");
    let callbackServer;
    let timeout;

    try {
      const callback = new Promise((resolve, reject) => {
        callbackServer = http.createServer((request, response) => {
          const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
          if (requestUrl.pathname !== "/oauth2callback") {
            response.writeHead(404).end();
            return;
          }
          const error = requestUrl.searchParams.get("error");
          const returnedState = requestUrl.searchParams.get("state");
          const code = requestUrl.searchParams.get("code");
          if (returnedState !== state) {
            response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            response.end("<h2>Ungültiger Google-Rückruf.</h2><p>Bitte kehre zur laufenden Anmeldung zurück.</p>");
            return;
          }
          if (error || !code) {
            response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            response.end("<h2>Google-Anmeldung fehlgeschlagen.</h2><p>Du kannst dieses Fenster schließen.</p>");
            reject(new Error(error || "Ungültiger OAuth-Rückruf."));
            return;
          }
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          response.end("<h2>Google-Konto verbunden.</h2><p>Du kannst dieses Fenster schließen und zu LunaMail zurückkehren.</p>");
          resolve(code);
        });
        callbackServer.once("error", reject);
        callbackServer.listen(0, "127.0.0.1");
        timeout = setTimeout(() => reject(new Error("Google-Anmeldung wurde wegen Zeitüberschreitung abgebrochen.")), 300000);
      });

      await new Promise((resolve, reject) => {
        if (callbackServer.listening) resolve();
        else {
          callbackServer.once("listening", resolve);
          callbackServer.once("error", reject);
        }
      });
      const address = callbackServer.address();
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const authorizationUrl = new URL(GOOGLE_AUTH_URL);
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: `openid email profile ${GOOGLE_MAIL_SCOPE}`,
        access_type: "offline",
        prompt: "consent select_account",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state
      }).toString();
      await this.openExternal(authorizationUrl.toString());
      const code = await callback;
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri
        })
      });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
        throw new Error(tokens.error_description || tokens.error || "Google hat keine gültigen OAuth-Tokens zurückgegeben.");
      }
      const userResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const user = await userResponse.json();
      if (!userResponse.ok || !user.email) {
        throw new Error(user.error?.message || "Die Google-E-Mail-Adresse konnte nicht gelesen werden.");
      }
      return {
        email: user.email,
        name: user.name,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: Number(tokens.expires_in) || 3600
      };
    } finally {
      clearTimeout(timeout);
      callbackServer?.close();
    }
  }

  async googleAccessToken(account) {
    const expiresAt = Number(account.oauthExpiresAt) || 0;
    if (expiresAt > Date.now() + 60000) return this.secret(account.id, "oauth_access");
    const clientId = String(this.settings.googleOAuthClientId || "").trim();
    if (!clientId) throw new Error("Google OAuth Client-ID fehlt. Bitte das Gmail-Konto neu verbinden.");
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: this.secret(account.id, "oauth_refresh"),
        grant_type: "refresh_token"
      })
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || tokens.error || "Google-Zugriff konnte nicht erneuert werden.");
    }
    account.oauthExpiresAt = Date.now() + (Number(tokens.expires_in) || 3600) * 1000;
    this.setSecret(account.id, "oauth_access", tokens.access_token);
    await this.persist();
    this.closeSmtpTransport(account.id);
    return tokens.access_token;
  }

  async accountAuth(account, protocol = "imap") {
    const user = account.username || account.email;
    if (account.authType === "oauth2") {
      return { user, accessToken: await this.googleAccessToken(account) };
    }
    return { user, pass: this.password(account.id, protocol) };
  }

  ensureDefaultFolders(accountId) {
    const defaults = [
      ["Posteingang", "INBOX", "inbox"],
      ["Gesendet", "Sent", "sent"],
      ["Entwürfe", "Drafts", "drafts"],
      ["Archiv", "Archive", "archive"],
      ["Spam", "Junk", "spam"],
      ["Papierkorb", "Trash", "trash"]
    ];
    for (const [name, remoteName, role] of defaults) {
      if (!this.state.folders.some((item) => item.accountId === accountId && item.role === role)) {
        this.state.folders.push({ id: this.next("folder"), accountId, name, remoteName, role, unreadCount: 0 });
      }
    }
  }

  normalizeFolders() {
    let changed = false;
    const canonicalNames = {
      inbox: "Posteingang",
      sent: "Gesendet",
      drafts: "Entwürfe",
      archive: "Archiv",
      spam: "Spam",
      trash: "Papierkorb",
      promotions: "Werbung"
    };

    for (const account of this.state.accounts) {
      for (const role of Object.keys(canonicalNames)) {
        const matches = this.state.folders.filter((folder) => folder.accountId === account.id && folder.role === role);
        if (!matches.length) continue;
        const preferred = matches.find((folder) => this.state.emails.some((email) => email.folderId === folder.id))
          || matches.find((folder) => folder.remoteName && folder.remoteName !== this.defaultRemoteName(role))
          || matches[0];
        if (preferred.name !== canonicalNames[role]) {
          preferred.name = canonicalNames[role];
          changed = true;
        }
        for (const duplicate of matches) {
          if (duplicate.id === preferred.id) continue;
          this.state.emails.forEach((email) => {
            if (email.folderId === duplicate.id) email.folderId = preferred.id;
          });
          this.state.folders = this.state.folders.filter((folder) => folder.id !== duplicate.id);
          changed = true;
        }
      }
    }
    return changed;
  }

  defaultRemoteName(role) {
    return {
      inbox: "INBOX",
      sent: "Sent",
      drafts: "Drafts",
      archive: "Archive",
      spam: "Junk",
      trash: "Trash"
    }[role];
  }

  folderDisplayName(role, fallback) {
    return {
      inbox: "Posteingang",
      sent: "Gesendet",
      drafts: "Entwürfe",
      archive: "Archiv",
      spam: "Spam",
      trash: "Papierkorb",
      promotions: "Werbung"
    }[role] || fallback;
  }

  async delete_account({ accountId }) {
    const id = Number(accountId);
    const emailIds = new Set(this.state.emails.filter((item) => item.accountId === id).map((item) => item.id));
    this.state.accounts = this.state.accounts.filter((item) => item.id !== id);
    this.state.folders = this.state.folders.filter((item) => item.accountId !== id);
    this.state.emails = this.state.emails.filter((item) => item.accountId !== id);
    this.state.attachments = this.state.attachments.filter((item) => !emailIds.has(item.emailId));
    this.state.drafts = this.state.drafts.filter((item) => item.accountId !== id);
    for (const key of Object.keys(this.state.secrets)) if (key.startsWith(`${id}:`)) delete this.state.secrets[key];
    this.closeSmtpTransport(id);
    await this.persist();
  }

  get_folders({ accountId } = {}) {
    return this.state.folders
      .filter((item) => !accountId || item.accountId === Number(accountId))
      .map((folder) => ({
        ...folder,
        unreadCount: this.state.emails.filter((email) => email.folderId === folder.id && !email.isRead && !email.deletedAt).length
      }));
  }

  get_emails({ folderId, query = "", view, accountId, filters = {} }) {
    const term = String(query || "").toLowerCase();
    return this.state.emails
      .filter((email) => !email.deletedAt)
      .filter((email) => !folderId || email.folderId === Number(folderId))
      .filter((email) => !accountId || email.accountId === Number(accountId))
      .filter((email) => view !== "favorites" || email.isFavorite)
      .filter((email) => view !== "important" || email.isImportant)
      .filter((email) => view !== "unified_inbox" || this.folder(email.folderId).role === "inbox")
      .filter((email) => !term || [email.sender, email.recipients, email.subject, email.preview].some((value) => String(value || "").toLowerCase().includes(term)))
      .filter((email) => !filters.unreadOnly || !email.isRead)
      .filter((email) => !filters.favoriteOnly || email.isFavorite)
      .filter((email) => !filters.importantOnly || email.isImportant)
      .filter((email) => !filters.hasAttachment || email.hasAttachments)
      .filter((email) => !filters.tagId || (this.state.emailTags[email.id] || []).includes(Number(filters.tagId)))
      .filter((email) => !filters.categoryId || (Number(filters.categoryId) === 1 ? email.hasAttachments : Number(filters.categoryId) === 2 ? !email.isRead : true))
      .filter((email) => !filters.from || email.sender.toLowerCase().includes(filters.from.toLowerCase()))
      .filter((email) => !filters.to || email.recipients.toLowerCase().includes(filters.to.toLowerCase()))
      .filter((email) => !filters.subject || email.subject.toLowerCase().includes(filters.subject.toLowerCase()))
      .filter((email) => filters.isRead === undefined || email.isRead === filters.isRead)
      .filter((email) => !filters.dateRange || Date.now() - new Date(email.receivedAt).getTime() < (filters.dateRange === "today" ? 86400000 : 604800000))
      .filter((email) => !filters.before || new Date(email.receivedAt) < new Date(filters.before))
      .filter((email) => !filters.after || new Date(email.receivedAt) > new Date(filters.after))
      .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
      .slice(0, 200)
      .map((email) => this.emailSummary(email));
  }

  async get_email({ id }) {
    const email = this.state.emails.find((item) => item.id === Number(id));
    if (!email) throw new Error("E-Mail nicht gefunden.");
    return this.emailDetail(email);
  }

  async hydrate_email({ id }) {
    const email = await this.get_email({ id });
    this.emit("email-hydrated", email);
    return email;
  }

  async mark_email_read({ id, read = true }) {
    const email = this.state.emails.find((item) => item.id === Number(id));
    if (!email) return;
    if (email.uid) {
      await this.withMailbox(email.accountId, email.folderId, async (client) => {
        if (read) await client.messageFlagsAdd(email.uid, ["\\Seen"], { uid: true });
        else await client.messageFlagsRemove(email.uid, ["\\Seen"], { uid: true });
      });
    }
    email.isRead = Boolean(read);
    await this.persist();
  }

  async move_email({ id, targetFolderId }) {
    const email = this.state.emails.find((item) => item.id === Number(id));
    if (!email) return;
    const target = this.folder(targetFolderId);
    if (target.accountId !== email.accountId) throw new Error("Mails können nicht zwischen Konten verschoben werden.");
    if (target.serverAvailable === false) {
      throw new Error(`Der Ordner "${target.name}" ist auf dem Mailserver nicht verfügbar.`);
    }
    if (email.uid) {
      const result = await this.withMailbox(email.accountId, email.folderId, (client) =>
        client.messageMove(email.uid, target.remoteName, { uid: true })
      );
      email.uid = result?.uidMap?.get?.(email.uid) || undefined;
    }
    email.folderId = Number(targetFolderId);
    email.deletedAt = undefined;
    await this.persist();
  }

  async delete_email({ id }) {
    const email = this.state.emails.find((item) => item.id === Number(id));
    if (!email) return;
    const trash = this.state.folders.find((folder) => folder.accountId === email.accountId && folder.role === "trash");
    if (trash && email.folderId !== trash.id) {
      await this.move_email({ id, targetFolderId: trash.id });
      return;
    }
    await this.delete_emails_permanently({ ids: [id] });
  }

  async delete_emails_permanently({ ids }) {
    const set = new Set(ids.map(Number));
    const emails = this.state.emails.filter((item) => set.has(item.id));
    for (const email of emails) {
      if (!email.uid) continue;
      await this.withMailbox(email.accountId, email.folderId, (client) =>
        client.messageDelete(email.uid, { uid: true })
      );
    }
    await this.removeCachedEmailFiles(emails);
    this.state.emails = this.state.emails.filter((item) => !set.has(item.id));
    this.state.attachments = this.state.attachments.filter((item) => !set.has(item.emailId));
    await this.persist();
    return set.size;
  }

  async withMailbox(accountId, folderId, action) {
    const account = this.account(accountId);
    const folder = this.folder(folderId);
    const client = await this.imapClient(account);
    let lock;
    try {
      await client.connect();
      lock = await client.getMailboxLock(folder.remoteName);
      return await action(client, folder);
    } finally {
      lock?.release();
      await client.logout().catch(() => undefined);
    }
  }

  async removeCachedEmailFiles(emails) {
    const ids = new Set(emails.map((email) => email.id));
    for (const email of emails) {
      if (email.bodyPath) await fs.rm(email.bodyPath, { force: true }).catch(() => undefined);
    }
    for (const attachment of this.state.attachments.filter((item) => ids.has(item.emailId))) {
      if (attachment.cachePath) await fs.rm(attachment.cachePath, { force: true }).catch(() => undefined);
    }
  }

  async toggle_favorite({ id }) {
    const email = this.state.emails.find((item) => item.id === Number(id));
    if (!email) return false;
    email.isFavorite = !email.isFavorite;
    await this.persist();
    return email.isFavorite;
  }

  async toggle_important({ id }) {
    const email = this.state.emails.find((item) => item.id === Number(id));
    if (!email) return false;
    email.isImportant = !email.isImportant;
    await this.persist();
    return email.isImportant;
  }

  get_mail_counts({ accountId } = {}) {
    const emails = this.state.emails.filter((email) => !email.deletedAt && (!accountId || email.accountId === Number(accountId)));
    const now = Date.now();
    return {
      favorites: emails.filter((item) => item.isFavorite).length,
      important: emails.filter((item) => item.isImportant).length,
      unread: emails.filter((item) => !item.isRead && this.folder(item.folderId).role === "inbox").length,
      withAttachments: emails.filter((item) => item.hasAttachments).length,
      today: emails.filter((item) => now - new Date(item.receivedAt).getTime() < 86400000).length,
      thisWeek: emails.filter((item) => now - new Date(item.receivedAt).getTime() < 604800000).length,
      perAccount: this.state.accounts.map((account) => ({
        accountId: account.id,
        favorites: emails.filter((item) => item.accountId === account.id && item.isFavorite).length,
        important: emails.filter((item) => item.accountId === account.id && item.isImportant).length
      }))
    };
  }

  async get_file_size({ path: filePath }) {
    return (await fs.stat(filePath)).size;
  }

  async download_attachment({ attachmentId, destinationPath }) {
    const attachment = this.state.attachments.find((item) => item.id === Number(attachmentId));
    if (!attachment) throw new Error("Anhang nicht gefunden.");
    if (attachment.path) await fs.copyFile(attachment.path, destinationPath);
    else if (attachment.cachePath) await fs.copyFile(attachment.cachePath, destinationPath);
    else await fs.writeFile(destinationPath, Buffer.from(attachment.dataBase64 || "", "base64"));
  }

  async get_attachment_preview({ attachmentId }) {
    const item = this.state.attachments.find((entry) => entry.id === Number(attachmentId));
    if (!item) return null;
    const dataBase64 = item.dataBase64
      || (item.cachePath ? (await fs.readFile(item.cachePath)).toString("base64") : undefined);
    if (!dataBase64) return null;
    return { attachmentId: item.id, fileName: item.fileName, contentType: item.contentType, dataBase64 };
  }

  async preview_ics_attachment({ attachmentId }) {
    const item = this.state.attachments.find((entry) => entry.id === Number(attachmentId));
    if (!item || !/calendar|ics/i.test(`${item.contentType} ${item.fileName}`)) return null;
    const content = item.dataBase64
      ? Buffer.from(item.dataBase64, "base64")
      : item.cachePath ? await fs.readFile(item.cachePath) : undefined;
    if (!content) return null;
    const text = content.toString("utf8");
    const read = (key) => text.match(new RegExp(`^${key}[^:]*:(.*)$`, "mi"))?.[1]?.trim();
    return { title: read("SUMMARY"), start: read("DTSTART"), end: read("DTEND"), location: read("LOCATION"), organizer: read("ORGANIZER") };
  }

  async save_draft({ draft }) {
    let saved = this.state.drafts.find((item) => item.id === Number(draft.id));
    if (saved) Object.assign(saved, draft, { updatedAt: new Date().toISOString() });
    else {
      saved = { ...draft, id: this.next("draft"), updatedAt: new Date().toISOString() };
      this.state.drafts.push(saved);
    }
    await this.persist();
    return saved.id;
  }

  get_drafts({ accountId } = {}) {
    return this.state.drafts.filter((item) => !accountId || item.accountId === Number(accountId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete_draft({ id }) {
    this.state.drafts = this.state.drafts.filter((item) => item.id !== Number(id));
    await this.persist();
  }

  async send_mail({ draft }) {
    const account = this.account(draft.accountId);
    const smtpHost = this.normalizeMailHost(account.smtpHost, "SMTP", account.email, account.provider, account.imapHost);
    if (smtpHost !== account.smtpHost) {
      account.smtpHost = smtpHost;
      await this.persist();
    }
    const transporter = await this.smtpTransport(account, smtpHost);
    const mailOptions = {
        from: account.email,
        to: draft.to,
        cc: draft.cc || undefined,
        bcc: draft.bcc || undefined,
        subject: draft.subject,
        text: draft.body,
        attachments: (draft.attachments || []).filter((item) => item.path).map((item) => ({ filename: item.fileName, path: item.path, contentType: item.contentType }))
    };
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (error) {
      const code = error?.code || error?.cause?.code;
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
        throw new Error(
          `Der SMTP-Server "${smtpHost}" für ${account.email} konnte nicht gefunden werden. ` +
          "Bitte unter Einstellungen > Konten den vollständigen SMTP-Server prüfen, zum Beispiel smtp.gmail.com."
        );
      }
      throw new Error(`E-Mail konnte nicht gesendet werden: ${error?.message || String(error)}`);
    }
    void this.appendSentMessage(account, mailOptions, info?.messageId).catch((error) => {
      this.emit("sync-account-error", {
        accountId: account.id,
        message: `Die gesendete E-Mail konnte nicht im Gesendet-Ordner gespeichert werden: ${error?.message || String(error)}`
      });
    });
    if (draft.id) await this.delete_draft({ id: draft.id });
  }

  async appendSentMessage(account, mailOptions, messageId) {
    const sentFolder = this.state.folders.find((folder) => folder.accountId === account.id && folder.role === "sent");
    if (!sentFolder || sentFolder.serverAvailable === false) return;
    const raw = await new Promise((resolve, reject) => {
      const composer = new MailComposer({ ...mailOptions, messageId });
      composer.compile().build((error, message) => error ? reject(error) : resolve(message));
    });
    const client = await this.imapClient(account);
    await client.connect();
    try {
      await client.append(sentFolder.remoteName, raw, ["\\Seen"], new Date());
    } finally {
      await client.logout().catch(() => undefined);
    }
    await this.syncAccount(account.id, 100);
  }

  async smtpTransport(account, smtpHost) {
    const key = `${smtpHost}:${account.smtpPort}:${account.username || account.email}:${account.authType || "password"}:${account.oauthExpiresAt || ""}`;
    const cached = this.smtpTransports.get(account.id);
    if (cached?.key === key) return cached.transport;
    cached?.transport.close();
    const transport = nodemailer.createTransport({
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      host: smtpHost,
      port: account.smtpPort,
      secure: Boolean(account.smtpSecure),
      auth: account.authType === "oauth2"
        ? { type: "OAuth2", ...await this.accountAuth(account, "smtp") }
        : await this.accountAuth(account, "smtp"),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000
    });
    this.smtpTransports.set(account.id, { key, transport });
    return transport;
  }

  closeSmtpTransport(accountId) {
    const cached = this.smtpTransports.get(Number(accountId));
    cached?.transport.close();
    this.smtpTransports.delete(Number(accountId));
  }

  normalizeMailHost(value, protocol, email, provider, fallbackHost) {
    let host = String(value || "").trim().toLowerCase();
    host = host.replace(/^(?:imap|smtp|https?):\/\//, "").split(/[/:]/)[0];
    const domain = String(email || "").split("@")[1]?.toLowerCase();
    const known = {
      "gmail.com": { IMAP: "imap.gmail.com", SMTP: "smtp.gmail.com" },
      "googlemail.com": { IMAP: "imap.gmail.com", SMTP: "smtp.gmail.com" },
      "outlook.com": { IMAP: "outlook.office365.com", SMTP: "smtp.office365.com" },
      "hotmail.com": { IMAP: "outlook.office365.com", SMTP: "smtp.office365.com" },
      "live.com": { IMAP: "outlook.office365.com", SMTP: "smtp.office365.com" },
      "icloud.com": { IMAP: "imap.mail.me.com", SMTP: "smtp.mail.me.com" },
      "me.com": { IMAP: "imap.mail.me.com", SMTP: "smtp.mail.me.com" },
      "yahoo.com": { IMAP: "imap.mail.yahoo.com", SMTP: "smtp.mail.yahoo.com" },
      "gmx.de": { IMAP: "imap.gmx.net", SMTP: "mail.gmx.net" },
      "web.de": { IMAP: "imap.web.de", SMTP: "smtp.web.de" }
    };
    if ((!host || !host.includes(".")) && known[domain]?.[protocol]) {
      return known[domain][protocol];
    }
    if (provider === "gmail") return protocol === "IMAP" ? "imap.gmail.com" : "smtp.gmail.com";
    if (protocol === "SMTP" && (!host || !host.includes("."))) {
      const fallback = String(fallbackHost || "").trim().toLowerCase();
      if (/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(fallback)) {
        if (fallback.startsWith("imap.")) return `smtp.${fallback.slice(5)}`;
        if (fallback.startsWith("mail.")) return fallback;
      }
    }
    if (!host || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$|^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})$/i.test(host)) {
      throw new Error(
        `${protocol}-Server "${host || "(leer)"}" ist ungültig. ` +
        `Bitte für ${email || "dieses Konto"} einen vollständigen Servernamen eintragen, zum Beispiel smtp.example.de.`
      );
    }
    return host;
  }

  get_tags() { return [...this.state.tags].sort((a, b) => a.name.localeCompare(b.name)); }
  async create_tag({ name, color }) {
    let tag = this.state.tags.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!tag) this.state.tags.push(tag = { id: this.next("tag"), name, color });
    await this.persist();
    return tag;
  }
  async delete_tag({ id }) {
    this.state.tags = this.state.tags.filter((item) => item.id !== Number(id));
    for (const key of Object.keys(this.state.emailTags)) this.state.emailTags[key] = this.state.emailTags[key].filter((tagId) => tagId !== Number(id));
    await this.persist();
  }
  async set_email_tags({ emailId, tagIds }) { this.state.emailTags[emailId] = tagIds.map(Number); await this.persist(); }
  get_categories() {
    return [
      { id: 1, key: "attachments", label: "Mit Anhängen", count: this.state.emails.filter((item) => item.hasAttachments).length },
      { id: 2, key: "unread", label: "Ungelesen", count: this.state.emails.filter((item) => !item.isRead).length }
    ];
  }

  get_rules({ accountId } = {}) { return this.state.rules.filter((item) => !accountId || !item.accountId || item.accountId === Number(accountId)); }
  async save_rule({ rule }) {
    let saved = this.state.rules.find((item) => item.id === Number(rule.id));
    const now = new Date().toISOString();
    if (saved) Object.assign(saved, rule, { updatedAt: now });
    else this.state.rules.push(saved = { enabled: true, priority: 0, createdAt: now, ...rule, id: this.next("rule"), updatedAt: now });
    await this.persist();
    return saved;
  }
  async delete_rule({ id }) { this.state.rules = this.state.rules.filter((item) => item.id !== Number(id)); await this.persist(); }

  get_contacts({ query = "" } = {}) {
    const term = query.toLowerCase();
    return this.state.contacts.filter((item) => !term || `${item.name} ${item.email}`.toLowerCase().includes(term));
  }
  async save_contact({ contact }) {
    let saved = this.state.contacts.find((item) => item.id === Number(contact.id)) || this.state.contacts.find((item) => item.email.toLowerCase() === contact.email.toLowerCase());
    const now = new Date().toISOString();
    if (saved) Object.assign(saved, contact, { updatedAt: now });
    else this.state.contacts.push(saved = { usageCount: 0, isFavorite: false, createdAt: now, ...contact, id: this.next("contact"), updatedAt: now });
    await this.persist();
    return saved;
  }
  async delete_contact({ id }) { this.state.contacts = this.state.contacts.filter((item) => item.id !== Number(id)); await this.persist(); }

  get_settings() { return this.state.settings; }
  async save_settings({ settings }) { this.state.settings = { ...defaultSettings, ...settings }; await this.persist(); }

  export_backup() {
    return {
      version: "0.9.39",
      exportedAt: new Date().toISOString(),
      accounts: this.state.accounts.map(({ id: _id, ...account }) => this.publicAccount(account)),
      settings: this.state.settings,
      rules: this.state.rules,
      contacts: this.state.contacts,
      tags: this.state.tags
    };
  }
  async import_backup({ backup }) {
    this.state.settings = { ...defaultSettings, ...backup.settings };
    this.state.rules = backup.rules || [];
    this.state.contacts = backup.contacts || [];
    this.state.tags = backup.tags || [];
    for (const account of backup.accounts || []) await this.save_account({ account: { ...account, password: "", smtpPassword: "" } });
    await this.persist();
  }
  async export_backup_to_file({ path: filePath }) { await fs.writeFile(filePath, JSON.stringify(this.export_backup(), null, 2), "utf8"); }
  async import_backup_from_file({ path: filePath }) { await this.import_backup({ backup: JSON.parse(await fs.readFile(filePath, "utf8")) }); }

  async test_account({ accountId }) {
    const account = this.account(accountId);
    const result = { imapOk: false, smtpOk: false };
    try {
      const client = await this.imapClient(account);
      await client.connect();
      await client.logout();
      result.imapOk = true;
    } catch (error) { result.imapError = String(error); }
    try {
      await nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: Boolean(account.smtpSecure),
        auth: account.authType === "oauth2"
          ? { type: "OAuth2", ...await this.accountAuth(account, "smtp") }
          : await this.accountAuth(account, "smtp")
      }).verify();
      result.smtpOk = true;
    } catch (error) { result.smtpError = String(error); }
    return result;
  }

  async imapClient(account) {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: Boolean(account.imapSecure),
      auth: await this.accountAuth(account, "imap"),
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 300000
    });
    // ImapFlow emits socket failures in addition to rejecting the active operation.
    // A listener keeps late network errors from terminating Electron's main process.
    client.on("error", () => undefined);
    return client;
  }

  inferRole(name, specialUse) {
    const value = `${specialUse || ""} ${name}`.toLowerCase();
    if (value.includes("inbox")) return "inbox";
    if (value.includes("sent") || value.includes("gesendet")) return "sent";
    if (value.includes("draft")) return "drafts";
    if (value.includes("trash") || value.includes("papierkorb")) return "trash";
    if (value.includes("junk") || value.includes("spam")) return "spam";
    if (value.includes("archive") || value.includes("archiv")) return "archive";
    return "custom";
  }

  async syncAccount(accountId, limit = 100, includeOlder = false) {
    const id = Number(accountId);
    if (this.syncing.has(id)) return { accountId: id, foldersSynced: 0, messagesSynced: 0, requestedMessages: 0, errors: [], newMessages: [] };
    this.syncing.add(id);
    const report = { accountId: id, foldersSynced: 0, messagesSynced: 0, requestedMessages: 0, errors: [], newMessages: [] };
    let client;
    try {
      const account = this.account(id);
      client = await this.imapClient(account);
      await client.connect();
      const mailboxes = await client.list();
      const listedFolderIds = new Set();
      for (const folder of this.state.folders.filter((item) => item.accountId === id)) {
        folder.serverAvailable = false;
      }
      for (const box of mailboxes) {
        const role = this.inferRole(box.path, box.specialUse);
        let folder = this.state.folders.find((item) => item.accountId === id && item.remoteName === box.path);
        if (!folder && role !== "custom") {
          folder = this.state.folders.find((item) => item.accountId === id && item.role === role);
        }
        if (!folder) {
          folder = {
            id: this.next("folder"),
            accountId: id,
            name: this.folderDisplayName(role, box.name || box.path),
            remoteName: box.path,
            role,
            unreadCount: 0
          };
          this.state.folders.push(folder);
        } else {
          folder.name = this.folderDisplayName(role, box.name || box.path);
          folder.remoteName = box.path;
          folder.role = role;
        }
        folder.serverAvailable = !box.flags?.has("\\Noselect");
        if (folder.serverAvailable) listedFolderIds.add(folder.id);
        report.foldersSynced += 1;
      }
      this.normalizeFolders();
      const accountFolders = this.state.folders.filter(
        (folder) => folder.accountId === id && listedFolderIds.has(folder.id)
      );
      for (const folder of accountFolders) {
        try {
          await this.syncFolderMessages(client, folder, limit, report, includeOlder);
        } catch (error) {
          if (!this.isImapConnectionError(error)) throw error;
          await client.logout().catch(() => undefined);
          client = await this.imapClient(account);
          await client.connect();
          await this.syncFolderMessages(client, folder, limit, report, includeOlder);
        }
      }
      this.state.sync[id] = { lastSyncAt: new Date().toISOString(), lastSyncError: undefined };
      await this.persist();
      this.emit("sync-account-complete", report);
      this.notify(report);
      return report;
    } catch (error) {
      const message = String(error);
      report.errors.push(message);
      this.state.sync[id] = { lastSyncAt: new Date().toISOString(), lastSyncError: message };
      this.emit("sync-account-error", { accountId: id, message });
      return report;
    } finally {
      await client?.logout().catch(() => undefined);
      this.syncing.delete(id);
    }
  }

  async syncFolderMessages(client, folder, limit, report, includeOlder = false) {
    const lock = await client.getMailboxLock(folder.remoteName);
    try {
      const count = client.mailbox.exists || 0;
      const uidNext = client.mailbox.uidNext || 1;
      const uidValidity = String(client.mailbox.uidValidity || "");
      if (folder.uidValidity && uidValidity && folder.uidValidity !== uidValidity) {
        await this.removeMissingServerMessages(folder, new Set());
        folder.lastUid = 0;
      }
      if (uidValidity) folder.uidValidity = uidValidity;
      const serverUids = count > 0
        ? await client.search({ all: true }, { uid: true })
        : [];
      await this.removeMissingServerMessages(folder, new Set(serverUids || []));
      if (count === 0) {
        folder.lastUid = 0;
        return;
      }

      const cachedUids = new Set(
        this.state.emails
          .filter((email) => email.folderId === folder.id && email.uid)
          .map((email) => email.uid)
      );
      const cachedHighestUid = [...cachedUids].reduce(
        (highest, uid) => Math.max(highest, uid),
        0
      );
      const knownHighestUid = Math.max(Number(folder.lastUid) || 0, cachedHighestUid);
      const incremental = knownHighestUid > 0;
      const missingUids = includeOlder
        ? (serverUids || []).filter((uid) => !cachedUids.has(uid)).slice(-limit)
        : [];
      if (includeOlder && missingUids.length === 0) {
        folder.lastUid = (serverUids || []).reduce(
          (highest, uid) => Math.max(highest, uid),
          knownHighestUid
        );
        return;
      }
      if (!includeOlder && incremental && knownHighestUid + 1 >= uidNext) {
        folder.lastUid = knownHighestUid;
        return;
      }

      const range = includeOlder
        ? missingUids
        : incremental
          ? `${knownHighestUid + 1}:*`
          : `${Math.max(1, count - limit + 1)}:*`;
      const fetchOptions = includeOlder || incremental ? { uid: true } : undefined;
      let highestUid = knownHighestUid;
      const pendingMessages = [];

      for await (const message of client.fetch(
        range,
        { uid: true, flags: true, envelope: true, internalDate: true },
        fetchOptions
      )) {
        report.requestedMessages += 1;
        highestUid = Math.max(highestUid, message.uid || 0);
        const existing = this.state.emails.find(
          (item) => item.folderId === folder.id && item.uid === message.uid
        );
        if (existing) {
          existing.isRead = message.flags?.has("\\Seen") || false;
          existing.isFavorite = message.flags?.has("\\Flagged") || false;
          continue;
        }
        pendingMessages.push(message);
      }

      if (pendingMessages.length) {
        const messagesByUid = new Map(pendingMessages.map((message) => [message.uid, message]));
        for await (const sourceMessage of client.fetch(
          pendingMessages.map((message) => message.uid),
          { uid: true, source: true },
          { uid: true }
        )) {
          const message = messagesByUid.get(sourceMessage.uid);
          if (!message || !sourceMessage.source) continue;
          await this.storeSyncedMessage(folder, message, sourceMessage.source, report);
        }
      }
      folder.lastUid = highestUid;
    } finally {
      lock.release();
    }
  }

  async storeSyncedMessage(folder, message, source, report) {
    const parsed = await simpleParser(source);
    const email = {
      id: this.next("email"),
      accountId: folder.accountId,
      folderId: folder.id,
      uid: message.uid,
      messageId: message.envelope?.messageId || parsed.messageId || `imap-${folder.accountId}-${folder.id}-${message.uid}`,
      sender: parsed.from?.text || "",
      recipients: parsed.to?.text || "",
      cc: parsed.cc?.text || "",
      bcc: parsed.bcc?.text || "",
      subject: parsed.subject || "",
      preview: (parsed.text || "").replace(/\s+/g, " ").slice(0, 240),
      receivedAt: (parsed.date || message.internalDate || new Date()).toISOString(),
      isRead: message.flags?.has("\\Seen") || false,
      isFavorite: message.flags?.has("\\Flagged") || false,
      isImportant: false,
      hasAttachments: Boolean(parsed.attachments?.length),
      updatedAt: new Date().toISOString()
    };
    email.bodyPath = await this.storeEmailBody(
      email.id,
      parsed.text || "",
      typeof parsed.html === "string" ? parsed.html : ""
    );
    this.state.emails.push(email);
    await this.storeParsedAttachments(email.id, parsed.attachments || []);
    report.messagesSynced += 1;
    if (folder.role === "inbox") {
      report.newMessages.push({
        emailId: email.id,
        accountId: folder.accountId,
        folderId: folder.id,
        folderRole: folder.role,
        sender: email.sender,
        subject: email.subject,
        isRead: email.isRead
      });
    }
  }

  async removeMissingServerMessages(folder, serverUids) {
    const removed = this.state.emails.filter(
      (email) => email.folderId === folder.id && email.uid && !serverUids.has(email.uid)
    );
    if (!removed.length) return;
    const removedIds = new Set(removed.map((email) => email.id));
    await this.removeCachedEmailFiles(removed);
    this.state.emails = this.state.emails.filter((email) => !removedIds.has(email.id));
    this.state.attachments = this.state.attachments.filter(
      (attachment) => !removedIds.has(attachment.emailId)
    );
  }

  isImapConnectionError(error) {
    const message = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
    return [
      "connection not available",
      "socket timeout",
      "econnreset",
      "econnrefused",
      "etimedout",
      "connection closed"
    ].some((value) => message.includes(value));
  }

  async storeParsedAttachments(emailId, attachments) {
    if (!attachments.length) return;
    const attachmentDir = path.join(this.dataDir, "attachments");
    await fs.mkdir(attachmentDir, { recursive: true });
    for (const attachment of attachments) {
      const attachmentId = this.next("attachment");
      const cachePath = path.join(attachmentDir, `${attachmentId}.bin`);
      await fs.writeFile(cachePath, attachment.content);
      this.state.attachments.push({
        id: attachmentId,
        emailId,
        fileName: attachment.filename || "Anhang",
        contentType: attachment.contentType || "application/octet-stream",
        size: attachment.size || attachment.content.length,
        cachePath
      });
    }
  }

  sync_inbox({ accountId }) { return this.syncAccount(accountId, 100); }
  load_older_messages({ accountId }) { return this.syncAccount(accountId, 500, true); }
  force_full_inbox_sync({ accountId, limit = 50 }) { return this.syncAccount(accountId, limit, true); }
  force_incremental_sync({ accountId }) { return this.syncAccount(accountId, 100); }
  async sync_all_messages({ accountId } = {}) {
    if (accountId) return this.syncAccount(accountId, 100);
    const reports = [];
    for (const account of this.state.accounts) reports.push(await this.syncAccount(account.id, 100));
    return {
      accountId: 0,
      foldersSynced: reports.reduce((sum, item) => sum + item.foldersSynced, 0),
      messagesSynced: reports.reduce((sum, item) => sum + item.messagesSynced, 0),
      requestedMessages: reports.reduce((sum, item) => sum + item.requestedMessages, 0),
      errors: reports.flatMap((item) => item.errors),
      newMessages: reports.flatMap((item) => item.newMessages)
    };
  }

  notify(report) {
    if (!this.settings.notificationsEnabled || !Notification.isSupported()) return;
    for (const item of report.newMessages.filter((entry) => !entry.isRead)) {
      const notification = new Notification({
        title: this.settings.notificationPreview ? item.subject || "Neue Mail" : "Neue Mail",
        body: this.settings.notificationPreview ? item.sender : "Neue Nachricht eingegangen",
        silent: !this.settings.notificationSound
      });
      notification.on("click", this.showWindow);
      notification.show();
    }
  }

  test_desktop_notification() {
    new Notification({ title: "LunaMail Test", body: "Windows-Benachrichtigungen funktionieren." }).show();
    return "Testbenachrichtigung gesendet.";
  }
  set_polling_active() {}
  process_sync_queue() { return 0; }
  search_emails({ query }) { return this.get_emails({ query }); }
  async get_database_size() { try { return (await fs.stat(this.file)).size; } catch { return 0; } }
  run_integrity_check() { return { duplicateMessageIds: 0, orphanAttachments: 0, accountFolderMismatches: 0 }; }
  async get_health_status() {
    return {
      sync: {
        queuePendingTotal: 0,
        queueFailedTotal: 0,
        queueInFlightTotal: this.syncing.size,
        accounts: this.state.accounts.map((account) => ({
          accountId: account.id,
          idleActive: false,
          pollingActive: true,
          pollingIntervalSeconds: AUTO_SYNC_INTERVAL_MS / 1000,
          queuePending: 0,
          queueFailed: 0,
          queueInFlight: this.syncing.has(account.id) ? 1 : 0,
          lastSyncAt: this.state.sync[account.id]?.lastSyncAt,
          lastSyncError: this.state.sync[account.id]?.lastSyncError,
          consecutiveFailures: this.state.sync[account.id]?.lastSyncError ? 1 : 0
        }))
      },
      queue: { pending: 0, failed: 0, inFlight: this.syncing.size },
      databaseSizeBytes: await this.get_database_size(),
      totalMails: this.state.emails.length,
      totalAttachments: this.state.attachments.length,
      keyringAvailable: safeStorage.isEncryptionAvailable(),
      integrity: this.run_integrity_check()
    };
  }
  async diagnose_account({ accountId }) {
    const account = this.account(accountId);
    const inbox = this.state.folders.find((item) => item.accountId === account.id && item.role === "inbox");
    const test = await this.test_account({ accountId });
    return {
      accountId: account.id,
      email: account.email,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecure: account.imapSecure,
      loginStatus: test.imapOk ? "ok" : test.imapError || "error",
      inboxRemoteName: inbox?.remoteName,
      localInboxMails: this.state.emails.filter((item) => item.folderId === inbox?.id).length,
      lastSyncAt: this.state.sync[account.id]?.lastSyncAt,
      lastSyncError: this.state.sync[account.id]?.lastSyncError,
      idleActive: false,
      pollingActive: true
    };
  }
  diagnose_inbox({ accountId }) {
    const inbox = this.state.folders.find((item) => item.accountId === Number(accountId) && item.role === "inbox");
    return {
      accountId: Number(accountId),
      inboxRemoteName: inbox?.remoteName,
      mailboxes: this.state.folders.filter((item) => item.accountId === Number(accountId)).map((item) => ({ name: item.remoteName, attributes: [], inferredRole: item.role })),
      localInboxMails: this.state.emails.filter((item) => item.folderId === inbox?.id).length
    };
  }
  fetch_latest_server_messages({ accountId, limit = 10 }) {
    return this.state.emails.filter((item) => item.accountId === Number(accountId)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, limit).map((item) => ({
      uid: item.uid || 0,
      messageId: item.messageId,
      subject: item.subject,
      sender: item.sender,
      date: item.receivedAt,
      flags: item.isRead ? ["\\Seen"] : [],
      seen: item.isRead
    }));
  }
}
