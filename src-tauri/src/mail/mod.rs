pub mod imap;
pub mod smtp;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: i64,
    pub display_name: String,
    pub email: String,
    pub provider: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_secure: bool,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_secure: bool,
    pub username: String,
    pub is_default: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub display_name: String,
    pub email: String,
    pub provider: Option<String>,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_secure: Option<bool>,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_secure: Option<bool>,
    pub username: Option<String>,
    pub use_tls: Option<bool>,
    pub is_default: Option<bool>,
    pub password: String,
    pub smtp_password: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub account_id: i64,
    pub name: String,
    pub remote_name: String,
    pub role: String,
    pub last_uid: Option<u32>,
    pub unread_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: i64,
    pub email_id: Option<i64>,
    pub draft_id: Option<i64>,
    pub file_name: String,
    pub content_type: String,
    pub size: i64,
    pub path: Option<String>,
    #[serde(skip_serializing, default)]
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Email {
    pub id: i64,
    pub account_id: i64,
    pub folder_id: i64,
    pub uid: Option<u32>,
    pub message_id: String,
    pub sender: String,
    pub recipients: String,
    pub cc: Option<String>,
    pub bcc: Option<String>,
    pub subject: String,
    pub preview: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub received_at: String,
    pub is_read: bool,
    pub is_favorite: bool,
    pub is_important: bool,
    pub deleted_at: Option<String>,
    pub updated_at: Option<String>,
    pub has_attachments: bool,
    pub attachments: Vec<Attachment>,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailCounts {
    pub favorites: i64,
    pub important: i64,
    pub unread: i64,
    pub with_attachments: i64,
    pub today: i64,
    pub this_week: i64,
    pub per_account: Vec<AccountMailCounts>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountMailCounts {
    pub account_id: i64,
    pub favorites: i64,
    pub important: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: Option<i64>,
    pub account_id: i64,
    pub to: String,
    pub cc: Option<String>,
    pub bcc: Option<String>,
    pub subject: String,
    pub body: String,
    pub updated_at: Option<String>,
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Clone)]
pub struct IncomingEmail {
    pub uid: u32,
    pub message_id: String,
    pub sender: String,
    pub recipients: String,
    pub cc: Option<String>,
    pub subject: String,
    pub preview: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub received_at: String,
    pub is_read: bool,
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Clone)]
pub struct SyncFolder {
    pub id: i64,
    pub account_id: i64,
    pub name: String,
    pub remote_name: String,
    pub role: String,
    pub last_uid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub account_id: i64,
    pub folders_synced: usize,
    pub messages_synced: usize,
    pub requested_messages: usize,
    pub errors: Vec<String>,
    pub new_messages: Vec<NewMessageSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxInfo {
    pub name: String,
    pub attributes: Vec<String>,
    pub inferred_role: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerMessageSummary {
    pub uid: u32,
    pub message_id: String,
    pub subject: String,
    pub sender: String,
    pub date: String,
    pub flags: Vec<String>,
    pub seen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessageSummary {
    pub email_id: i64,
    pub account_id: i64,
    pub folder_id: i64,
    pub folder_role: String,
    pub sender: String,
    pub subject: String,
    pub is_read: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailRule {
    pub id: i64,
    pub account_id: Option<i64>,
    pub name: String,
    pub enabled: bool,
    pub priority: i64,
    pub field: String,
    pub operator: String,
    pub value: String,
    pub action_type: String,
    pub action_value: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleInput {
    pub id: Option<i64>,
    pub account_id: Option<i64>,
    pub name: String,
    pub enabled: Option<bool>,
    pub priority: Option<i64>,
    pub field: String,
    pub operator: String,
    pub value: String,
    pub action_type: String,
    pub action_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub last_contact_at: Option<String>,
    pub usage_count: i64,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput {
    pub id: Option<i64>,
    pub name: String,
    pub email: String,
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartCategory {
    pub id: i64,
    pub key: String,
    pub label: String,
    pub count: i64,
}
