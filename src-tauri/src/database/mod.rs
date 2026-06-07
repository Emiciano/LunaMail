use crate::mail::{
    Account, AccountInput, AccountMailCounts, Attachment, Contact, ContactInput, Draft, Email,
    Folder, IncomingEmail, MailCounts, MailRule, NewMessageSummary, RuleInput, SmartCategory,
    SyncFolder,
};
use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
#[cfg(debug_assertions)]
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_layout_mode")]
    pub layout_mode: String,
    pub font_size: i64,
    pub sync_interval_minutes: i64,
    #[serde(default = "default_external_images")]
    pub external_images: String,
    #[serde(default = "default_allow_local_secret_fallback")]
    pub allow_local_secret_fallback: bool,
    #[serde(default = "default_notifications_enabled")]
    pub notifications_enabled: bool,
    #[serde(default = "default_notification_sound")]
    pub notification_sound: bool,
    #[serde(default = "default_notification_preview")]
    pub notification_preview: bool,
    #[serde(default = "default_run_in_background")]
    pub run_in_background: bool,
    #[serde(default)]
    pub account_notifications: HashMap<String, bool>,
    #[serde(default)]
    pub account_appearance: HashMap<String, AccountAppearanceValue>,
    pub default_account_id: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountAppearanceValue {
    pub color: Option<String>,
    pub emoji: Option<String>,
    pub avatar_url: Option<String>,
}

fn default_accent_color() -> String {
    "blue".to_string()
}

fn default_external_images() -> String {
    "never".to_string()
}

fn default_layout_mode() -> String {
    "standard".to_string()
}

fn default_allow_local_secret_fallback() -> bool {
    true
}

fn default_notifications_enabled() -> bool {
    true
}

fn default_notification_sound() -> bool {
    true
}

fn default_notification_preview() -> bool {
    true
}

fn default_run_in_background() -> bool {
    true
}

pub struct Db {
    read: Mutex<Connection>,
    write: Mutex<Connection>,
}

fn open_sqlite(path: &PathBuf) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "busy_timeout", 2_000)?;
    Ok(conn)
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailFilters {
    pub unread_only: Option<bool>,
    pub favorite_only: Option<bool>,
    pub important_only: Option<bool>,
    pub has_attachment: Option<bool>,
    pub date_range: Option<String>,
    pub tag_id: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub subject: Option<String>,
    pub is_read: Option<bool>,
    pub before: Option<String>,
    pub after: Option<String>,
    pub category_id: Option<i64>,
}

impl Db {
    pub fn open(path: PathBuf) -> Result<Self> {
        Ok(Self {
            read: Mutex::new(open_sqlite(&path)?),
            write: Mutex::new(open_sqlite(&path)?),
        })
    }

    pub fn migrate(&self) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                display_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                provider TEXT NOT NULL DEFAULT 'custom',
                imap_host TEXT NOT NULL,
                imap_port INTEGER NOT NULL,
                imap_secure INTEGER NOT NULL DEFAULT 1,
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER NOT NULL,
                smtp_secure INTEGER NOT NULL DEFAULT 1,
                username TEXT NOT NULL DEFAULT '',
                use_tls INTEGER NOT NULL DEFAULT 1,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                remote_name TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'custom',
                last_uid INTEGER,
                sync_disabled INTEGER NOT NULL DEFAULT 0,
                uid_validity TEXT,
                UNIQUE(account_id, name)
            );

            CREATE TABLE IF NOT EXISTS emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                uid INTEGER,
                message_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                recipients TEXT NOT NULL,
                cc TEXT,
                bcc TEXT,
                subject TEXT NOT NULL,
                preview TEXT NOT NULL,
                body_text TEXT,
                body_html TEXT,
                received_at TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                is_important INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT,
                updated_at TEXT,
                has_attachments INTEGER NOT NULL DEFAULT 0,
                raw_headers TEXT,
                UNIQUE(account_id, message_id),
                UNIQUE(folder_id, uid)
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_id INTEGER REFERENCES emails(id) ON DELETE CASCADE,
                draft_id INTEGER REFERENCES drafts(id) ON DELETE CASCADE,
                file_name TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                path TEXT,
                blob BLOB
            );

            CREATE TABLE IF NOT EXISTS drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                recipients TEXT NOT NULL,
                cc TEXT,
                bcc TEXT,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT 'blue',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS email_tags (
                email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY(email_id, tag_id)
            );

            CREATE TABLE IF NOT EXISTS rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                priority INTEGER NOT NULL DEFAULT 0,
                field TEXT NOT NULL,
                operator TEXT NOT NULL DEFAULT 'contains',
                value TEXT NOT NULL,
                action_type TEXT NOT NULL,
                action_value TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                last_contact_at TEXT,
                usage_count INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS smart_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS email_categories (
                email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
                category_id INTEGER NOT NULL REFERENCES smart_categories(id) ON DELETE CASCADE,
                PRIMARY KEY(email_id, category_id)
            );

            CREATE TABLE IF NOT EXISTS sync_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                action_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                idempotency_key TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 8,
                next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_error TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(account_id, idempotency_key)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_emails_folder_date ON emails(folder_id, received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_emails_search ON emails(sender, subject, preview);
            CREATE INDEX IF NOT EXISTS idx_emails_account_folder_uid ON emails(account_id, folder_id, uid);
            CREATE INDEX IF NOT EXISTS idx_emails_account_read ON emails(account_id, is_read);
            CREATE INDEX IF NOT EXISTS idx_emails_account_favorite ON emails(account_id, is_favorite);
            CREATE INDEX IF NOT EXISTS idx_emails_account_important ON emails(account_id, is_important);
            CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_emails_subject ON emails(subject);
            CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_account_folder_uid_unique ON emails(account_id, folder_id, uid) WHERE uid IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_emails_account_folder_is_read ON emails(account_id, folder_id, is_read);
            CREATE INDEX IF NOT EXISTS idx_emails_account_folder_date ON emails(account_id, folder_id, received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_emails_recipients ON emails(recipients);
            CREATE INDEX IF NOT EXISTS idx_rules_account_enabled_priority ON rules(account_id, enabled, priority DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_contacts_usage ON contacts(usage_count DESC, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_email_categories_category ON email_categories(category_id, email_id);
            CREATE INDEX IF NOT EXISTS idx_sync_actions_pending ON sync_actions(status, next_attempt_at, priority DESC, id ASC);
            CREATE INDEX IF NOT EXISTS idx_folders_account_role ON folders(account_id, role);
            "#,
        )?;
        add_column(
            &conn,
            "accounts",
            "provider",
            "TEXT NOT NULL DEFAULT 'custom'",
        )?;
        add_column(
            &conn,
            "accounts",
            "imap_secure",
            "INTEGER NOT NULL DEFAULT 1",
        )?;
        add_column(
            &conn,
            "accounts",
            "smtp_secure",
            "INTEGER NOT NULL DEFAULT 1",
        )?;
        add_column(&conn, "accounts", "username", "TEXT NOT NULL DEFAULT ''")?;
        add_column(&conn, "accounts", "updated_at", "TEXT")?;
        add_column(&conn, "folders", "remote_name", "TEXT NOT NULL DEFAULT ''")?;
        add_column(&conn, "folders", "last_uid", "INTEGER")?;
        add_column(
            &conn,
            "folders",
            "sync_disabled",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column(&conn, "emails", "uid", "INTEGER")?;
        add_column(&conn, "emails", "is_favorite", "INTEGER NOT NULL DEFAULT 0")?;
        add_column(
            &conn,
            "emails",
            "is_important",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column(&conn, "emails", "deleted_at", "TEXT")?;
        add_column(&conn, "emails", "updated_at", "TEXT")?;
        add_column(&conn, "folders", "uid_validity_int", "INTEGER")?;
        add_column(&conn, "emails", "local_modified_at", "TEXT")?;
        add_column(&conn, "emails", "remote_synced_at", "TEXT")?;
        conn.execute(
            "INSERT OR IGNORE INTO smart_categories(key, label) VALUES
             ('invoices', 'Rechnungen'),
             ('orders', 'Bestellungen'),
             ('shipping', 'Versand'),
             ('newsletter', 'Newsletter'),
             ('social', 'Social'),
             ('events', 'Termine'),
             ('contracts', 'Verträge')",
            [],
        )?;
        conn.execute("UPDATE accounts SET provider = 'gmail' WHERE lower(email) LIKE '%@gmail.com' AND provider = 'custom'", [])?;
        conn.execute(
            "UPDATE accounts SET username = email WHERE username = ''",
            [],
        )?;
        conn.execute("UPDATE folders SET remote_name = CASE role WHEN 'inbox' THEN 'INBOX' ELSE name END WHERE remote_name = ''", [])?;
        Ok(())
    }

    pub fn save_account(&self, input: &AccountInput) -> Result<Account> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        if input.is_default.unwrap_or(false) {
            conn.execute("UPDATE accounts SET is_default = 0", [])?;
        }
        conn.execute(
            "INSERT INTO accounts (display_name, email, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, use_tls, is_default, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)
             ON CONFLICT(email) DO UPDATE SET
                display_name = excluded.display_name,
                provider = excluded.provider,
                imap_host = excluded.imap_host,
                imap_port = excluded.imap_port,
                imap_secure = excluded.imap_secure,
                smtp_host = excluded.smtp_host,
                smtp_port = excluded.smtp_port,
                smtp_secure = excluded.smtp_secure,
                username = excluded.username,
                use_tls = excluded.use_tls,
                is_default = excluded.is_default,
                updated_at = CURRENT_TIMESTAMP",
            params![
                input.display_name,
                input.email,
                provider_for(input),
                input.imap_host,
                input.imap_port,
                input.imap_secure.unwrap_or(input.use_tls.unwrap_or(true)) as i64,
                input.smtp_host,
                input.smtp_port,
                input.smtp_secure.unwrap_or(input.use_tls.unwrap_or(true)) as i64,
                input.username.clone().unwrap_or_else(|| input.email.clone()),
                input.use_tls.unwrap_or(true) as i64,
                input.is_default.unwrap_or(false) as i64
            ],
        )?;
        self.account_by_email(&conn, &input.email)
    }

    pub fn upsert_account_metadata(&self, input: &AccountInput) -> Result<Account> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        if input.is_default.unwrap_or(false) {
            conn.execute("UPDATE accounts SET is_default = 0", [])?;
        }
        conn.execute(
            "INSERT INTO accounts (display_name, email, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, use_tls, is_default, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)
             ON CONFLICT(email) DO UPDATE SET
                display_name = excluded.display_name,
                provider = excluded.provider,
                imap_host = excluded.imap_host,
                imap_port = excluded.imap_port,
                imap_secure = excluded.imap_secure,
                smtp_host = excluded.smtp_host,
                smtp_port = excluded.smtp_port,
                smtp_secure = excluded.smtp_secure,
                username = excluded.username,
                use_tls = excluded.use_tls,
                is_default = excluded.is_default,
                updated_at = CURRENT_TIMESTAMP",
            params![
                input.display_name.trim(),
                input.email.trim(),
                provider_for(input),
                input.imap_host.trim(),
                input.imap_port as i64,
                input.imap_secure.unwrap_or(true) as i64,
                input.smtp_host.trim(),
                input.smtp_port as i64,
                input.smtp_secure.unwrap_or(true) as i64,
                input
                    .username
                    .clone()
                    .filter(|username| !username.trim().is_empty())
                    .unwrap_or_else(|| input.email.trim().to_string()),
                input.use_tls.unwrap_or(true) as i64,
                input.is_default.unwrap_or(false) as i64
            ],
        )?;
        self.ensure_default_folders_for_conn(&conn, input.email.trim())
    }

    fn account_by_email(&self, conn: &Connection, email: &str) -> Result<Account> {
        conn.query_row(
            "SELECT id, display_name, email, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, is_default FROM accounts WHERE lower(email) = lower(?1)",
            [email],
            account_from_row,
        )
        .map_err(Into::into)
    }

    fn ensure_default_folders_for_conn(&self, conn: &Connection, email: &str) -> Result<Account> {
        let account = self.account_by_email(conn, email)?;
        for (name, remote_name, role) in [
            ("Inbox", "INBOX", "inbox"),
            ("Sent", "Sent", "sent"),
            ("Drafts", "Drafts", "drafts"),
            ("Trash", "Trash", "trash"),
            ("Spam", "Spam", "spam"),
            ("Werbung", "Promotions", "promotions"),
        ] {
            conn.execute(
                "INSERT OR IGNORE INTO folders(account_id, name, remote_name, role) VALUES (?1, ?2, ?3, ?4)",
                params![account.id, name, remote_name, role],
            )?;
        }
        Ok(account)
    }

    pub fn account(&self, id: i64) -> Result<Account> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT id, display_name, email, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, is_default FROM accounts WHERE id = ?1",
            [id],
            account_from_row,
        )
        .map_err(Into::into)
    }

    pub fn accounts(&self) -> Result<Vec<Account>> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut stmt = conn.prepare(
            "SELECT id, display_name, email, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, is_default FROM accounts ORDER BY is_default DESC, email ASC",
        )?;
        let accounts = stmt
            .query_map([], account_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(accounts)
    }

    pub fn ensure_default_folders(&self, account_id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        for (name, remote_name, role) in [
            ("Inbox", "INBOX", "inbox"),
            ("Sent", "Sent", "sent"),
            ("Drafts", "Drafts", "drafts"),
            ("Trash", "Trash", "trash"),
            ("Spam", "Spam", "spam"),
            ("Werbung", "Promotions", "promotions"),
        ] {
            conn.execute(
                "INSERT OR IGNORE INTO folders(account_id, name, remote_name, role) VALUES (?1, ?2, ?3, ?4)",
                params![account_id, name, remote_name, role],
            )?;
        }
        Ok(())
    }

    pub fn folders(&self, account_id: Option<i64>) -> Result<Vec<Folder>> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let sql = match account_id {
            Some(_) => "SELECT f.id, f.account_id, f.name, f.remote_name, f.role, f.last_uid, COALESCE(SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END), 0) FROM folders f LEFT JOIN emails e ON e.folder_id = f.id AND e.deleted_at IS NULL WHERE f.account_id = ?1 GROUP BY f.id ORDER BY f.account_id, CASE f.role WHEN 'inbox' THEN 1 WHEN 'sent' THEN 2 WHEN 'drafts' THEN 3 WHEN 'spam' THEN 4 WHEN 'promotions' THEN 5 WHEN 'trash' THEN 6 ELSE 7 END",
            None => "SELECT f.id, f.account_id, f.name, f.remote_name, f.role, f.last_uid, COALESCE(SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END), 0) FROM folders f LEFT JOIN emails e ON e.folder_id = f.id AND e.deleted_at IS NULL GROUP BY f.id ORDER BY f.account_id, CASE f.role WHEN 'inbox' THEN 1 WHEN 'sent' THEN 2 WHEN 'drafts' THEN 3 WHEN 'spam' THEN 4 WHEN 'promotions' THEN 5 WHEN 'trash' THEN 6 ELSE 7 END",
        };
        let mut stmt = conn.prepare(sql)?;
        let rows = match account_id {
            Some(id) => stmt
                .query_map([id], folder_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            None => stmt
                .query_map([], folder_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
        };
        Ok(rows)
    }

    pub fn emails(
        &self,
        account_id: Option<i64>,
        folder_id: Option<i64>,
        query: Option<&str>,
        view: Option<&str>,
        filters: Option<&MailFilters>,
    ) -> Result<Vec<Email>> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let sql = "SELECT id, account_id, folder_id, uid, message_id, sender, recipients, cc, bcc, subject, preview, '' AS body_text, '' AS body_html, received_at, is_read, is_favorite, is_important, deleted_at, updated_at, has_attachments
                   FROM emails
                   WHERE deleted_at IS NULL
                     AND (?1 IS NULL OR account_id = ?1)
                     AND (?2 IS NULL OR folder_id = ?2)
                     AND (?3 IS NULL OR sender LIKE ?3 OR subject LIKE ?3 OR preview LIKE ?3 OR body_text LIKE ?3 OR body_html LIKE ?3)
                     AND (
                       ?4 IS NULL
                       OR (?4 = 'favorites' AND is_favorite = 1)
                       OR (?4 = 'important' AND is_important = 1)
                       OR (?4 = 'unified_inbox' AND EXISTS (
                         SELECT 1 FROM folders uf WHERE uf.id = emails.folder_id AND uf.role = 'inbox'
                       ))
                     )
                     AND (?5 = 0 OR is_read = 0)
                     AND (?6 = 0 OR is_favorite = 1)
                     AND (?7 = 0 OR is_important = 1)
                     AND (?8 = 0 OR has_attachments = 1)
                     AND (
                        ?9 IS NULL
                        OR (?9 = 'today' AND date(received_at) = date('now', 'localtime'))
                        OR (?9 = 'week' AND date(received_at) >= date('now', '-6 days', 'localtime'))
                     )
                     AND (
                        ?10 IS NULL
                        OR EXISTS (
                          SELECT 1 FROM email_tags et
                          WHERE et.email_id = emails.id AND et.tag_id = ?10
                        )
                     )
                     AND (?11 IS NULL OR sender LIKE ?11)
                     AND (?12 IS NULL OR recipients LIKE ?12 OR COALESCE(cc, '') LIKE ?12 OR COALESCE(bcc, '') LIKE ?12)
                     AND (?13 IS NULL OR subject LIKE ?13)
                     AND (
                        ?14 IS NULL
                        OR (?14 = 1 AND is_read = 1)
                        OR (?14 = 0 AND is_read = 0)
                     )
                     AND (?15 IS NULL OR datetime(received_at) < datetime(?15))
                     AND (?16 IS NULL OR datetime(received_at) > datetime(?16))
                     AND (
                        ?17 IS NULL
                        OR EXISTS (
                          SELECT 1 FROM email_categories ec
                          WHERE ec.email_id = emails.id AND ec.category_id = ?17
                        )
                     )
                   ORDER BY received_at DESC
                   LIMIT 200";
        let like_query = query.map(|value| format!("%{}%", value.trim()));
        let unread_only = filters.and_then(|f| f.unread_only).unwrap_or(false) as i64;
        let favorite_only = filters.and_then(|f| f.favorite_only).unwrap_or(false) as i64;
        let important_only = filters.and_then(|f| f.important_only).unwrap_or(false) as i64;
        let has_attachment = filters.and_then(|f| f.has_attachment).unwrap_or(false) as i64;
        let date_range = filters.and_then(|f| f.date_range.as_deref());
        let tag_id = filters.and_then(|f| f.tag_id);
        let from_like = filters
            .and_then(|f| f.from.as_deref())
            .map(|value| format!("%{}%", value.trim()));
        let to_like = filters
            .and_then(|f| f.to.as_deref())
            .map(|value| format!("%{}%", value.trim()));
        let subject_like = filters
            .and_then(|f| f.subject.as_deref())
            .map(|value| format!("%{}%", value.trim()));
        let is_read = filters
            .and_then(|f| f.is_read)
            .map(|value| if value { 1_i64 } else { 0_i64 });
        let before = filters.and_then(|f| f.before.as_deref());
        let after = filters.and_then(|f| f.after.as_deref());
        let category_id = filters.and_then(|f| f.category_id);
        let mut stmt = conn.prepare(&sql)?;
        let mapped = stmt.query_map(
            params![
                account_id,
                folder_id,
                like_query,
                view,
                unread_only,
                favorite_only,
                important_only,
                has_attachment,
                date_range,
                tag_id,
                from_like,
                to_like,
                subject_like,
                is_read,
                before,
                after,
                category_id
            ],
            email_from_row,
        )?;
        let mut emails = mapped.collect::<rusqlite::Result<Vec<_>>>()?;
        let mut tags_by_email = self.tags_for_emails(
            &conn,
            &emails.iter().map(|email| email.id).collect::<Vec<_>>(),
        )?;
        for email in &mut emails {
            email.tags = tags_by_email.remove(&email.id).unwrap_or_default();
        }
        Ok(emails)
    }

    pub fn email(&self, id: i64) -> Result<Email> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut email = conn.query_row(
            "SELECT id, account_id, folder_id, uid, message_id, sender, recipients, cc, bcc, subject, preview, body_text, body_html, received_at, is_read, is_favorite, is_important, deleted_at, updated_at, has_attachments FROM emails WHERE id = ?1",
            [id],
            email_from_row,
        )?;
        email.attachments = self.attachments_for_email(&conn, id)?;
        email.tags = self.tags_for_email(&conn, id)?;
        Ok(email)
    }

    fn attachments_for_email(&self, conn: &Connection, email_id: i64) -> Result<Vec<Attachment>> {
        let mut stmt = conn.prepare(
            "SELECT id, email_id, draft_id, file_name, content_type, size, path FROM attachments WHERE email_id = ?1",
        )?;
        let attachments = stmt
            .query_map([email_id], attachment_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(attachments)
    }

    fn tags_for_email(&self, conn: &Connection, email_id: i64) -> Result<Vec<crate::mail::Tag>> {
        let mut tags_by_email = self.tags_for_emails(conn, &[email_id])?;
        Ok(tags_by_email.remove(&email_id).unwrap_or_default())
    }

    fn tags_for_emails(
        &self,
        conn: &Connection,
        email_ids: &[i64],
    ) -> Result<HashMap<i64, Vec<crate::mail::Tag>>> {
        let mut tags_by_email = HashMap::new();
        if email_ids.is_empty() {
            return Ok(tags_by_email);
        }
        let placeholders = email_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "SELECT et.email_id, t.id, t.name, t.color
             FROM tags t
             INNER JOIN email_tags et ON et.tag_id = t.id
             WHERE et.email_id IN ({placeholders})
             ORDER BY et.email_id ASC, t.name ASC"
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(rusqlite::params_from_iter(email_ids.iter()))?;
        while let Some(row) = rows.next()? {
            let email_id: i64 = row.get(0)?;
            let tag = crate::mail::Tag {
                id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
            };
            tags_by_email.entry(email_id).or_default().push(tag);
        }
        Ok(tags_by_email)
    }

    pub fn attachment_payload(
        &self,
        attachment_id: i64,
    ) -> Result<(String, Option<String>, Vec<u8>)> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let (file_name, path, blob): (String, Option<String>, Option<Vec<u8>>) = conn.query_row(
            "SELECT file_name, path, blob FROM attachments WHERE id = ?1",
            [attachment_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        Ok((file_name, path, blob.unwrap_or_default()))
    }

    pub fn sync_folders(&self, account_id: i64) -> Result<Vec<SyncFolder>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut stmt = conn.prepare(
            "SELECT id, account_id, name, remote_name, role, last_uid FROM folders
             WHERE account_id = ?1 AND role IN ('inbox', 'sent', 'drafts', 'spam', 'promotions', 'trash') AND sync_disabled = 0
             ORDER BY CASE role WHEN 'inbox' THEN 1 WHEN 'sent' THEN 2 WHEN 'drafts' THEN 3 WHEN 'spam' THEN 4 WHEN 'promotions' THEN 5 WHEN 'trash' THEN 6 ELSE 7 END",
        )?;
        let folders = stmt
            .query_map([account_id], sync_folder_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(folders)
    }

    pub fn sync_folder(&self, folder_id: i64) -> Result<SyncFolder> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT id, account_id, name, remote_name, role, last_uid FROM folders WHERE id = ?1",
            [folder_id],
            sync_folder_from_row,
        )
        .map_err(Into::into)
    }

    pub fn inbox_sync_folder(&self, account_id: i64) -> Result<SyncFolder> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT id, account_id, name, remote_name, role, last_uid FROM folders WHERE account_id = ?1 AND role = 'inbox' LIMIT 1",
            [account_id],
            sync_folder_from_row,
        )
        .map_err(Into::into)
    }

    pub fn inbox_local_mail_count(&self, account_id: i64) -> Result<i64> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT COUNT(*)
             FROM emails e
             INNER JOIN folders f ON f.id = e.folder_id
             WHERE e.account_id = ?1 AND f.role = 'inbox' AND e.deleted_at IS NULL",
            [account_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn unread_inbox_count(&self) -> Result<i64> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT COUNT(*)
             FROM emails e
             INNER JOIN folders f ON f.id = e.folder_id
             WHERE f.role = 'inbox'
               AND e.is_read = 0
               AND e.deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn account_last_sync_at(&self, account_id: i64) -> Result<Option<String>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT MAX(updated_at) FROM emails WHERE account_id = ?1",
            [account_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn oldest_uid_in_folder(&self, folder_id: i64) -> Result<Option<u32>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let value = conn.query_row(
            "SELECT MIN(uid) FROM emails WHERE folder_id = ?1 AND uid IS NOT NULL",
            [folder_id],
            |row| row.get::<_, Option<i64>>(0),
        )?;
        Ok(value.map(|uid| uid as u32))
    }

    #[allow(dead_code)]
    pub fn upsert_remote_folder(
        &self,
        account_id: i64,
        name: &str,
        remote_name: &str,
        role: &str,
    ) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "INSERT INTO folders(account_id, name, remote_name, role) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(account_id, name) DO UPDATE SET remote_name = excluded.remote_name, role = excluded.role, sync_disabled = 0",
            params![account_id, name, remote_name, role],
        )?;
        Ok(())
    }

    pub fn sync_folder_remote_presence(
        &self,
        account_id: i64,
        existing_remote_names: &HashSet<String>,
    ) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut stmt =
            conn.prepare("SELECT id, remote_name, role FROM folders WHERE account_id = ?1")?;
        let rows = stmt
            .query_map([account_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (folder_id, remote_name, role) in rows {
            let should_disable = role != "inbox" && !existing_remote_names.contains(&remote_name);
            conn.execute(
                "UPDATE folders SET sync_disabled = ?1 WHERE id = ?2",
                params![should_disable as i64, folder_id],
            )?;
        }
        Ok(())
    }

    pub fn upsert_emails(
        &self,
        folder: &SyncFolder,
        messages: Vec<IncomingEmail>,
    ) -> Result<Vec<NewMessageSummary>> {
        const BATCH_SIZE: usize = 40;
        let mut highest_uid = folder.last_uid.unwrap_or(0);
        let mut new_messages = Vec::new();
        for batch in messages.chunks(BATCH_SIZE) {
            let conn = self
                .write
                .lock()
                .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
            #[cfg(debug_assertions)]
            let start = Instant::now();
            let tx = conn.unchecked_transaction()?;
            highest_uid =
                Self::upsert_email_batch(&tx, folder, batch, &mut new_messages, highest_uid)?;
            tx.execute(
                "UPDATE folders SET last_uid = MAX(COALESCE(last_uid, 0), ?1) WHERE id = ?2",
                params![highest_uid, folder.id],
            )?;
            tx.commit()?;
            #[cfg(debug_assertions)]
            eprintln!(
                "perf: upsert_emails batch folder_id={} batch={} db_ms={}",
                folder.id,
                batch.len(),
                start.elapsed().as_millis()
            );
        }
        Ok(new_messages)
    }

    fn upsert_email_batch(
        tx: &rusqlite::Transaction<'_>,
        folder: &SyncFolder,
        messages: &[IncomingEmail],
        new_messages: &mut Vec<NewMessageSummary>,
        mut highest_uid: u32,
    ) -> Result<u32> {
        let mut deduped_by_uid = std::collections::HashMap::new();
        for message in messages {
            highest_uid = highest_uid.max(message.uid);
            deduped_by_uid.insert(message.uid, message);
        }

        let mut exists_stmt =
            tx.prepare("SELECT 1 FROM emails WHERE account_id = ?1 AND message_id = ?2")?;
        let mut uid_slot_stmt =
            tx.prepare("SELECT id, message_id FROM emails WHERE folder_id = ?1 AND uid = ?2")?;
        let mut clear_uid_slot_stmt = tx.prepare(
            "UPDATE emails SET uid = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE folder_id = ?1 AND uid = ?2 AND message_id != ?3",
        )?;
        let mut update_uid_slot_stmt = tx.prepare(
            "UPDATE emails SET
                message_id = ?1,
                sender = ?2,
                recipients = ?3,
                cc = ?4,
                subject = ?5,
                preview = CASE WHEN ?6 <> '' THEN ?6 ELSE preview END,
                body_text = COALESCE(body_text, ?7),
                body_html = COALESCE(body_html, ?8),
                received_at = ?9,
                is_read = ?10,
                deleted_at = NULL,
                updated_at = CURRENT_TIMESTAMP,
                has_attachments = CASE WHEN has_attachments = 1 OR ?11 = 1 THEN 1 ELSE 0 END
             WHERE id = ?12",
        )?;
        let mut upsert_stmt = tx.prepare(
            "INSERT INTO emails(account_id, folder_id, uid, message_id, sender, recipients, cc, subject, preview, body_text, body_html, received_at, is_read, is_favorite, is_important, deleted_at, updated_at, has_attachments)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, 0, NULL, CURRENT_TIMESTAMP, ?14)
             ON CONFLICT(account_id, message_id) DO UPDATE SET
                folder_id = excluded.folder_id,
                uid = excluded.uid,
                sender = excluded.sender,
                recipients = excluded.recipients,
                cc = excluded.cc,
                subject = excluded.subject,
                preview = CASE WHEN excluded.preview <> '' THEN excluded.preview ELSE emails.preview END,
                body_text = COALESCE(emails.body_text, excluded.body_text),
                body_html = COALESCE(emails.body_html, excluded.body_html),
                received_at = excluded.received_at,
                is_read = excluded.is_read,
                deleted_at = NULL,
                updated_at = CURRENT_TIMESTAMP,
                has_attachments = CASE WHEN emails.has_attachments = 1 OR excluded.has_attachments = 1 THEN 1 ELSE 0 END",
        )?;
        let mut email_id_by_message_stmt =
            tx.prepare("SELECT id FROM emails WHERE account_id = ?1 AND message_id = ?2")?;
        let mut detach_uid_stmt = tx.prepare(
            "UPDATE emails SET uid = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        )?;
        let mut delete_attachment_stmt =
            tx.prepare("DELETE FROM attachments WHERE email_id = ?1")?;
        let mut insert_attachment_stmt = tx.prepare(
            "INSERT INTO attachments(email_id, file_name, content_type, size, blob) VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        for message in deduped_by_uid.values() {
            let was_existing = exists_stmt
                .query_row(params![folder.account_id, message.message_id], |_| {
                    Ok(1_i64)
                })
                .optional()?
                .is_some();
            let message_row_id = email_id_by_message_stmt
                .query_row(params![folder.account_id, message.message_id], |row| {
                    row.get(0)
                })
                .optional()?;
            let uid_slot = uid_slot_stmt
                .query_row(params![folder.id, message.uid], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .optional()?;

            let had_uid_slot = uid_slot.is_some();
            let email_id = if let Some((uid_email_id, _existing_message_id)) = uid_slot {
                if let Some(message_email_id) = message_row_id {
                    if message_email_id != uid_email_id {
                        detach_uid_stmt.execute([uid_email_id])?;
                        clear_uid_slot_stmt.execute(params![
                            folder.id,
                            message.uid,
                            message.message_id
                        ])?;
                        upsert_stmt.execute(params![
                            folder.account_id,
                            folder.id,
                            message.uid,
                            message.message_id,
                            message.sender,
                            message.recipients,
                            message.cc,
                            message.subject,
                            message.preview,
                            message.body_text,
                            message.body_html,
                            message.received_at,
                            message.is_read as i64,
                            !message.attachments.is_empty() as i64
                        ])?;
                        message_email_id
                    } else {
                        update_uid_slot_stmt.execute(params![
                            message.message_id,
                            message.sender,
                            message.recipients,
                            message.cc,
                            message.subject,
                            message.preview,
                            message.body_text,
                            message.body_html,
                            message.received_at,
                            message.is_read as i64,
                            !message.attachments.is_empty() as i64,
                            uid_email_id
                        ])?;
                        uid_email_id
                    }
                } else {
                    update_uid_slot_stmt.execute(params![
                        message.message_id,
                        message.sender,
                        message.recipients,
                        message.cc,
                        message.subject,
                        message.preview,
                        message.body_text,
                        message.body_html,
                        message.received_at,
                        message.is_read as i64,
                        !message.attachments.is_empty() as i64,
                        uid_email_id
                    ])?;
                    uid_email_id
                }
            } else {
                clear_uid_slot_stmt.execute(params![folder.id, message.uid, message.message_id])?;
                upsert_stmt.execute(params![
                    folder.account_id,
                    folder.id,
                    message.uid,
                    message.message_id,
                    message.sender,
                    message.recipients,
                    message.cc,
                    message.subject,
                    message.preview,
                    message.body_text,
                    message.body_html,
                    message.received_at,
                    message.is_read as i64,
                    !message.attachments.is_empty() as i64
                ])?;
                email_id_by_message_stmt
                    .query_row(params![folder.account_id, message.message_id], |row| {
                        row.get(0)
                    })?
            };

            let is_new = !was_existing && !had_uid_slot;
            if is_new {
                new_messages.push(NewMessageSummary {
                    email_id,
                    account_id: folder.account_id,
                    folder_id: folder.id,
                    folder_role: folder.role.clone(),
                    sender: message.sender.clone(),
                    subject: message.subject.clone(),
                    is_read: message.is_read,
                });
            }
            let _ = classify_email_categories_tx(&tx, email_id, &message.sender, &message.subject);

            if !message.attachments.is_empty() {
                delete_attachment_stmt.execute([email_id])?;
                for attachment in &message.attachments {
                    insert_attachment_stmt.execute(params![
                        email_id,
                        attachment.file_name,
                        attachment.content_type,
                        attachment.size,
                        attachment.bytes
                    ])?;
                }
            }
        }
        Ok(highest_uid)
    }

    pub fn hydrate_email_content(&self, email_id: i64, message: &IncomingEmail) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE emails
             SET preview = CASE WHEN ?1 <> '' THEN ?1 ELSE preview END,
                 body_text = ?2,
                 body_html = ?3,
                 has_attachments = ?4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?5",
            params![
                message.preview,
                message.body_text,
                message.body_html,
                (!message.attachments.is_empty()) as i64,
                email_id
            ],
        )?;
        tx.execute("DELETE FROM attachments WHERE email_id = ?1", [email_id])?;
        for attachment in &message.attachments {
            tx.execute(
                "INSERT INTO attachments(email_id, file_name, content_type, size, blob) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    email_id,
                    attachment.file_name,
                    attachment.content_type,
                    attachment.size,
                    attachment.bytes
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn mark_email_read(&self, id: i64, read: bool) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "UPDATE emails SET is_read = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![read as i64, id],
        )?;
        Ok(())
    }

    pub fn move_email_to_folder(&self, id: i64, target_folder_id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "UPDATE emails SET folder_id = ?1, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![target_folder_id, id],
        )?;
        Ok(())
    }

    pub fn delete_email_permanently(&self, id: i64) -> Result<()> {
        self.delete_emails_permanently(&[id])
    }

    pub fn delete_emails_permanently(&self, ids: &[i64]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let tx = conn.unchecked_transaction()?;
        {
            let mut statement = tx.prepare("DELETE FROM emails WHERE id = ?1")?;
            for id in ids {
                statement.execute([id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn folder(&self, id: i64) -> Result<Folder> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT id, account_id, name, remote_name, role, last_uid, 0 FROM folders WHERE id = ?1",
            [id],
            folder_from_row,
        )
        .map_err(Into::into)
    }

    pub fn folder_by_role(&self, account_id: i64, role: &str) -> Result<Folder> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT id, account_id, name, remote_name, role, last_uid, 0 FROM folders WHERE account_id = ?1 AND role = ?2 LIMIT 1",
            params![account_id, role],
            folder_from_row,
        )
        .map_err(Into::into)
    }

    pub fn mail_counts(&self, account_id: Option<i64>) -> Result<MailCounts> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let counts = conn.query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN is_favorite = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_important = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_read = 0 AND deleted_at IS NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN has_attachments = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN date(received_at) = date('now', 'localtime') AND deleted_at IS NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN date(received_at) >= date('now', '-6 days', 'localtime') AND deleted_at IS NULL THEN 1 ELSE 0 END), 0)
             FROM emails
             WHERE deleted_at IS NULL
               AND (?1 IS NULL OR account_id = ?1)",
            params![account_id],
            |row| {
                Ok(MailCounts {
                    favorites: row.get(0)?,
                    important: row.get(1)?,
                    unread: row.get(2)?,
                    with_attachments: row.get(3)?,
                    today: row.get(4)?,
                    this_week: row.get(5)?,
                    per_account: Vec::new(),
                })
            },
        )?;
        let mut per_account_stmt = conn.prepare(
            "SELECT
                account_id,
                COALESCE(SUM(CASE WHEN is_favorite = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_important = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END), 0)
             FROM emails
             WHERE deleted_at IS NULL
               AND (?1 IS NULL OR account_id = ?1)
             GROUP BY account_id",
        )?;
        let per_account = per_account_stmt
            .query_map(params![account_id], |row| {
                Ok(AccountMailCounts {
                    account_id: row.get(0)?,
                    favorites: row.get(1)?,
                    important: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(MailCounts {
            per_account,
            ..counts
        })
    }

    pub fn email_meta(&self, id: i64) -> Result<(i64, i64, Option<u32>)> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT account_id, folder_id, uid FROM emails WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, Option<i64>>(2)?.map(|value| value as u32),
                ))
            },
        )
        .map_err(Into::into)
    }

    pub fn email_metas(&self, ids: &[i64]) -> Result<Vec<(i64, i64, i64, Option<u32>)>> {
        let conn = self
            .read
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut statement =
            conn.prepare("SELECT account_id, folder_id, uid FROM emails WHERE id = ?1")?;
        let mut metas = Vec::with_capacity(ids.len());
        for id in ids {
            let meta = statement
                .query_row([id], |row| {
                    Ok((
                        *id,
                        row.get(0)?,
                        row.get(1)?,
                        row.get::<_, Option<i64>>(2)?.map(|value| value as u32),
                    ))
                })
                .optional()?;
            if let Some(meta) = meta {
                metas.push(meta);
            }
        }
        Ok(metas)
    }

    pub fn toggle_favorite(&self, id: i64) -> Result<bool> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let value: i64 = conn.query_row(
            "SELECT is_favorite FROM emails WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;
        let next = value == 0;
        conn.execute(
            "UPDATE emails SET is_favorite = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![next as i64, id],
        )?;
        Ok(next)
    }

    pub fn toggle_important(&self, id: i64) -> Result<bool> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let value: i64 = conn.query_row(
            "SELECT is_important FROM emails WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;
        let next = value == 0;
        conn.execute(
            "UPDATE emails SET is_important = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![next as i64, id],
        )?;
        Ok(next)
    }

    pub fn store_sent(&self, account: &Account, draft: &Draft) -> Result<()> {
        self.ensure_default_folders(account.id)?;
        let folder = self
            .sync_folders(account.id)?
            .into_iter()
            .find(|folder| folder.role == "sent")
            .ok_or_else(|| anyhow!("Sent-Ordner wurde nicht gefunden"))?;
        let message = IncomingEmail {
            uid: folder.last_uid.unwrap_or(0) + 1,
            message_id: format!("<local-{}@{}>", uuid::Uuid::new_v4(), account.email),
            sender: account.email.clone(),
            recipients: draft.to.clone(),
            cc: draft.cc.clone(),
            subject: draft.subject.clone(),
            preview: draft.body.chars().take(160).collect(),
            body_text: Some(draft.body.clone()),
            body_html: None,
            received_at: chrono::Utc::now().to_rfc3339(),
            is_read: true,
            attachments: draft.attachments.clone(),
        };
        self.upsert_emails(&folder, vec![message]).map(|_| ())
    }

    pub fn delete_account(&self, id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute("DELETE FROM accounts WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn save_draft(&self, draft: &Draft) -> Result<i64> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let draft_id = match draft.id {
            Some(id) => {
                conn.execute(
                    "UPDATE drafts SET recipients = ?1, cc = ?2, bcc = ?3, subject = ?4, body = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
                    params![draft.to, draft.cc, draft.bcc, draft.subject, draft.body, id],
                )?;
                id
            }
            None => {
                conn.execute(
                    "INSERT INTO drafts(account_id, recipients, cc, bcc, subject, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![draft.account_id, draft.to, draft.cc, draft.bcc, draft.subject, draft.body],
                )?;
                conn.last_insert_rowid()
            }
        };
        conn.execute("DELETE FROM attachments WHERE draft_id = ?1", [draft_id])?;
        for attachment in &draft.attachments {
            conn.execute(
                "INSERT INTO attachments(draft_id, file_name, content_type, size, path) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    draft_id,
                    attachment.file_name,
                    attachment.content_type,
                    attachment.size,
                    attachment.path
                ],
            )?;
        }
        Ok(draft_id)
    }

    pub fn drafts(&self, account_id: Option<i64>) -> Result<Vec<Draft>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let sql = "SELECT id, account_id, recipients, cc, bcc, subject, body, updated_at
                   FROM drafts
                   WHERE (?1 IS NULL OR account_id = ?1)
                   ORDER BY updated_at DESC";
        let mut stmt = conn.prepare(sql)?;
        let drafts = stmt
            .query_map([account_id], |row| {
                Ok(Draft {
                    id: Some(row.get(0)?),
                    account_id: row.get(1)?,
                    to: row.get(2)?,
                    cc: row.get(3)?,
                    bcc: row.get(4)?,
                    subject: row.get(5)?,
                    body: row.get(6)?,
                    updated_at: row.get(7)?,
                    attachments: Vec::new(),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut with_attachments = Vec::with_capacity(drafts.len());
        for mut draft in drafts {
            let id = draft.id.unwrap_or_default();
            draft.attachments = self.attachments_for_draft(&conn, id)?;
            with_attachments.push(draft);
        }
        Ok(with_attachments)
    }

    pub fn delete_draft(&self, id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute("DELETE FROM drafts WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn tags(&self) -> Result<Vec<crate::mail::Tag>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut stmt =
            conn.prepare("SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE ASC")?;
        let tags = stmt
            .query_map([], |row| {
                Ok(crate::mail::Tag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(tags)
    }

    pub fn create_tag(&self, name: &str, color: &str) -> Result<crate::mail::Tag> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "INSERT INTO tags(name, color) VALUES (?1, ?2)
             ON CONFLICT(name) DO UPDATE SET color = excluded.color",
            params![name.trim(), color.trim()],
        )?;
        let tag = conn.query_row(
            "SELECT id, name, color FROM tags WHERE lower(name) = lower(?1)",
            [name.trim()],
            |row| {
                Ok(crate::mail::Tag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                })
            },
        )?;
        Ok(tag)
    }

    pub fn delete_tag(&self, id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn database_size_bytes(&self) -> Result<i64> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let page_size: i64 = conn.query_row("PRAGMA page_size", [], |row| row.get(0))?;
        let page_count: i64 = conn.query_row("PRAGMA page_count", [], |row| row.get(0))?;
        Ok(page_size.saturating_mul(page_count))
    }

    pub fn set_email_tags(&self, email_id: i64, tag_ids: &[i64]) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute("DELETE FROM email_tags WHERE email_id = ?1", [email_id])?;
        for tag_id in tag_ids {
            conn.execute(
                "INSERT OR IGNORE INTO email_tags(email_id, tag_id) VALUES (?1, ?2)",
                params![email_id, tag_id],
            )?;
        }
        Ok(())
    }

    pub fn categories(&self) -> Result<Vec<SmartCategory>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut stmt = conn.prepare(
            "SELECT c.id, c.key, c.label, COALESCE(COUNT(ec.email_id), 0) AS count
             FROM smart_categories c
             LEFT JOIN email_categories ec ON ec.category_id = c.id
             LEFT JOIN emails e ON e.id = ec.email_id AND e.deleted_at IS NULL
             GROUP BY c.id, c.key, c.label
             ORDER BY c.label ASC",
        )?;
        let items = stmt
            .query_map([], |row| {
                Ok(SmartCategory {
                    id: row.get(0)?,
                    key: row.get(1)?,
                    label: row.get(2)?,
                    count: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn update_folder_uid_validity(
        &self,
        folder_id: i64,
        uid_validity: Option<u32>,
    ) -> Result<bool> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let current: Option<i64> = conn
            .query_row(
                "SELECT uid_validity_int FROM folders WHERE id = ?1",
                [folder_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        let next = uid_validity.map(|value| value as i64);
        if next.is_some() && current.is_some() && next != current {
            conn.execute(
                "UPDATE folders SET last_uid = 0, uid_validity_int = ?1 WHERE id = ?2",
                params![next, folder_id],
            )?;
            // UID-Bereich wurde auf dem Server neu vergeben: UIDs lokal zurücksetzen,
            // E-Mails bleiben erhalten und werden beim nächsten Sync per message_id gematcht.
            conn.execute(
                "UPDATE emails SET uid = NULL, updated_at = CURRENT_TIMESTAMP WHERE folder_id = ?1",
                [folder_id],
            )?;
            return Ok(true);
        }
        conn.execute(
            "UPDATE folders SET uid_validity_int = COALESCE(?1, uid_validity_int) WHERE id = ?2",
            params![next, folder_id],
        )?;
        Ok(false)
    }

    pub fn enqueue_sync_action(
        &self,
        account_id: i64,
        action_type: &str,
        idempotency_key: &str,
        payload_json: &str,
        priority: i64,
    ) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "INSERT INTO sync_actions(account_id, action_type, status, idempotency_key, payload_json, priority)
             VALUES (?1, ?2, 'pending', ?3, ?4, ?5)
             ON CONFLICT(account_id, idempotency_key) DO UPDATE SET
               payload_json = excluded.payload_json,
               status = 'pending',
               updated_at = CURRENT_TIMESTAMP",
            params![account_id, action_type, idempotency_key, payload_json, priority],
        )?;
        Ok(())
    }

    pub fn pending_sync_actions(
        &self,
        account_id: i64,
        limit: i64,
    ) -> Result<Vec<(i64, String, String, i64)>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut stmt = conn.prepare(
            "SELECT id, action_type, payload_json, attempt_count
             FROM sync_actions
             WHERE account_id = ?1
               AND status IN ('pending', 'failed')
               AND datetime(next_attempt_at) <= datetime('now')
             ORDER BY priority DESC, id ASC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![account_id, limit], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn mark_sync_action_in_flight(&self, id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "UPDATE sync_actions SET status = 'in_flight', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }

    pub fn mark_sync_action_done(&self, id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute("DELETE FROM sync_actions WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn mark_sync_action_failed(
        &self,
        id: i64,
        attempt_count: i64,
        wait_minutes: i64,
        error: &str,
    ) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "UPDATE sync_actions
             SET status = 'failed',
                 attempt_count = ?2,
                 next_attempt_at = datetime('now', printf('+%d minutes', ?3)),
                 last_error = ?4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![id, attempt_count, wait_minutes, error],
        )?;
        Ok(())
    }

    pub fn queue_status(&self, account_id: Option<i64>) -> Result<(i64, i64, i64)> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let sql = "SELECT
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'in_flight' THEN 1 ELSE 0 END), 0)
          FROM sync_actions
          WHERE (?1 IS NULL OR account_id = ?1)";
        conn.query_row(sql, [account_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(Into::into)
    }

    pub fn mail_total_count(&self) -> Result<i64> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row(
            "SELECT COUNT(*) FROM emails WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn attachment_total_count(&self) -> Result<i64> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.query_row("SELECT COUNT(*) FROM attachments", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn integrity_summary(&self) -> Result<(i64, i64, i64)> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let duplicate_message_ids = conn.query_row(
            "SELECT COUNT(*) FROM (
               SELECT account_id, message_id, COUNT(*) c
               FROM emails
               GROUP BY account_id, message_id
               HAVING c > 1
             )",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        let orphan_attachments = conn.query_row(
            "SELECT COUNT(*)
             FROM attachments a
             LEFT JOIN emails e ON e.id = a.email_id
             LEFT JOIN drafts d ON d.id = a.draft_id
             WHERE a.email_id IS NOT NULL AND e.id IS NULL
                OR a.draft_id IS NOT NULL AND d.id IS NULL",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        let account_folder_mismatch = conn.query_row(
            "SELECT COUNT(*)
             FROM emails e
             INNER JOIN folders f ON f.id = e.folder_id
             WHERE e.account_id != f.account_id",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        Ok((
            duplicate_message_ids,
            orphan_attachments,
            account_folder_mismatch,
        ))
    }

    pub fn rules(&self, account_id: Option<i64>) -> Result<Vec<MailRule>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut stmt = conn.prepare(
            "SELECT id, account_id, name, enabled, priority, field, operator, value, action_type, action_value, created_at, updated_at
             FROM rules
             WHERE (?1 IS NULL OR account_id = ?1 OR account_id IS NULL)
             ORDER BY priority DESC, id DESC",
        )?;
        let rows = stmt
            .query_map([account_id], rule_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn save_rule(&self, input: &RuleInput) -> Result<MailRule> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        if let Some(id) = input.id {
            conn.execute(
                "UPDATE rules
                 SET account_id = ?1, name = ?2, enabled = ?3, priority = ?4, field = ?5, operator = ?6, value = ?7, action_type = ?8, action_value = ?9, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?10",
                params![
                    input.account_id,
                    input.name.trim(),
                    input.enabled.unwrap_or(true) as i64,
                    input.priority.unwrap_or(0),
                    input.field.trim(),
                    input.operator.trim(),
                    input.value.trim(),
                    input.action_type.trim(),
                    input.action_value.as_ref().map(|value| value.trim().to_string()),
                    id
                ],
            )?;
            return conn
                .query_row(
                    "SELECT id, account_id, name, enabled, priority, field, operator, value, action_type, action_value, created_at, updated_at FROM rules WHERE id = ?1",
                    [id],
                    rule_from_row,
                )
                .map_err(Into::into);
        }
        conn.execute(
            "INSERT INTO rules(account_id, name, enabled, priority, field, operator, value, action_type, action_value)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                input.account_id,
                input.name.trim(),
                input.enabled.unwrap_or(true) as i64,
                input.priority.unwrap_or(0),
                input.field.trim(),
                input.operator.trim(),
                input.value.trim(),
                input.action_type.trim(),
                input.action_value.as_ref().map(|value| value.trim().to_string())
            ],
        )?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, account_id, name, enabled, priority, field, operator, value, action_type, action_value, created_at, updated_at FROM rules WHERE id = ?1",
            [id],
            rule_from_row,
        )
        .map_err(Into::into)
    }

    pub fn delete_rule(&self, id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute("DELETE FROM rules WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn apply_rules_for_new_messages(
        &self,
        account_id: i64,
        new_messages: &[NewMessageSummary],
    ) -> Result<()> {
        if new_messages.is_empty() {
            return Ok(());
        }
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let mut rules_stmt = conn.prepare(
            "SELECT id, account_id, name, enabled, priority, field, operator, value, action_type, action_value, created_at, updated_at
             FROM rules
             WHERE enabled = 1 AND (account_id IS NULL OR account_id = ?1)
             ORDER BY priority DESC, id DESC",
        )?;
        let rules = rules_stmt
            .query_map([account_id], rule_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if rules.is_empty() {
            return Ok(());
        }
        let tx = conn.unchecked_transaction()?;
        for new_message in new_messages {
            let email: (String, String, Option<String>) = tx.query_row(
                "SELECT sender, subject, recipients FROM emails WHERE id = ?1",
                [new_message.email_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;
            for rule in &rules {
                if !rule_matches(&rule.field, &rule.operator, &rule.value, &email) {
                    continue;
                }
                match rule.action_type.as_str() {
                    "favorite" => {
                        tx.execute("UPDATE emails SET is_favorite = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1", [new_message.email_id])?;
                    }
                    "important" => {
                        tx.execute("UPDATE emails SET is_important = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1", [new_message.email_id])?;
                    }
                    "read" => {
                        tx.execute("UPDATE emails SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1", [new_message.email_id])?;
                    }
                    "move" => {
                        if let Some(target) = rule.action_value.as_deref() {
                            if let Some(target_id) =
                                resolve_target_folder_id(&tx, account_id, target)?
                            {
                                tx.execute("UPDATE emails SET folder_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2", params![target_id, new_message.email_id])?;
                            }
                        }
                    }
                    "tag" => {
                        let name = rule
                            .action_value
                            .as_deref()
                            .unwrap_or(rule.value.as_str())
                            .trim();
                        if !name.is_empty() {
                            let tag_id = upsert_tag_by_name(&tx, name)?;
                            tx.execute(
                                "INSERT OR IGNORE INTO email_tags(email_id, tag_id) VALUES (?1, ?2)",
                                params![new_message.email_id, tag_id],
                            )?;
                        }
                    }
                    _ => {}
                }
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn contacts(&self, query: Option<&str>) -> Result<Vec<Contact>> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let like_query = query.map(|value| format!("%{}%", value.trim()));
        let mut stmt = conn.prepare(
            "SELECT id, name, email, last_contact_at, usage_count, is_favorite, created_at, updated_at
             FROM contacts
             WHERE (?1 IS NULL OR name LIKE ?1 OR email LIKE ?1)
             ORDER BY is_favorite DESC, usage_count DESC, updated_at DESC, name COLLATE NOCASE ASC",
        )?;
        let rows = stmt
            .query_map([like_query], contact_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn save_contact(&self, input: &ContactInput) -> Result<Contact> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let normalized_email = input.email.trim().to_lowercase();
        if let Some(id) = input.id {
            conn.execute(
                "UPDATE contacts
                 SET name = ?1, email = ?2, is_favorite = ?3, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?4",
                params![
                    input.name.trim(),
                    normalized_email,
                    input.is_favorite.unwrap_or(false) as i64,
                    id
                ],
            )?;
            return conn
                .query_row(
                    "SELECT id, name, email, last_contact_at, usage_count, is_favorite, created_at, updated_at FROM contacts WHERE id = ?1",
                    [id],
                    contact_from_row,
                )
                .map_err(Into::into);
        }
        conn.execute(
            "INSERT INTO contacts(name, email, is_favorite)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(email) DO UPDATE SET
                name = excluded.name,
                is_favorite = excluded.is_favorite,
                updated_at = CURRENT_TIMESTAMP",
            params![
                input.name.trim(),
                normalized_email,
                input.is_favorite.unwrap_or(false) as i64
            ],
        )?;
        conn.query_row(
            "SELECT id, name, email, last_contact_at, usage_count, is_favorite, created_at, updated_at FROM contacts WHERE email = ?1",
            [normalized_email],
            contact_from_row,
        )
        .map_err(Into::into)
    }

    pub fn delete_contact(&self, id: i64) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute("DELETE FROM contacts WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn touch_contact(&self, name: &str, email: &str) -> Result<()> {
        let normalized_email = email.trim().to_lowercase();
        if normalized_email.is_empty() {
            return Ok(());
        }
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "INSERT INTO contacts(name, email, last_contact_at, usage_count, is_favorite)
             VALUES (?1, ?2, CURRENT_TIMESTAMP, 1, 0)
             ON CONFLICT(email) DO UPDATE SET
                name = CASE WHEN trim(excluded.name) <> '' THEN excluded.name ELSE contacts.name END,
                last_contact_at = CURRENT_TIMESTAMP,
                usage_count = contacts.usage_count + 1,
                updated_at = CURRENT_TIMESTAMP",
            params![name.trim(), normalized_email],
        )?;
        Ok(())
    }

    pub fn settings(&self) -> Result<Settings> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'settings'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(value
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or(Settings {
                theme: "light".to_string(),
                accent_color: default_accent_color(),
                layout_mode: default_layout_mode(),
                font_size: 16,
                sync_interval_minutes: 15,
                external_images: default_external_images(),
                allow_local_secret_fallback: default_allow_local_secret_fallback(),
                notifications_enabled: default_notifications_enabled(),
                notification_sound: default_notification_sound(),
                notification_preview: default_notification_preview(),
                run_in_background: default_run_in_background(),
                account_notifications: HashMap::new(),
                account_appearance: HashMap::new(),
                default_account_id: None,
            }))
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        let conn = self
            .write
            .lock()
            .map_err(|_| anyhow!("Datenbank ist gesperrt"))?;
        conn.execute(
            "INSERT INTO settings(key, value) VALUES ('settings', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [serde_json::to_string(settings)?],
        )?;
        Ok(())
    }
}

fn account_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        display_name: row.get(1)?,
        email: row.get(2)?,
        provider: row.get(3)?,
        imap_host: row.get(4)?,
        imap_port: row.get::<_, i64>(5)? as u16,
        imap_secure: row.get::<_, i64>(6)? == 1,
        smtp_host: row.get(7)?,
        smtp_port: row.get::<_, i64>(8)? as u16,
        smtp_secure: row.get::<_, i64>(9)? == 1,
        username: row.get(10)?,
        is_default: row.get::<_, i64>(11)? == 1,
    })
}

fn folder_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Folder> {
    Ok(Folder {
        id: row.get(0)?,
        account_id: row.get(1)?,
        name: row.get(2)?,
        remote_name: row.get(3)?,
        role: row.get(4)?,
        last_uid: row.get::<_, Option<i64>>(5)?.map(|uid| uid as u32),
        unread_count: row.get(6)?,
    })
}

fn email_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Email> {
    Ok(Email {
        id: row.get(0)?,
        account_id: row.get(1)?,
        folder_id: row.get(2)?,
        uid: row.get::<_, Option<i64>>(3)?.map(|uid| uid as u32),
        message_id: row.get(4)?,
        sender: row.get(5)?,
        recipients: row.get(6)?,
        cc: row.get(7)?,
        bcc: row.get(8)?,
        subject: row.get(9)?,
        preview: row.get(10)?,
        body_text: row.get(11)?,
        body_html: row.get(12)?,
        received_at: row.get(13)?,
        is_read: row.get::<_, i64>(14)? == 1,
        is_favorite: row.get::<_, i64>(15)? == 1,
        is_important: row.get::<_, i64>(16)? == 1,
        deleted_at: row.get(17)?,
        updated_at: row.get(18)?,
        has_attachments: row.get::<_, i64>(19)? == 1,
        attachments: Vec::new(),
        tags: Vec::new(),
    })
}

fn sync_folder_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncFolder> {
    Ok(SyncFolder {
        id: row.get(0)?,
        account_id: row.get(1)?,
        name: row.get(2)?,
        remote_name: row.get(3)?,
        role: row.get(4)?,
        last_uid: row.get::<_, Option<i64>>(5)?.map(|uid| uid as u32),
    })
}

fn attachment_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Attachment> {
    Ok(Attachment {
        id: row.get(0)?,
        email_id: row.get(1)?,
        draft_id: row.get(2)?,
        file_name: row.get(3)?,
        content_type: row.get(4)?,
        size: row.get(5)?,
        path: row.get(6)?,
        bytes: Vec::new(),
    })
}

fn rule_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MailRule> {
    Ok(MailRule {
        id: row.get(0)?,
        account_id: row.get(1)?,
        name: row.get(2)?,
        enabled: row.get::<_, i64>(3)? == 1,
        priority: row.get(4)?,
        field: row.get(5)?,
        operator: row.get(6)?,
        value: row.get(7)?,
        action_type: row.get(8)?,
        action_value: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn contact_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Contact> {
    Ok(Contact {
        id: row.get(0)?,
        name: row.get(1)?,
        email: row.get(2)?,
        last_contact_at: row.get(3)?,
        usage_count: row.get(4)?,
        is_favorite: row.get::<_, i64>(5)? == 1,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn rule_matches(
    field: &str,
    operator: &str,
    needle: &str,
    email: &(String, String, Option<String>),
) -> bool {
    let haystack = match field {
        "sender" => email.0.as_str(),
        "subject" => email.1.as_str(),
        "to" | "recipients" => email.2.as_deref().unwrap_or_default(),
        _ => "",
    };
    let left = haystack.to_ascii_lowercase();
    let right = needle.trim().to_ascii_lowercase();
    if right.is_empty() {
        return false;
    }
    match operator {
        "equals" => left == right,
        "startsWith" => left.starts_with(&right),
        "endsWith" => left.ends_with(&right),
        _ => left.contains(&right),
    }
}

fn resolve_target_folder_id(
    conn: &rusqlite::Transaction<'_>,
    account_id: i64,
    target: &str,
) -> Result<Option<i64>> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if let Ok(id) = trimmed.parse::<i64>() {
        return Ok(Some(id));
    }
    let by_role = conn
        .query_row(
            "SELECT id FROM folders WHERE account_id = ?1 AND role = ?2 LIMIT 1",
            params![account_id, trimmed.to_ascii_lowercase()],
            |row| row.get(0),
        )
        .optional()?;
    if by_role.is_some() {
        return Ok(by_role);
    }
    conn.query_row(
        "SELECT id FROM folders WHERE account_id = ?1 AND (name = ?2 OR remote_name = ?2) LIMIT 1",
        params![account_id, trimmed],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn upsert_tag_by_name(conn: &rusqlite::Transaction<'_>, name: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO tags(name, color) VALUES (?1, '#3b82f6')
         ON CONFLICT(name) DO NOTHING",
        [name],
    )?;
    conn.query_row(
        "SELECT id FROM tags WHERE lower(name) = lower(?1)",
        [name],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn classify_email_categories_tx(
    tx: &rusqlite::Transaction<'_>,
    email_id: i64,
    sender: &str,
    subject: &str,
) -> Result<()> {
    let sender_l = sender.to_ascii_lowercase();
    let subject_l = subject.to_ascii_lowercase();
    let mut keys = Vec::new();
    if sender_l.contains("invoice")
        || subject_l.contains("rechnung")
        || subject_l.contains("invoice")
    {
        keys.push("invoices");
    }
    if sender_l.contains("order") || subject_l.contains("bestellung") || subject_l.contains("order")
    {
        keys.push("orders");
    }
    if subject_l.contains("versand")
        || subject_l.contains("shipping")
        || sender_l.contains("dhl")
        || sender_l.contains("ups")
    {
        keys.push("shipping");
    }
    if subject_l.contains("newsletter") || sender_l.contains("newsletter") {
        keys.push("newsletter");
    }
    if sender_l.contains("facebook") || sender_l.contains("instagram") || sender_l.contains("x.com")
    {
        keys.push("social");
    }
    if subject_l.contains("meeting")
        || subject_l.contains("termin")
        || subject_l.contains("calendar")
    {
        keys.push("events");
    }
    if subject_l.contains("vertrag") || subject_l.contains("contract") {
        keys.push("contracts");
    }
    tx.execute(
        "DELETE FROM email_categories WHERE email_id = ?1",
        [email_id],
    )?;
    for key in keys {
        let category_id: Option<i64> = tx
            .query_row(
                "SELECT id FROM smart_categories WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(category_id) = category_id {
            tx.execute(
                "INSERT OR IGNORE INTO email_categories(email_id, category_id) VALUES (?1, ?2)",
                params![email_id, category_id],
            )?;
        }
    }
    Ok(())
}

impl Db {
    fn attachments_for_draft(&self, conn: &Connection, draft_id: i64) -> Result<Vec<Attachment>> {
        let mut stmt = conn.prepare(
            "SELECT id, email_id, draft_id, file_name, content_type, size, path FROM attachments WHERE draft_id = ?1",
        )?;
        let attachments = stmt
            .query_map([draft_id], attachment_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(attachments)
    }
}

fn provider_for(input: &AccountInput) -> String {
    input.provider.clone().unwrap_or_else(|| {
        if input.email.to_lowercase().ends_with("@gmail.com") {
            "gmail".to_string()
        } else {
            "custom".to_string()
        }
    })
}

fn add_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .iter()
        .any(|name| name == column);
    if !exists {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}
