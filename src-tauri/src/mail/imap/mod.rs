use super::{
    Account, Attachment, IncomingEmail, MailboxInfo, ServerMessageSummary, SyncFolder, SyncReport,
};
use anyhow::{anyhow, Result};
use chrono::Utc;
use imap::{Authenticator, Client, Session};
use mailparse::{parse_headers, parse_mail, MailHeaderMap, ParsedMail};
use native_tls::{TlsConnector, TlsStream};
use std::net::TcpStream;

const INITIAL_SYNC_LIMIT: usize = 50;

pub fn test_connection(account: &Account, password: &str) -> Result<()> {
    let mut session = login(account, password)?;
    session.logout()?;
    Ok(())
}

#[allow(dead_code)]
pub fn discover_folders(
    account: &Account,
    password: &str,
) -> Result<Vec<(String, String, String)>> {
    let names = list_mailboxes(account, password)?;
    let mut folders = Vec::new();

    for mailbox in names {
        let remote = mailbox.name;
        let role = mailbox.inferred_role;
        if matches!(
            role.as_str(),
            "inbox" | "sent" | "drafts" | "trash" | "spam" | "promotions"
        ) {
            folders.push((display_name_for_role(&role).to_string(), remote, role));
        }
    }

    folders.sort_by_key(|(_, _, role)| match role.as_str() {
        "inbox" => 1,
        "sent" => 2,
        "drafts" => 3,
        "spam" => 4,
        "promotions" => 5,
        "trash" => 6,
        _ => 7,
    });
    folders.dedup_by(|a, b| a.2 == b.2);
    Ok(folders)
}

pub fn list_mailboxes(account: &Account, password: &str) -> Result<Vec<MailboxInfo>> {
    let mut session = login(account, password)?;
    let names = session.list(None, Some("*"))?;
    let mut mailboxes = Vec::new();
    for mailbox in names.iter() {
        let name = mailbox.name().to_string();
        let attributes = mailbox
            .attributes()
            .iter()
            .map(|item| format!("{item:?}"))
            .collect::<Vec<_>>();
        let inferred_role = infer_mailbox_role(&name, &attributes);
        mailboxes.push(MailboxInfo {
            name,
            attributes,
            inferred_role,
        });
    }
    session.logout()?;
    Ok(mailboxes)
}

pub fn detect_inbox_remote_name(mailboxes: &[MailboxInfo]) -> Option<String> {
    mailboxes
        .iter()
        .find(|mailbox| {
            mailbox
                .attributes
                .iter()
                .any(|value| value.to_ascii_lowercase().contains("inbox"))
                || mailbox.name.eq_ignore_ascii_case("inbox")
                || mailbox.inferred_role == "inbox"
        })
        .map(|mailbox| mailbox.name.clone())
        .or_else(|| mailboxes.first().map(|mailbox| mailbox.name.clone()))
}

pub fn sync_account(
    account: &Account,
    password: &str,
    folders: &[SyncFolder],
) -> Result<(SyncReport, Vec<(SyncFolder, Vec<IncomingEmail>)>)> {
    let mut session = login(account, password)?;
    let mut report = SyncReport {
        account_id: account.id,
        folders_synced: 0,
        messages_synced: 0,
        requested_messages: 0,
        errors: Vec::new(),
        new_messages: Vec::new(),
    };
    let mut synced = Vec::new();

    for folder in folders {
        match sync_folder(&mut session, folder) {
            Ok(messages) => {
                report.folders_synced += 1;
                report.messages_synced += messages.len();
                report.requested_messages += messages.len();
                synced.push((folder.clone(), messages));
            }
            Err(error) => report.errors.push(format!("{}: {error}", folder.name)),
        }
    }

    session.logout()?;
    Ok((report, synced))
}

pub fn move_message(
    account: &Account,
    password: &str,
    source_mailbox: &str,
    target_mailbox: &str,
    uid: u32,
) -> Result<()> {
    let mut session = login(account, password)?;
    session.select(source_mailbox)?;
    session.uid_copy(uid.to_string(), target_mailbox)?;
    session.uid_store(uid.to_string(), "+FLAGS.SILENT (\\Seen \\Deleted)")?;
    session.expunge()?;
    session.logout()?;
    Ok(())
}

pub fn delete_message(account: &Account, password: &str, mailbox: &str, uid: u32) -> Result<()> {
    delete_messages(account, password, mailbox, &[uid])
}

pub fn delete_messages(
    account: &Account,
    password: &str,
    mailbox: &str,
    uids: &[u32],
) -> Result<()> {
    if uids.is_empty() {
        return Ok(());
    }
    let mut session = login(account, password)?;
    session.select(mailbox)?;
    let uid_set = uids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    session.uid_store(uid_set, "+FLAGS.SILENT (\\Deleted)")?;
    session.expunge()?;
    session.logout()?;
    Ok(())
}

pub fn set_seen(
    account: &Account,
    password: &str,
    mailbox: &str,
    uid: u32,
    seen: bool,
) -> Result<()> {
    let mut session = login(account, password)?;
    session.select(mailbox)?;
    let op = if seen {
        "+FLAGS.SILENT (\\Seen)"
    } else {
        "-FLAGS.SILENT (\\Seen)"
    };
    session.uid_store(uid.to_string(), op)?;
    session.logout()?;
    Ok(())
}

pub fn sync_older_messages(
    account: &Account,
    password: &str,
    folder: &SyncFolder,
    before_uid: Option<u32>,
    limit: usize,
) -> Result<Vec<IncomingEmail>> {
    let mut session = login(account, password)?;
    let messages = sync_folder_older(&mut session, folder, before_uid, limit)?;
    session.logout()?;
    Ok(messages)
}

pub fn fetch_message_detail(
    account: &Account,
    password: &str,
    mailbox: &str,
    uid: u32,
) -> Result<IncomingEmail> {
    let mut session = login(account, password)?;
    session.select(mailbox)?;
    let fetches = session.uid_fetch(uid.to_string(), "(RFC822 FLAGS UID)")?;
    let fetch = fetches
        .iter()
        .next()
        .ok_or_else(|| anyhow!("Nachricht wurde nicht gefunden"))?;
    let body = fetch
        .body()
        .ok_or_else(|| anyhow!("Nachrichteninhalt konnte nicht geladen werden"))?;
    let parsed = parse_mail(body)?;
    let flags = fetch.flags();
    let message = parse_message(
        uid,
        &parsed,
        flags
            .iter()
            .any(|flag| matches!(flag, imap::types::Flag::Seen)),
    )?;
    session.logout()?;
    Ok(message)
}

pub fn highest_uid(account: &Account, password: &str, mailbox: &str) -> Result<Option<u32>> {
    let mut session = login(account, password)?;
    session.select(mailbox)?;
    let uids = session.uid_search("1:*")?;
    let highest = uids.iter().copied().max();
    session.logout()?;
    Ok(highest)
}

pub fn fetch_uid_validity(account: &Account, password: &str, mailbox: &str) -> Result<Option<u32>> {
    let mut session = login(account, password)?;
    let selected = session.select(mailbox)?;
    let uid_validity = selected.uid_validity;
    session.logout()?;
    Ok(uid_validity)
}

pub fn fetch_latest_server_messages(
    account: &Account,
    password: &str,
    mailbox: &str,
    limit: usize,
) -> Result<Vec<ServerMessageSummary>> {
    let mut session = login(account, password)?;
    session.select(mailbox)?;
    let mut uids = session
        .uid_search("1:*")?
        .iter()
        .copied()
        .collect::<Vec<_>>();
    uids.sort_unstable();
    if uids.len() > limit {
        uids = uids[uids.len() - limit..].to_vec();
    }
    if uids.is_empty() {
        session.logout()?;
        return Ok(Vec::new());
    }
    let seq_set = uids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let fetches = session.uid_fetch(seq_set, "(RFC822.HEADER FLAGS UID INTERNALDATE)")?;
    let mut items = Vec::new();
    for fetch in fetches.iter() {
        let header = fetch.header().or_else(|| fetch.body());
        let Some(header_bytes) = header else {
            continue;
        };
        let Some(uid) = fetch.uid else {
            continue;
        };
        let (headers, _) = parse_headers(header_bytes)?;
        let message_id = headers
            .get_first_value("Message-ID")
            .unwrap_or_else(|| format!("<uid-{uid}>"));
        let subject = headers.get_first_value("Subject").unwrap_or_default();
        let sender = headers
            .get_first_value("From")
            .unwrap_or_else(|| "Unbekannter Absender".to_string());
        let date = headers.get_first_value("Date").unwrap_or_default();
        let flags = fetch
            .flags()
            .iter()
            .map(|flag| format!("{flag:?}"))
            .collect::<Vec<_>>();
        let seen = fetch
            .flags()
            .iter()
            .any(|flag| matches!(flag, imap::types::Flag::Seen));
        items.push(ServerMessageSummary {
            uid,
            message_id,
            subject,
            sender,
            date,
            flags,
            seen,
        });
    }
    items.sort_by_key(|item| item.uid);
    session.logout()?;
    Ok(items)
}

pub fn force_full_inbox_sync(
    account: &Account,
    password: &str,
    folder: &SyncFolder,
    limit: usize,
) -> Result<Vec<IncomingEmail>> {
    let mut session = login(account, password)?;
    session.select(&folder.remote_name)?;
    let mut uids = session
        .uid_search("1:*")?
        .iter()
        .copied()
        .collect::<Vec<_>>();
    uids.sort_unstable();
    if uids.len() > limit {
        uids = uids[uids.len() - limit..].to_vec();
    }
    if uids.is_empty() {
        session.logout()?;
        return Ok(Vec::new());
    }
    let seq_set = uids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let fetches = session.uid_fetch(seq_set, "(RFC822.HEADER FLAGS UID)")?;
    let mut messages = Vec::new();
    for fetch in fetches.iter() {
        let header = fetch.header().or_else(|| fetch.body());
        let Some(header_bytes) = header else {
            continue;
        };
        let Some(uid) = fetch.uid else {
            continue;
        };
        let seen = fetch
            .flags()
            .iter()
            .any(|flag| matches!(flag, imap::types::Flag::Seen));
        if let Ok(message) = parse_message_header_only(uid, header_bytes, seen) {
            messages.push(message);
        }
    }
    session.logout()?;
    Ok(messages)
}

struct PlainAuthenticator {
    payload: Vec<u8>,
}

impl Authenticator for PlainAuthenticator {
    type Response = Vec<u8>;
    fn process(&self, _challenge: &[u8]) -> Self::Response {
        self.payload.clone()
    }
}

fn plain_auth_payload(username: &str, password: &str) -> Vec<u8> {
    let mut payload = Vec::with_capacity(2 + username.len() + password.len());
    payload.push(0);
    payload.extend_from_slice(username.as_bytes());
    payload.push(0);
    payload.extend_from_slice(password.as_bytes());
    payload
}

fn connect_client(account: &Account) -> Result<Client<TlsStream<TcpStream>>> {
    let tls = TlsConnector::builder().build()?;
    imap::connect(
        (account.imap_host.as_str(), account.imap_port),
        account.imap_host.as_str(),
        &tls,
    )
    .map_err(|error| {
        anyhow!(
            "Verbindung zu {}:{} fehlgeschlagen: {error}",
            account.imap_host,
            account.imap_port
        )
    })
}

fn authenticate_plain(
    client: Client<TlsStream<TcpStream>>,
    username: &str,
    password: &str,
) -> Result<Session<TlsStream<TcpStream>>, (imap::error::Error, Client<TlsStream<TcpStream>>)> {
    let auth = PlainAuthenticator {
        payload: plain_auth_payload(username, password),
    };
    client.authenticate("PLAIN", &auth)
}

fn login_with_user(
    account: &Account,
    username: &str,
    password: &str,
) -> Result<Session<TlsStream<TcpStream>>> {
    let client = connect_client(account)?;
    match client.login(username, password) {
        Ok(session) => Ok(session),
        Err((login_error, client)) => match authenticate_plain(client, username, password) {
            Ok(session) => Ok(session),
            Err((plain_error, _)) => {
                Err(anyhow!("LOGIN: {login_error}; AUTH PLAIN: {plain_error}"))
            }
        },
    }
}

fn login(account: &Account, password: &str) -> Result<Session<TlsStream<TcpStream>>> {
    if !account.imap_secure {
        return Err(anyhow!("TLS ist für IMAP erforderlich"));
    }
    if password.is_empty() {
        return Err(anyhow!("IMAP-Passwort fehlt"));
    }

    let username = account.username.trim();
    let email = account.email.trim();
    let mut users: Vec<&str> = Vec::new();
    if !username.is_empty() {
        users.push(username);
    }
    if !email.is_empty() && !username.eq_ignore_ascii_case(email) {
        users.push(email);
    }
    if users.is_empty() {
        return Err(anyhow!("IMAP-Benutzername fehlt"));
    }

    let mut errors = Vec::new();
    for user in users {
        match login_with_user(account, user, password) {
            Ok(session) => return Ok(session),
            Err(error) => errors.push(format!("'{user}': {error}")),
        }
    }

    Err(anyhow!(
        "IMAP Login an {}:{} fehlgeschlagen: {}",
        account.imap_host,
        account.imap_port,
        errors.join(" / ")
    ))
}

fn sync_folder(
    session: &mut Session<TlsStream<TcpStream>>,
    folder: &SyncFolder,
) -> Result<Vec<IncomingEmail>> {
    #[cfg(debug_assertions)]
    eprintln!(
        "perf: sync-start folder_id={} role={} last_uid={:?}",
        folder.id, folder.role, folder.last_uid
    );
    if let Err(error) = session.select(&folder.remote_name) {
        if is_nonexistent_mailbox_error(&error.to_string()) {
            return Ok(Vec::new());
        }
        return Err(error.into());
    }
    let uid_query = match folder.last_uid {
        Some(last_uid) if last_uid > 0 => format!("UID {}:*", last_uid + 1),
        _ => "UID 1:*".to_string(),
    };
    let found = session.uid_search(uid_query)?;
    let mut uids = found.iter().copied().collect::<Vec<_>>();
    uids.sort_unstable();
    #[cfg(debug_assertions)]
    eprintln!(
        "perf: sync-uids folder_id={} found={}",
        folder.id,
        uids.len()
    );

    if uids.is_empty() && folder.last_uid.unwrap_or(0) > 0 {
        let all_found = session.uid_search("1:*")?;
        let mut all_uids = all_found.iter().copied().collect::<Vec<_>>();
        all_uids.sort_unstable();
        let highest_on_server = all_uids.last().copied().unwrap_or(0);
        if highest_on_server > 0 && highest_on_server < folder.last_uid.unwrap_or(0) {
            #[cfg(debug_assertions)]
            eprintln!(
                "perf: sync-uid-regression folder_id={} last_uid={} highest_on_server={} fallback=recent-window",
                folder.id,
                folder.last_uid.unwrap_or(0),
                highest_on_server
            );
            uids = all_uids
                .into_iter()
                .rev()
                .take(INITIAL_SYNC_LIMIT)
                .collect::<Vec<_>>();
            uids.sort_unstable();
        }
    }

    if folder.last_uid.is_none() || folder.last_uid == Some(0) {
        uids = uids
            .into_iter()
            .rev()
            .take(INITIAL_SYNC_LIMIT)
            .collect::<Vec<_>>();
        uids.sort_unstable();
    }

    if uids.is_empty() {
        return Ok(Vec::new());
    }

    let seq_set = uids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let fetches = session.uid_fetch(seq_set, "(RFC822.HEADER FLAGS UID)")?;
    let mut messages = Vec::new();

    for fetch in fetches.iter() {
        let header = fetch.header().or_else(|| fetch.body());
        let Some(header_bytes) = header else {
            continue;
        };
        let Some(uid) = fetch.uid else {
            continue;
        };
        let flags = fetch.flags();
        let seen = flags
            .iter()
            .any(|flag| matches!(flag, imap::types::Flag::Seen));
        #[cfg(debug_assertions)]
        eprintln!(
            "perf: sync-flag folder_id={} uid={} seen={}",
            folder.id, uid, seen
        );
        match parse_message_header_only(uid, header_bytes, seen) {
            Ok(message) => messages.push(message),
            Err(error) => {
                #[cfg(not(debug_assertions))]
                let _ = &error;
                #[cfg(debug_assertions)]
                eprintln!(
                    "perf: sync-fallback folder_id={} uid={} parse_error={}",
                    folder.id, uid, error
                );
                messages.push(fallback_header_message(uid, seen));
            }
        }
    }

    #[cfg(debug_assertions)]
    eprintln!(
        "perf: sync-save folder_id={} messages={}",
        folder.id,
        messages.len()
    );
    Ok(messages)
}

fn sync_folder_older(
    session: &mut Session<TlsStream<TcpStream>>,
    folder: &SyncFolder,
    before_uid: Option<u32>,
    limit: usize,
) -> Result<Vec<IncomingEmail>> {
    let Some(before_uid) = before_uid else {
        return Ok(Vec::new());
    };
    if before_uid <= 1 {
        return Ok(Vec::new());
    }

    if let Err(error) = session.select(&folder.remote_name) {
        if is_nonexistent_mailbox_error(&error.to_string()) {
            return Ok(Vec::new());
        }
        return Err(error.into());
    }
    let found = session.uid_search(format!("UID 1:{}", before_uid - 1))?;
    let mut uids = found.iter().copied().collect::<Vec<_>>();
    uids.sort_unstable();
    if uids.len() > limit {
        uids = uids[uids.len() - limit..].to_vec();
    }
    if uids.is_empty() {
        return Ok(Vec::new());
    }

    let seq_set = uids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let fetches = session.uid_fetch(seq_set, "(RFC822.HEADER FLAGS UID)")?;
    let mut messages = Vec::new();
    for fetch in fetches.iter() {
        let header = fetch.header().or_else(|| fetch.body());
        let Some(header_bytes) = header else {
            continue;
        };
        let Some(uid) = fetch.uid else {
            continue;
        };
        let is_read = fetch
            .flags()
            .iter()
            .any(|flag| matches!(flag, imap::types::Flag::Seen));
        match parse_message_header_only(uid, header_bytes, is_read) {
            Ok(message) => messages.push(message),
            Err(error) => {
                #[cfg(not(debug_assertions))]
                let _ = &error;
                #[cfg(debug_assertions)]
                eprintln!(
                    "perf: sync-older-fallback folder_id={} uid={} parse_error={}",
                    folder.id, uid, error
                );
                messages.push(fallback_header_message(uid, is_read));
            }
        }
    }
    Ok(messages)
}

fn parse_message_header_only(
    uid: u32,
    header_bytes: &[u8],
    is_read: bool,
) -> Result<IncomingEmail> {
    let (headers, _) = parse_headers(header_bytes)?;
    let message_id = headers
        .get_first_value("Message-ID")
        .unwrap_or_else(|| format!("<local-{}>", uuid::Uuid::new_v4()));
    let sender = headers
        .get_first_value("From")
        .unwrap_or_else(|| "Unbekannter Absender".to_string());
    let recipients = headers.get_first_value("To").unwrap_or_default();
    let cc = headers.get_first_value("Cc");
    let subject = headers.get_first_value("Subject").unwrap_or_default();
    let received_at = headers
        .get_first_value("Date")
        .and_then(|date| mailparse::dateparse(&date).ok())
        .and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0))
        .map(|date| date.to_rfc3339())
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    Ok(IncomingEmail {
        uid,
        message_id,
        sender,
        recipients,
        cc,
        subject,
        preview: String::new(),
        body_text: None,
        body_html: None,
        received_at,
        is_read,
        attachments: Vec::new(),
    })
}

fn fallback_header_message(uid: u32, is_read: bool) -> IncomingEmail {
    IncomingEmail {
        uid,
        message_id: format!("<uid-{uid}@sync-fallback>"),
        sender: "Unbekannter Absender".to_string(),
        recipients: String::new(),
        cc: None,
        subject: "(Kopfzeile konnte nicht gelesen werden)".to_string(),
        preview: String::new(),
        body_text: None,
        body_html: None,
        received_at: Utc::now().to_rfc3339(),
        is_read,
        attachments: Vec::new(),
    }
}

fn parse_message(uid: u32, parsed: &ParsedMail<'_>, is_read: bool) -> Result<IncomingEmail> {
    let headers = &parsed.headers;
    let message_id = headers
        .get_first_value("Message-ID")
        .unwrap_or_else(|| format!("<local-{}>", uuid::Uuid::new_v4()));
    let sender = headers
        .get_first_value("From")
        .unwrap_or_else(|| "Unbekannter Absender".to_string());
    let recipients = headers.get_first_value("To").unwrap_or_default();
    let cc = headers.get_first_value("Cc");
    let subject = headers.get_first_value("Subject").unwrap_or_default();
    let received_at = headers
        .get_first_value("Date")
        .and_then(|date| mailparse::dateparse(&date).ok())
        .and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0))
        .map(|date| date.to_rfc3339())
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    let mut body_text = None;
    let mut body_html = None;
    let mut attachments = Vec::new();
    collect_parts(parsed, &mut body_text, &mut body_html, &mut attachments)?;
    let fallback_text = body_html
        .as_ref()
        .map(|html| html2text::from_read(html.as_bytes(), 100))
        .unwrap_or_default();
    let preview_source = body_text.as_deref().unwrap_or(&fallback_text);
    let preview = preview_source
        .split_whitespace()
        .take(28)
        .collect::<Vec<_>>()
        .join(" ");

    Ok(IncomingEmail {
        uid,
        message_id,
        sender,
        recipients,
        cc,
        subject,
        preview,
        body_text,
        body_html,
        received_at,
        is_read,
        attachments,
    })
}

fn collect_parts(
    part: &ParsedMail<'_>,
    body_text: &mut Option<String>,
    body_html: &mut Option<String>,
    attachments: &mut Vec<Attachment>,
) -> Result<()> {
    if part.subparts.is_empty() {
        let content_type = part.ctype.mimetype.to_ascii_lowercase();
        let disposition = part.get_content_disposition();
        let file_name = disposition
            .params
            .get("filename")
            .or_else(|| part.ctype.params.get("name"))
            .cloned();

        if let Some(file_name) = file_name {
            let bytes = part.get_body_raw()?;
            attachments.push(Attachment {
                id: 0,
                email_id: None,
                draft_id: None,
                file_name,
                content_type,
                size: bytes.len() as i64,
                path: None,
                bytes,
            });
        } else if content_type == "text/plain" && body_text.is_none() {
            *body_text = Some(part.get_body()?);
        } else if content_type == "text/html" && body_html.is_none() {
            *body_html = Some(part.get_body()?);
        }
        return Ok(());
    }

    for subpart in &part.subparts {
        collect_parts(subpart, body_text, body_html, attachments)?;
    }
    Ok(())
}

#[allow(dead_code)]
fn role_for_remote_name(remote_name: &str) -> String {
    let value = remote_name.to_lowercase();
    if value == "inbox" {
        "inbox"
    } else if value.contains("sent") || value.contains("gesendet") {
        "sent"
    } else if value.contains("draft") || value.contains("entw") {
        "drafts"
    } else if value.contains("spam") || value.contains("junk") {
        "spam"
    } else if value.contains("promotion")
        || value.contains("werbung")
        || value.contains("category/promotions")
    {
        "promotions"
    } else if value.contains("trash") || value.contains("papierkorb") || value.contains("bin") {
        "trash"
    } else {
        "custom"
    }
    .to_string()
}

fn infer_mailbox_role(remote_name: &str, attributes: &[String]) -> String {
    let attr = attributes
        .iter()
        .map(|value| value.to_ascii_lowercase())
        .collect::<Vec<_>>();
    if attr.iter().any(|value| value.contains("inbox")) || remote_name.eq_ignore_ascii_case("inbox")
    {
        return "inbox".to_string();
    }
    if attr.iter().any(|value| value.contains("sent")) {
        return "sent".to_string();
    }
    if attr.iter().any(|value| value.contains("draft")) {
        return "drafts".to_string();
    }
    if attr
        .iter()
        .any(|value| value.contains("junk") || value.contains("spam"))
    {
        return "spam".to_string();
    }
    if attr.iter().any(|value| value.contains("trash")) {
        return "trash".to_string();
    }
    role_for_remote_name(remote_name)
}

#[allow(dead_code)]
fn display_name_for_role(role: &str) -> &str {
    match role {
        "inbox" => "Inbox",
        "sent" => "Sent",
        "drafts" => "Drafts",
        "spam" => "Spam",
        "promotions" => "Werbung",
        "trash" => "Trash",
        _ => "Folder",
    }
}

fn is_nonexistent_mailbox_error(message: &str) -> bool {
    let value = message.to_ascii_lowercase();
    value.contains("nonexistent") || value.contains("mailbox doesn't exist")
}
