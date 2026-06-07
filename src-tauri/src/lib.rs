mod database;
mod mail;
mod notifications;
mod security;
mod sync;

use aes_gcm_siv::aead::{Aead, KeyInit};
use aes_gcm_siv::{Aes256GcmSiv, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use database::{Db, MailFilters, Settings};
use mail::{
    AccountInput, Contact, ContactInput, Draft, Email, MailCounts, MailRule, MailboxInfo,
    RuleInput, ServerMessageSummary, SmartCategory, SyncReport, Tag,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use sync::{QueueBackoffPolicy, QueueStatusSnapshot, SyncHealthSnapshot, SyncSupervisor};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, State, WindowEvent,
};
use url::Url;

static ACCOUNT_SYNC_JOBS: OnceLock<Mutex<HashSet<i64>>> = OnceLock::new();

struct BackgroundSyncState {
    last_inbox_poll: Mutex<Instant>,
}

const BACKGROUND_INBOX_POLL_SECS: u64 = 30;

fn show_main_window(app: &AppHandle) -> AppResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Message("Hauptfenster nicht gefunden".to_string()))?;
    let _ = window.unminimize();
    window
        .show()
        .map_err(|error| AppError::Message(error.to_string()))?;
    window
        .set_focus()
        .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(())
}

fn sync_all_inboxes_now(app: &AppHandle) {
    let db = app.state::<Db>();
    let Ok(accounts) = db.accounts() else {
        return;
    };
    for account in accounts {
        spawn_sync_inbox(app.clone(), account.id);
    }
}

fn background_inbox_poll_interval(settings: &Settings) -> Duration {
    let configured_secs = settings.sync_interval_minutes.max(1) as u64 * 60;
    Duration::from_secs(configured_secs.min(BACKGROUND_INBOX_POLL_SECS))
}

fn move_to_background(app: &AppHandle) -> AppResult<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    window
        .hide()
        .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(())
}

fn should_run_in_background(app: &AppHandle) -> bool {
    app.try_state::<Db>()
        .and_then(|db| db.settings().ok())
        .map(|settings| settings.run_in_background)
        .unwrap_or(true)
}

fn map_tauri_error(error: tauri::Error) -> AppError {
    AppError::Message(error.to_string())
}

fn setup_system_tray(app: &AppHandle) -> AppResult<()> {
    let show_item = MenuItem::with_id(app, "tray-show", "LunaMail öffnen", true, None::<&str>)
        .map_err(map_tauri_error)?;
    let sync_item = MenuItem::with_id(
        app,
        "tray-sync",
        "Jetzt synchronisieren",
        true,
        None::<&str>,
    )
    .map_err(map_tauri_error)?;
    let quit_item = MenuItem::with_id(app, "tray-quit", "Beenden", true, None::<&str>)
        .map_err(map_tauri_error)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &sync_item,
            &PredefinedMenuItem::separator(app).map_err(map_tauri_error)?,
            &quit_item,
        ],
    )
    .map_err(map_tauri_error)?;

    let icon = load_tray_icon(app)?;

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("LunaMail")
        .title("LunaMail")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => {
                let _ = show_main_window(app);
            }
            "tray-sync" => sync_all_inboxes_now(app),
            "tray-quit" => force_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = show_main_window(&app);
            }
        })
        .build(app)
        .map_err(map_tauri_error)?;

    Ok(())
}

fn force_quit(app: &AppHandle) {
    notifications::clear_dock_badge();
    app.exit(0);
}

fn load_tray_icon(app: &AppHandle) -> AppResult<tauri::image::Image<'static>> {
    if let Some(icon) = app.default_window_icon() {
        let rgba = icon.rgba().to_vec();
        return Ok(tauri::image::Image::new_owned(
            rgba,
            icon.width(),
            icon.height(),
        ));
    }
    load_png_icon(include_bytes!("../icons/icon.png"))
        .ok_or_else(|| AppError::Message("App-Icon nicht gefunden".to_string()))
}

fn load_png_icon(data: &[u8]) -> Option<tauri::image::Image<'static>> {
    use std::io::Cursor;
    let decoder = png::Decoder::new(Cursor::new(data));
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()?];
    let info = reader.next_frame(&mut buf).ok()?;
    Some(tauri::image::Image::new_owned(
        buf,
        info.width as u32,
        info.height as u32,
    ))
}

fn attach_window_lifecycle(app: &AppHandle) -> AppResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Message("Hauptfenster nicht gefunden".to_string()))?;
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if should_run_in_background(&app_handle) {
                api.prevent_close();
                let _ = move_to_background(&app_handle);
                sync_all_inboxes_now(&app_handle);
            }
        }
    });
    Ok(())
}

fn account_sync_jobs() -> &'static Mutex<HashSet<i64>> {
    ACCOUNT_SYNC_JOBS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn try_begin_account_sync(account_id: i64) -> bool {
    let Ok(mut jobs) = account_sync_jobs().lock() else {
        return false;
    };
    if jobs.contains(&account_id) {
        return false;
    }
    jobs.insert(account_id);
    true
}

fn finish_account_sync(account_id: i64) {
    if let Ok(mut jobs) = account_sync_jobs().lock() {
        jobs.remove(&account_id);
    }
}

fn pending_sync_report(account_id: i64) -> SyncReport {
    SyncReport {
        account_id,
        folders_synced: 0,
        messages_synced: 0,
        requested_messages: 0,
        errors: Vec::new(),
        new_messages: Vec::new(),
    }
}

fn spawn_sync_inbox(app: AppHandle, account_id: i64) {
    if !try_begin_account_sync(account_id) {
        return;
    }
    std::thread::Builder::new()
        .name(format!("sync-inbox-{account_id}"))
        .spawn(move || {
            let result = sync_inbox_inner(&app, account_id);
            finish_account_sync(account_id);
            match result {
                Ok(report) => {
                    notifications::notify_new_messages(&app, &report);
                    notifications::update_dock_badge(&app);
                    let _ = app.emit("sync-account-complete", report);
                }
                Err(error) => {
                    let _ = app.emit(
                        "sync-account-error",
                        serde_json::json!({
                            "accountId": account_id,
                            "message": error.to_string(),
                        }),
                    );
                }
            }
        })
        .ok();
}

fn spawn_sync_all_messages(app: AppHandle, account_id: Option<i64>) {
    let job_key = account_id.unwrap_or(-1);
    if !try_begin_account_sync(job_key) {
        return;
    }
    std::thread::Builder::new()
        .name(format!("sync-all-{job_key}"))
        .spawn(move || {
            let result = sync_all_messages_inner(&app, account_id);
            finish_account_sync(job_key);
            match result {
                Ok(report) => {
                    notifications::notify_new_messages(&app, &report);
                    notifications::update_dock_badge(&app);
                    let _ = app.emit("sync-account-complete", report);
                }
                Err(error) => {
                    let _ = app.emit(
                        "sync-account-error",
                        serde_json::json!({
                            "accountId": job_key,
                            "message": error.to_string(),
                        }),
                    );
                }
            }
        })
        .ok();
}

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

type AppResult<T> = Result<T, AppError>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountTestResult {
    imap_ok: bool,
    smtp_ok: bool,
    imap_error: Option<String>,
    smtp_error: Option<String>,
}

#[derive(Default)]
struct SyncDebugState(Mutex<HashMap<i64, SyncDebugEntry>>);

#[derive(Clone, Default)]
struct SyncDebugEntry {
    last_sync_at: Option<String>,
    last_sync_error: Option<String>,
    idle_active: bool,
    polling_active: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnoseAccountResult {
    account_id: i64,
    email: String,
    imap_host: String,
    imap_port: u16,
    imap_secure: bool,
    login_status: String,
    inbox_remote_name: Option<String>,
    last_known_uid: Option<u32>,
    highest_uid_on_server: Option<u32>,
    local_inbox_mails: i64,
    last_sync_at: Option<String>,
    last_sync_error: Option<String>,
    idle_active: bool,
    polling_active: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnoseInboxResult {
    account_id: i64,
    inbox_remote_name: Option<String>,
    last_known_uid: Option<u32>,
    highest_uid_on_server: Option<u32>,
    mailboxes: Vec<MailboxInfo>,
    local_inbox_mails: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupPayload {
    version: String,
    exported_at: String,
    accounts: Vec<BackupAccount>,
    settings: Settings,
    rules: Vec<MailRule>,
    contacts: Vec<Contact>,
    tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupAccount {
    display_name: String,
    email: String,
    provider: String,
    imap_host: String,
    imap_port: u16,
    imap_secure: bool,
    smtp_host: String,
    smtp_port: u16,
    smtp_secure: bool,
    username: String,
    is_default: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IcsPreview {
    title: Option<String>,
    start: Option<String>,
    end: Option<String>,
    location: Option<String>,
    organizer: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntegrityDiagnostics {
    duplicate_message_ids: i64,
    orphan_attachments: i64,
    account_folder_mismatches: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthStatus {
    sync: SyncHealthSnapshot,
    queue: QueueStatusSnapshot,
    database_size_bytes: i64,
    total_mails: i64,
    total_attachments: i64,
    keyring_available: bool,
    integrity: IntegrityDiagnostics,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentPreview {
    attachment_id: i64,
    file_name: String,
    content_type: String,
    data_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueueMovePayload {
    email_id: i64,
    account_id: i64,
    source_folder_id: i64,
    target_folder_id: i64,
    uid: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueueReadPayload {
    email_id: i64,
    account_id: i64,
    folder_id: i64,
    uid: Option<u32>,
    read: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueueSendPayload {
    draft: Draft,
}

#[derive(Default)]
struct SecretsCache(Mutex<HashMap<String, String>>);

#[derive(Default, Deserialize, Serialize)]
struct PersistentSecretFile {
    entries: HashMap<String, String>,
}

struct PersistentSecrets {
    path: PathBuf,
    entries: Mutex<HashMap<String, String>>,
}

impl SecretsCache {
    fn key(account_id: i64, protocol: &str, email: &str) -> String {
        format!("{account_id}:{protocol}:{}", Self::normalize_email(email))
    }

    fn fallback_key(protocol: &str, email: &str) -> String {
        format!("{protocol}:{}", Self::normalize_email(email))
    }

    fn normalize_email(email: &str) -> String {
        email.trim().to_lowercase()
    }

    fn store(&self, account_id: i64, protocol: &str, email: &str, password: &str) {
        if let Ok(mut cache) = self.0.lock() {
            cache.insert(Self::key(account_id, protocol, email), password.to_string());
            cache.insert(Self::fallback_key(protocol, email), password.to_string());
        }
    }

    fn get(&self, account_id: i64, protocol: &str, email: &str) -> Option<String> {
        self.0.lock().ok().and_then(|cache| {
            cache
                .get(&Self::key(account_id, protocol, email))
                .or_else(|| cache.get(&Self::fallback_key(protocol, email)))
                .cloned()
        })
    }

    fn remove(&self, account_id: i64, protocol: &str, email: &str) {
        if let Ok(mut cache) = self.0.lock() {
            cache.remove(&Self::key(account_id, protocol, email));
            cache.remove(&Self::fallback_key(protocol, email));
        }
    }
}

impl PersistentSecrets {
    fn open(path: PathBuf) -> Self {
        let entries = match fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<PersistentSecretFile>(&content) {
                Ok(file) => file.entries,
                Err(_) => {
                    let mut backup = path.clone();
                    backup.set_extension("corrupt");
                    let _ = fs::rename(&path, backup);
                    HashMap::new()
                }
            },
            Err(_) => HashMap::new(),
        };
        Self {
            path,
            entries: Mutex::new(entries),
        }
    }

    fn key(account_id: i64, protocol: &str, email: &str) -> String {
        format!("{account_id}:{protocol}:{}", email.trim().to_lowercase())
    }

    fn fallback_key(protocol: &str, email: &str) -> String {
        format!("{protocol}:{}", email.trim().to_lowercase())
    }

    fn cipher_key() -> [u8; 32] {
        let mut hash = Sha256::new();
        #[cfg(target_os = "linux")]
        hash.update(
            fs::read_to_string("/etc/machine-id")
                .unwrap_or_default()
                .trim()
                .as_bytes(),
        );
        #[cfg(target_os = "windows")]
        {
            for name in ["COMPUTERNAME", "USERNAME", "USERDOMAIN", "USERPROFILE"] {
                hash.update(std::env::var(name).unwrap_or_default().as_bytes());
                hash.update([0]);
            }
        }
        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        hash.update(std::env::var("HOME").unwrap_or_default().as_bytes());
        hash.update(b"lunamail-local-secret-v1");
        let digest = hash.finalize();
        let mut key = [0_u8; 32];
        key.copy_from_slice(&digest[..32]);
        key
    }

    fn encrypt(password: &str) -> Option<String> {
        let cipher = Aes256GcmSiv::new_from_slice(&Self::cipher_key()).ok()?;
        let mut nonce_bytes = [0_u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), password.as_bytes())
            .ok()?;
        let mut payload = nonce_bytes.to_vec();
        payload.extend_from_slice(&ciphertext);
        Some(BASE64.encode(payload))
    }

    fn decrypt(payload: &str) -> Option<String> {
        let decoded = BASE64.decode(payload).ok()?;
        if decoded.len() <= 12 {
            return None;
        }
        let (nonce_bytes, ciphertext) = decoded.split_at(12);
        let cipher = Aes256GcmSiv::new_from_slice(&Self::cipher_key()).ok()?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .ok()?;
        String::from_utf8(plaintext).ok()
    }

    fn store(&self, account_id: i64, protocol: &str, email: &str, password: &str) {
        if password.is_empty() {
            return;
        }
        let Some(encrypted) = Self::encrypt(password) else {
            return;
        };
        if let Ok(mut entries) = self.entries.lock() {
            entries.insert(Self::key(account_id, protocol, email), encrypted.clone());
            entries.insert(Self::fallback_key(protocol, email), encrypted);
            self.persist_locked(&entries);
        }
    }

    fn get(&self, account_id: i64, protocol: &str, email: &str) -> Option<String> {
        let entries = self.entries.lock().ok()?;
        let value = entries
            .get(&Self::key(account_id, protocol, email))
            .or_else(|| entries.get(&Self::fallback_key(protocol, email)))?;
        Self::decrypt(value)
    }

    fn remove(&self, account_id: i64, protocol: &str, email: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.remove(&Self::key(account_id, protocol, email));
            entries.remove(&Self::fallback_key(protocol, email));
            self.persist_locked(&entries);
        }
    }

    fn remove_account(&self, account_id: i64, email: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            for protocol in ["imap", "smtp"] {
                entries.remove(&Self::key(account_id, protocol, email));
                entries.remove(&Self::fallback_key(protocol, email));
            }
            self.persist_locked(&entries);
        }
    }

    fn persist_locked(&self, entries: &HashMap<String, String>) {
        let payload = PersistentSecretFile {
            entries: entries.clone(),
        };
        let Ok(serialized) = serde_json::to_string(&payload) else {
            return;
        };
        let mut tmp_path = self.path.clone();
        tmp_path.set_extension("tmp");
        if fs::write(&tmp_path, serialized).is_err() {
            return;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp_path, fs::Permissions::from_mode(0o600));
        }
        let _ = fs::rename(&tmp_path, &self.path);
    }
}

fn get_cached_password(
    cache: &SecretsCache,
    persistent: &PersistentSecrets,
    allow_local_fallback: bool,
    account_id: i64,
    protocol: &str,
    email: &str,
) -> anyhow::Result<String> {
    if let Some(password) = cache.get(account_id, protocol, email) {
        return Ok(password);
    }

    if let Ok(password) = security::get_primary_password(account_id, protocol, email) {
        cache.store(account_id, protocol, email, &password);
        if allow_local_fallback {
            persistent.store(account_id, protocol, email, &password);
        }
        return Ok(password);
    }

    if allow_local_fallback {
        if let Some(password) = persistent.get(account_id, protocol, email) {
            cache.store(account_id, protocol, email, &password);
            let _ = security::store_password(account_id, protocol, email, &password);
            return Ok(password);
        }
    }

    if protocol == "smtp" {
        if let Ok(imap_password) = get_cached_password(
            cache,
            persistent,
            allow_local_fallback,
            account_id,
            "imap",
            email,
        ) {
            cache.store(account_id, "smtp", email, &imap_password);
            return Ok(imap_password);
        }
    }

    if let Ok(password) = security::get_legacy_password(account_id, protocol, email) {
        cache.store(account_id, protocol, email, &password);
        if allow_local_fallback {
            persistent.store(account_id, protocol, email, &password);
        }
        return Ok(password);
    }

    Err(anyhow::anyhow!(
        "Für {email} ist kein {protocol}-Passwort verfügbar. Öffne Einstellungen → Konten, bearbeite den Account und speichere IMAP-Passwort + Benutzername erneut."
    ))
}

fn format_imap_auth_hint(email: &str, error: &str) -> String {
    if error.contains("AUTHENTICATIONFAILED") || error.contains("Authentication failed") {
        format!(
            "{email}: IMAP-Anmeldung fehlgeschlagen (Benutzername oder Passwort falsch). \
             Öffne Einstellungen → Konten → Konto bearbeiten, trage Benutzername (meist die volle E-Mail), \
             IMAP-Host (z. B. hypnotic.one, Port 993) und das aktuelle Passwort erneut ein, dann Speichern. \
             Technische Details: {error}"
        )
    } else {
        format!("{email}: {error}")
    }
}

fn set_debug_sync_state(
    debug: &SyncDebugState,
    account_id: i64,
    error: Option<String>,
    polling_active: bool,
) {
    if let Ok(mut state) = debug.0.lock() {
        let entry = state.entry(account_id).or_default();
        entry.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
        entry.last_sync_error = error;
        entry.polling_active = polling_active;
    }
}

fn allow_local_secret_fallback(db: &Db) -> bool {
    db.settings()
        .map(|settings| settings.allow_local_secret_fallback)
        .unwrap_or(true)
}

#[tauri::command]
fn set_polling_active(
    debug: State<SyncDebugState>,
    account_id: i64,
    active: bool,
) -> AppResult<()> {
    if let Ok(mut state) = debug.0.lock() {
        let entry = state.entry(account_id).or_default();
        entry.polling_active = active;
    }
    Ok(())
}

#[tauri::command]
fn get_accounts(db: State<Db>) -> AppResult<Vec<mail::Account>> {
    db.accounts().map_err(Into::into)
}

#[tauri::command]
fn save_account(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    account: AccountInput,
) -> AppResult<mail::Account> {
    let saved = db.save_account(&account)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let password_changed = !account.password.is_empty();
    let imap_password = if password_changed {
        account.password.clone()
    } else {
        get_cached_password(
            &cache,
            &persistent,
            allow_local_fallback,
            saved.id,
            "imap",
            &account.email,
        )?
    };

    if password_changed {
        cache.remove(saved.id, "imap", &account.email);
        cache.remove(saved.id, "smtp", &account.email);
        persistent.remove(saved.id, "imap", &account.email);
        persistent.remove(saved.id, "smtp", &account.email);
        security::delete_password(saved.id, "imap", &account.email);
        security::delete_password(saved.id, "smtp", &account.email);
    }

    if let Err(error) = security::store_password(saved.id, "imap", &account.email, &imap_password) {
        eprintln!(
            "warn: keyring write failed for imap account_id={}: {error}",
            saved.id
        );
        if !allow_local_fallback {
            return Err(AppError::Message(
                "Passwort konnte nicht im System-Keyring gespeichert werden. Aktiviere lokalen Secret-Fallback oder behebe den Keyring."
                    .to_string(),
            ));
        }
    }
    cache.store(saved.id, "imap", &account.email, &imap_password);
    if allow_local_fallback {
        persistent.store(saved.id, "imap", &account.email, &imap_password);
    }
    let smtp_password = account
        .smtp_password
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .or_else(|| {
            if password_changed {
                None
            } else {
                get_cached_password(
                    &cache,
                    &persistent,
                    allow_local_fallback,
                    saved.id,
                    "smtp",
                    &account.email,
                )
                .ok()
            }
        })
        .unwrap_or_else(|| imap_password.clone());
    if let Err(error) = security::store_password(saved.id, "smtp", &account.email, &smtp_password) {
        eprintln!(
            "warn: keyring write failed for smtp account_id={}: {error}",
            saved.id
        );
        if !allow_local_fallback {
            return Err(AppError::Message(
                "SMTP-Passwort konnte nicht im System-Keyring gespeichert werden. Aktiviere lokalen Secret-Fallback oder behebe den Keyring."
                    .to_string(),
            ));
        }
    }
    cache.store(saved.id, "smtp", &account.email, &smtp_password);
    if allow_local_fallback {
        persistent.store(saved.id, "smtp", &account.email, &smtp_password);
    }

    if let Err(error) = mail::imap::test_connection(&saved, &imap_password) {
        return Err(AppError::Message(format_imap_auth_hint(
            &saved.email,
            &error.to_string(),
        )));
    }

    db.ensure_default_folders(saved.id)?;
    // Keep account-save fast and responsive; remote folders are discovered during sync.
    Ok(saved)
}

#[tauri::command]
async fn get_emails(
    app: AppHandle,
    account_id: Option<i64>,
    folder_id: Option<i64>,
    query: Option<String>,
    view: Option<String>,
    filters: Option<MailFilters>,
) -> AppResult<Vec<Email>> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Db>();
        db.emails(
            account_id,
            folder_id,
            query.as_deref(),
            view.as_deref(),
            filters.as_ref(),
        )
        .map_err(AppError::from)
    })
    .await
    .map_err(|error| AppError::Message(format!("Mails konnten nicht geladen werden: {error}")))?
}

#[tauri::command]
async fn get_folders(app: AppHandle, account_id: Option<i64>) -> AppResult<Vec<mail::Folder>> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Db>();
        db.folders(account_id).map_err(AppError::from)
    })
    .await
    .map_err(|error| AppError::Message(format!("Ordner konnten nicht geladen werden: {error}")))?
}

#[tauri::command]
fn get_email(app: AppHandle, id: i64) -> AppResult<Email> {
    let db = app.state::<Db>();
    db.email(id).map_err(Into::into)
}

#[tauri::command]
fn hydrate_email(app: AppHandle, id: i64) -> AppResult<Email> {
    let worker = app.clone();
    std::thread::Builder::new()
        .name(format!("hydrate-email-{id}"))
        .spawn(move || {
            let _ = hydrate_email_inner(&worker, id);
        })
        .ok();
    let db = app.state::<Db>();
    db.email(id).map_err(Into::into)
}

fn hydrate_email_inner(app: &AppHandle, id: i64) -> AppResult<()> {
    let db = app.state::<Db>();
    let cache = app.state::<SecretsCache>();
    let persistent = app.state::<PersistentSecrets>();
    let mut email = db.email(id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    if !email.body_text.as_deref().unwrap_or("").is_empty()
        || !email.body_html.as_deref().unwrap_or("").is_empty()
    {
        let _ = app.emit("email-hydrated", email);
        return Ok(());
    }
    let (account_id, folder_id, uid) = db.email_meta(id)?;
    let Some(uid) = uid else {
        let _ = app.emit("email-hydrated", email);
        return Ok(());
    };
    let account = db.account(account_id)?;
    let folder = db.folder(folder_id)?;
    let password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    )?;
    if let Ok(full_message) =
        mail::imap::fetch_message_detail(&account, &password, &folder.remote_name, uid)
    {
        db.hydrate_email_content(id, &full_message)?;
        email = db.email(id)?;
    }
    let _ = app.emit("email-hydrated", email);
    Ok(())
}

fn sync_inbox_inner(app: &AppHandle, account_id: i64) -> AppResult<SyncReport> {
    let db = app.state::<Db>();
    let cache = app.state::<SecretsCache>();
    let persistent = app.state::<PersistentSecrets>();
    let debug = app.state::<SyncDebugState>();
    let supervisor = app.state::<SyncSupervisor>();
    let _account_guard = supervisor.acquire_account(account_id);
    let account = db.account(account_id)?;
    let started = std::time::Instant::now();
    supervisor.update_runtime(account.id, |status| {
        status.polling_active = true;
        status.polling_interval_seconds = 30;
    });
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    )?;
    let inbox_folder = db
        .sync_folders(account.id)?
        .into_iter()
        .find(|folder| folder.role == "inbox")
        .ok_or_else(|| AppError::Message("Inbox-Ordner nicht gefunden".to_string()))?;
    let uid_validity =
        mail::imap::fetch_uid_validity(&account, &password, &inbox_folder.remote_name)
            .ok()
            .flatten();
    let _ = db.update_folder_uid_validity(inbox_folder.id, uid_validity);
    #[cfg(debug_assertions)]
    eprintln!(
        "perf: sync-inbox-start account_id={} folder_id={} last_uid={:?}",
        account.id, inbox_folder.id, inbox_folder.last_uid
    );
    let (report, synced) = sync_account_with_retry(&account, &password, &[inbox_folder])?;
    let mut new_messages = Vec::new();
    for (folder, messages) in synced {
        let inserted = db.upsert_emails(&folder, messages)?;
        db.apply_rules_for_new_messages(account.id, &inserted)?;
        new_messages.extend(inserted);
    }
    #[cfg(debug_assertions)]
    eprintln!(
        "perf: sync-inbox-done account_id={} messages={}",
        account.id, report.messages_synced
    );
    set_debug_sync_state(&debug, account.id, None, true);
    supervisor.update_runtime(account.id, |status| {
        status.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
        status.last_sync_error = None;
        status.last_sync_duration_ms = Some(started.elapsed().as_millis() as i64);
        status.consecutive_failures = 0;
        status.idle_active = true;
    });
    update_queue_metrics(&db, &supervisor, account.id);
    let mut enriched_report = report;
    enriched_report.new_messages = new_messages;
    Ok(enriched_report)
}

#[tauri::command]
fn sync_inbox(app: AppHandle, account_id: i64) -> AppResult<SyncReport> {
    spawn_sync_inbox(app, account_id);
    Ok(pending_sync_report(account_id))
}

fn sync_all_messages_inner(app: &AppHandle, account_id: Option<i64>) -> AppResult<SyncReport> {
    let db = app.state::<Db>();
    let cache = app.state::<SecretsCache>();
    let persistent = app.state::<PersistentSecrets>();
    let debug = app.state::<SyncDebugState>();
    let supervisor = app.state::<SyncSupervisor>();
    #[cfg(debug_assertions)]
    let sync_started = Instant::now();
    let accounts = match account_id {
        Some(id) => vec![db.account(id)?],
        None => db.accounts()?,
    };
    let mut merged = SyncReport {
        account_id: account_id.unwrap_or(0),
        folders_synced: 0,
        messages_synced: 0,
        requested_messages: 0,
        errors: Vec::new(),
        new_messages: Vec::new(),
    };

    let allow_local_fallback = allow_local_secret_fallback(&db);
    for account in accounts {
        let _account_guard = supervisor.acquire_account(account.id);
        #[cfg(debug_assertions)]
        let account_started = Instant::now();
        let started = std::time::Instant::now();
        db.ensure_default_folders(account.id)?;
        let password = match get_cached_password(
            &cache,
            &persistent,
            allow_local_fallback,
            account.id,
            "imap",
            &account.email,
        ) {
            Ok(password) => password,
            Err(error) => {
                let error_text = format_imap_auth_hint(&account.email, &error.to_string());
                merged.errors.push(error_text.clone());
                set_debug_sync_state(&debug, account.id, Some(error_text), false);
                continue;
            }
        };
        if let Ok(remote_folders) = mail::imap::discover_folders(&account, &password) {
            let mut remote_names = HashSet::new();
            for (name, remote_name, role) in remote_folders {
                remote_names.insert(remote_name.clone());
                db.upsert_remote_folder(account.id, &name, &remote_name, &role)?;
            }
            db.sync_folder_remote_presence(account.id, &remote_names)?;
        }
        let folders = db.sync_folders(account.id)?;
        for folder in &folders {
            let uid_validity =
                mail::imap::fetch_uid_validity(&account, &password, &folder.remote_name)
                    .ok()
                    .flatten();
            let _ = db.update_folder_uid_validity(folder.id, uid_validity);
        }
        let (report, synced) = match sync_account_with_retry(&account, &password, &folders) {
            Ok(value) => value,
            Err(error) => {
                let error_text = format_imap_auth_hint(
                    &account.email,
                    &format!("Synchronisation fehlgeschlagen: {error}"),
                );
                merged.errors.push(error_text.clone());
                set_debug_sync_state(&debug, account.id, Some(error_text), false);
                supervisor.update_runtime(account.id, |status| {
                    status.last_sync_error = Some(error.to_string());
                    status.consecutive_failures += 1;
                    status.last_sync_duration_ms = Some(started.elapsed().as_millis() as i64);
                    status.idle_active = false;
                });
                update_queue_metrics(&db, &supervisor, account.id);
                continue;
            }
        };
        for (folder, messages) in synced {
            let inserted = db.upsert_emails(&folder, messages)?;
            db.apply_rules_for_new_messages(account.id, &inserted)?;
            merged.new_messages.extend(inserted);
        }
        merged.folders_synced += report.folders_synced;
        merged.messages_synced += report.messages_synced;
        merged.requested_messages += report.requested_messages;
        merged.errors.extend(report.errors);
        set_debug_sync_state(&debug, account.id, None, false);
        supervisor.update_runtime(account.id, |status| {
            status.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
            status.last_sync_error = None;
            status.consecutive_failures = 0;
            status.polling_active = false;
            status.idle_active = true;
            status.last_sync_duration_ms = Some(started.elapsed().as_millis() as i64);
        });
        update_queue_metrics(&db, &supervisor, account.id);
        #[cfg(debug_assertions)]
        eprintln!(
            "perf: sync account_id={} folders={} messages={} requested={} ms={}",
            account.id,
            report.folders_synced,
            report.messages_synced,
            report.requested_messages,
            account_started.elapsed().as_millis()
        );
    }
    #[cfg(debug_assertions)]
    eprintln!(
        "perf: sync total accounts={} folders={} messages={} requested={} ms={}",
        if account_id.is_some() {
            1
        } else {
            db.accounts()?.len()
        },
        merged.folders_synced,
        merged.messages_synced,
        merged.requested_messages,
        sync_started.elapsed().as_millis()
    );
    Ok(merged)
}

#[tauri::command]
fn sync_all_messages(app: AppHandle, account_id: Option<i64>) -> AppResult<SyncReport> {
    spawn_sync_all_messages(app.clone(), account_id);
    Ok(pending_sync_report(account_id.unwrap_or(-1)))
}

fn run_background_sync_cycle(app: &AppHandle) -> AppResult<()> {
    let db = app.state::<Db>();
    let cache = app.state::<SecretsCache>();
    let persistent = app.state::<PersistentSecrets>();
    let supervisor = app.state::<SyncSupervisor>();
    for account in db.accounts()? {
        let _ = process_account_action_queue(&db, &cache, &persistent, &supervisor, account.id);
    }

    let settings = db.settings()?;
    let poll_interval = background_inbox_poll_interval(&settings);
    let background = app.state::<BackgroundSyncState>();
    let mut last_poll = background
        .last_inbox_poll
        .lock()
        .map_err(|_| anyhow::anyhow!("Hintergrund-Sync ist gesperrt"))?;
    if last_poll.elapsed() < poll_interval {
        return Ok(());
    }
    *last_poll = Instant::now();
    drop(last_poll);

    for account in db.accounts()? {
        spawn_sync_inbox(app.clone(), account.id);
    }
    Ok(())
}

fn spawn_background_sync_worker(app: &AppHandle) {
    let handle = app.clone();
    std::thread::Builder::new()
        .name("lunamail-background".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(2));
            if let Err(error) = run_background_sync_cycle(&handle) {
                eprintln!("background sync cycle failed: {error}");
            }
        })
        .ok();
}

#[tauri::command]
fn test_desktop_notification(app: AppHandle) -> AppResult<String> {
    notifications::test_desktop_notification(&app)
}

#[tauri::command]
fn show_main_window_cmd(app: AppHandle) -> AppResult<()> {
    show_main_window(&app)
}

#[tauri::command]
fn request_close(app: AppHandle) -> AppResult<()> {
    if should_run_in_background(&app) {
        move_to_background(&app)?;
        sync_all_inboxes_now(&app);
    } else {
        force_quit(&app);
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    force_quit(&app);
}

#[tauri::command]
fn sync_all_inboxes(app: AppHandle) -> AppResult<()> {
    sync_all_inboxes_now(&app);
    Ok(())
}

#[tauri::command]
fn test_account(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    account_id: i64,
) -> AppResult<AccountTestResult> {
    let account = db.account(account_id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let imap_password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    )?;
    let smtp_password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "smtp",
        &account.email,
    )
    .unwrap_or_else(|_| imap_password.clone());

    let imap_result = mail::imap::test_connection(&account, &imap_password);
    let smtp_result = mail::smtp::test_connection(&account, &smtp_password);
    Ok(AccountTestResult {
        imap_ok: imap_result.is_ok(),
        smtp_ok: smtp_result.is_ok(),
        imap_error: imap_result.err().map(|error| error.to_string()),
        smtp_error: smtp_result.err().map(|error| error.to_string()),
    })
}

#[tauri::command]
fn diagnose_account(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    debug: State<SyncDebugState>,
    account_id: i64,
) -> AppResult<DiagnoseAccountResult> {
    let account = db.account(account_id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let inbox = db.inbox_sync_folder(account.id).ok();
    let local_inbox_mails = db.inbox_local_mail_count(account.id).unwrap_or(0);
    let last_known_uid = inbox.as_ref().and_then(|folder| folder.last_uid);
    let mut login_status = "ok".to_string();
    let mut highest_uid_on_server = None;
    if let Ok(password) = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    ) {
        if let Some(inbox_folder) = &inbox {
            match mail::imap::highest_uid(&account, &password, &inbox_folder.remote_name) {
                Ok(value) => highest_uid_on_server = value,
                Err(error) => {
                    login_status = format!("imap-error: {error}");
                }
            }
        }
    } else {
        login_status = "password-missing".to_string();
    }

    let debug_entry = debug
        .0
        .lock()
        .ok()
        .and_then(|state| state.get(&account.id).cloned())
        .unwrap_or_default();

    Ok(DiagnoseAccountResult {
        account_id: account.id,
        email: account.email,
        imap_host: account.imap_host,
        imap_port: account.imap_port,
        imap_secure: account.imap_secure,
        login_status,
        inbox_remote_name: inbox.as_ref().map(|folder| folder.remote_name.clone()),
        last_known_uid,
        highest_uid_on_server,
        local_inbox_mails,
        last_sync_at: debug_entry
            .last_sync_at
            .or_else(|| db.account_last_sync_at(account.id).ok().flatten()),
        last_sync_error: debug_entry.last_sync_error,
        idle_active: debug_entry.idle_active,
        polling_active: debug_entry.polling_active,
    })
}

#[tauri::command]
fn diagnose_inbox(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    account_id: i64,
) -> AppResult<DiagnoseInboxResult> {
    let account = db.account(account_id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let inbox = db.inbox_sync_folder(account.id).ok();
    let local_inbox_mails = db.inbox_local_mail_count(account.id).unwrap_or(0);
    let mut highest_uid_on_server = None;
    let mut mailboxes = Vec::new();
    if let Ok(password) = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    ) {
        if let Ok(items) = mail::imap::list_mailboxes(&account, &password) {
            mailboxes = items;
        }
        let remote_name = inbox
            .as_ref()
            .map(|folder| folder.remote_name.clone())
            .or_else(|| mail::imap::detect_inbox_remote_name(&mailboxes));
        if let Some(remote_name) = remote_name {
            highest_uid_on_server = mail::imap::highest_uid(&account, &password, &remote_name)
                .ok()
                .flatten();
        }
    }
    Ok(DiagnoseInboxResult {
        account_id,
        inbox_remote_name: inbox.as_ref().map(|folder| folder.remote_name.clone()),
        last_known_uid: inbox.as_ref().and_then(|folder| folder.last_uid),
        highest_uid_on_server,
        mailboxes,
        local_inbox_mails,
    })
}

#[tauri::command]
fn fetch_latest_server_messages(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    account_id: i64,
    limit: Option<usize>,
) -> AppResult<Vec<ServerMessageSummary>> {
    let account = db.account(account_id)?;
    let inbox = db.inbox_sync_folder(account.id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    )?;
    mail::imap::fetch_latest_server_messages(
        &account,
        &password,
        &inbox.remote_name,
        limit.unwrap_or(10),
    )
    .map_err(Into::into)
}

#[tauri::command]
fn force_full_inbox_sync(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    debug: State<SyncDebugState>,
    supervisor: State<SyncSupervisor>,
    account_id: i64,
    limit: Option<usize>,
) -> AppResult<SyncReport> {
    let _account_guard = supervisor.acquire_account(account_id);
    let account = db.account(account_id)?;
    let inbox = db.inbox_sync_folder(account.id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    )?;
    #[cfg(debug_assertions)]
    eprintln!(
        "perf: force-full-sync account_id={} folder_id={} last_uid={:?}",
        account.id, inbox.id, inbox.last_uid
    );
    let messages =
        mail::imap::force_full_inbox_sync(&account, &password, &inbox, limit.unwrap_or(50))?;
    let count = messages.len();
    let mut new_messages = Vec::new();
    if !messages.is_empty() {
        let inserted = db.upsert_emails(&inbox, messages)?;
        db.apply_rules_for_new_messages(account.id, &inserted)?;
        new_messages = inserted;
    }
    let report = SyncReport {
        account_id: account.id,
        folders_synced: 1,
        messages_synced: count,
        requested_messages: count,
        errors: Vec::new(),
        new_messages,
    };
    set_debug_sync_state(&debug, account.id, None, false);
    Ok(report)
}

#[tauri::command]
fn force_incremental_sync(app: AppHandle, account_id: i64) -> AppResult<SyncReport> {
    sync_inbox_inner(&app, account_id)
}

#[tauri::command]
fn load_older_messages(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    supervisor: State<SyncSupervisor>,
    account_id: i64,
    folder_id: Option<i64>,
) -> AppResult<SyncReport> {
    let _account_guard = supervisor.acquire_account(account_id);
    let account = db.account(account_id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "imap",
        &account.email,
    )?;
    let folders = match folder_id {
        Some(folder_id) => vec![db.sync_folder(folder_id)?],
        None => db.sync_folders(account.id)?,
    };
    let mut merged = SyncReport {
        account_id,
        folders_synced: 0,
        messages_synced: 0,
        requested_messages: 0,
        errors: Vec::new(),
        new_messages: Vec::new(),
    };

    for folder in folders {
        match mail::imap::sync_older_messages(
            &account,
            &password,
            &folder,
            db.oldest_uid_in_folder(folder.id)?,
            250,
        ) {
            Ok(messages) => {
                let message_count = messages.len();
                if !messages.is_empty() {
                    let inserted = db.upsert_emails(&folder, messages)?;
                    db.apply_rules_for_new_messages(account.id, &inserted)?;
                    merged.new_messages.extend(inserted);
                }
                merged.folders_synced += 1;
                merged.messages_synced += message_count;
                merged.requested_messages += message_count;
            }
            Err(error) => merged.errors.push(format!(
                "{}: ältere Nachrichten fehlgeschlagen: {error}",
                folder.name
            )),
        }
    }
    Ok(merged)
}

#[tauri::command]
fn delete_account(
    app: AppHandle,
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    account_id: i64,
) -> AppResult<()> {
    if let Ok(account) = db.account(account_id) {
        security::delete_password(account.id, "imap", &account.email);
        security::delete_password(account.id, "smtp", &account.email);
        persistent.remove_account(account.id, &account.email);
        cache.remove(account.id, "imap", &account.email);
        cache.remove(account.id, "smtp", &account.email);
    }
    db.delete_account(account_id)?;
    notifications::update_dock_badge(&app);
    Ok(())
}

#[tauri::command]
fn mark_email_read(app: AppHandle, id: i64, read: bool) -> AppResult<()> {
    std::thread::Builder::new()
        .name(format!("mark-read-{id}"))
        .spawn(move || {
            let _ = mark_email_read_inner(&app, id, read);
        })
        .ok();
    Ok(())
}

fn mark_email_read_inner(app: &AppHandle, id: i64, read: bool) -> AppResult<()> {
    let db = app.state::<Db>();
    let supervisor = app.state::<SyncSupervisor>();
    db.mark_email_read(id, read)?;
    let (account_id, folder_id, uid) = db.email_meta(id)?;
    if let Some(uid) = uid {
        let payload = serde_json::to_string(&QueueReadPayload {
            email_id: id,
            account_id,
            folder_id,
            uid: Some(uid),
            read,
        })
        .map_err(anyhow::Error::from)?;
        let key = format!("mark_read:{id}:{read}");
        db.enqueue_sync_action(account_id, "mark_read", &key, &payload, 10)?;
    }
    update_queue_metrics(&db, &supervisor, account_id);
    notifications::update_dock_badge(app);
    Ok(())
}

#[tauri::command]
fn delete_email(
    app: AppHandle,
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    supervisor: State<SyncSupervisor>,
    id: i64,
) -> AppResult<()> {
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let (account_id, source_folder_id, uid) = db.email_meta(id)?;
    let account = db.account(account_id)?;
    let source_folder = db.folder(source_folder_id)?;
    let trash_folder = db.folder_by_role(account.id, "trash")?;

    if source_folder.id == trash_folder.id {
        if let Some(uid) = uid {
            let password = get_cached_password(
                &cache,
                &persistent,
                allow_local_fallback,
                account.id,
                "imap",
                &account.email,
            )?;
            mail::imap::delete_message(&account, &password, &source_folder.remote_name, uid)?;
        }
        db.delete_email_permanently(id)?;
        update_queue_metrics(&db, &supervisor, account.id);
        notifications::update_dock_badge(&app);
        return Ok(());
    }

    if let Some(uid) = uid {
        let password = get_cached_password(
            &cache,
            &persistent,
            allow_local_fallback,
            account.id,
            "imap",
            &account.email,
        )?;
        if let Err(error) = mail::imap::move_message(
            &account,
            &password,
            &source_folder.remote_name,
            &trash_folder.remote_name,
            uid,
        ) {
            let payload = serde_json::to_string(&QueueMovePayload {
                email_id: id,
                account_id,
                source_folder_id,
                target_folder_id: trash_folder.id,
                uid: Some(uid),
            })
            .map_err(anyhow::Error::from)?;
            let key = format!("delete:{id}:{}", trash_folder.id);
            db.enqueue_sync_action(account.id, "delete", &key, &payload, 20)?;
            supervisor.update_runtime(account.id, |status| {
                status.last_sync_error = Some(error.to_string());
            });
        }
    }

    db.move_email_to_folder(id, trash_folder.id)?;
    db.mark_email_read(id, true)?;
    update_queue_metrics(&db, &supervisor, account.id);
    notifications::update_dock_badge(&app);
    Ok(())
}

#[tauri::command]
fn delete_emails_permanently(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    supervisor: State<SyncSupervisor>,
    ids: Vec<i64>,
) -> AppResult<usize> {
    if ids.is_empty() {
        return Ok(0);
    }

    let metas = db.email_metas(&ids)?;
    let mut groups: HashMap<(i64, i64), Vec<(i64, Option<u32>)>> = HashMap::new();
    for (email_id, account_id, folder_id, uid) in metas {
        groups
            .entry((account_id, folder_id))
            .or_default()
            .push((email_id, uid));
    }

    let allow_local_fallback = allow_local_secret_fallback(&db);
    let mut deleted_ids = Vec::new();
    for ((account_id, folder_id), messages) in groups {
        let account = db.account(account_id)?;
        let folder = db.folder(folder_id)?;
        if folder.role != "trash" {
            return Err(AppError::Message(
                "Endgültiges Löschen ist nur im Papierkorb möglich.".to_string(),
            ));
        }

        let uids = messages
            .iter()
            .filter_map(|(_, uid)| *uid)
            .collect::<Vec<_>>();
        if !uids.is_empty() {
            let password = get_cached_password(
                &cache,
                &persistent,
                allow_local_fallback,
                account.id,
                "imap",
                &account.email,
            )?;
            mail::imap::delete_messages(&account, &password, &folder.remote_name, &uids)?;
        }
        deleted_ids.extend(messages.into_iter().map(|(email_id, _)| email_id));
        update_queue_metrics(&db, &supervisor, account_id);
    }

    db.delete_emails_permanently(&deleted_ids)?;
    Ok(deleted_ids.len())
}

#[tauri::command]
fn move_email(
    app: AppHandle,
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    supervisor: State<SyncSupervisor>,
    id: i64,
    target_folder_id: i64,
) -> AppResult<()> {
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let (account_id, source_folder_id, uid) = db.email_meta(id)?;
    let account = db.account(account_id)?;
    let source_folder = db.folder(source_folder_id)?;
    let target_folder = db.folder(target_folder_id)?;

    if target_folder.account_id != account.id {
        return Err(AppError::Message(
            "Zielordner gehört nicht zum ausgewählten Konto.".to_string(),
        ));
    }

    if source_folder.id == target_folder.id {
        return Ok(());
    }

    if let Some(uid) = uid {
        let password = get_cached_password(
            &cache,
            &persistent,
            allow_local_fallback,
            account.id,
            "imap",
            &account.email,
        )?;
        if let Err(error) = mail::imap::move_message(
            &account,
            &password,
            &source_folder.remote_name,
            &target_folder.remote_name,
            uid,
        ) {
            let payload = serde_json::to_string(&QueueMovePayload {
                email_id: id,
                account_id,
                source_folder_id,
                target_folder_id,
                uid: Some(uid),
            })
            .map_err(anyhow::Error::from)?;
            let key = format!("move:{id}:{target_folder_id}");
            db.enqueue_sync_action(account.id, "move", &key, &payload, 15)?;
            supervisor.update_runtime(account.id, |status| {
                status.last_sync_error = Some(error.to_string());
            });
        }
    }

    db.move_email_to_folder(id, target_folder.id)?;
    update_queue_metrics(&db, &supervisor, account.id);
    notifications::update_dock_badge(&app);
    Ok(())
}

#[tauri::command]
fn toggle_favorite(db: State<Db>, supervisor: State<SyncSupervisor>, id: i64) -> AppResult<bool> {
    let value = db.toggle_favorite(id)?;
    let (account_id, _, _) = db.email_meta(id)?;
    let payload = serde_json::json!({ "emailId": id, "favorite": value });
    db.enqueue_sync_action(
        account_id,
        "favorite",
        &format!("favorite:{id}:{value}"),
        &payload.to_string(),
        5,
    )?;
    update_queue_metrics(&db, &supervisor, account_id);
    Ok(value)
}

#[tauri::command]
fn toggle_important(db: State<Db>, supervisor: State<SyncSupervisor>, id: i64) -> AppResult<bool> {
    let value = db.toggle_important(id)?;
    let (account_id, _, _) = db.email_meta(id)?;
    let payload = serde_json::json!({ "emailId": id, "important": value });
    db.enqueue_sync_action(
        account_id,
        "important",
        &format!("important:{id}:{value}"),
        &payload.to_string(),
        5,
    )?;
    update_queue_metrics(&db, &supervisor, account_id);
    Ok(value)
}

#[tauri::command]
#[allow(non_snake_case)]
async fn get_mail_counts(app: AppHandle, accountId: Option<i64>) -> AppResult<MailCounts> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Db>();
        db.mail_counts(accountId).map_err(AppError::from)
    })
    .await
    .map_err(|error| AppError::Message(format!("Zähler konnten nicht geladen werden: {error}")))?
}

#[tauri::command]
fn open_external_link(url: String) -> AppResult<()> {
    let safe_url = validate_external_url(&url)?;
    opener::open(safe_url).map_err(anyhow::Error::from)?;
    Ok(())
}

fn validate_external_url(raw_url: &str) -> AppResult<String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message("Ungültiger Link: leer".into()));
    }

    let parsed = Url::parse(trimmed)
        .map_err(|_| AppError::Message("Ungültiger Link: nicht parsebar".into()))?;

    match parsed.scheme() {
        "https" => {
            if parsed.host_str().is_none() {
                return Err(AppError::Message(
                    "Unsicherer Link blockiert: HTTPS-Link ohne Host".into(),
                ));
            }
        }
        "mailto" => {
            let recipient = parsed.path().trim();
            if recipient.is_empty() || !recipient.contains('@') {
                return Err(AppError::Message("Ungültiger mailto-Link blockiert".into()));
            }
        }
        "tel" => {
            let phone = parsed.path().trim();
            if phone.is_empty()
                || !phone
                    .chars()
                    .all(|c| c.is_ascii_digit() || "+-() .".contains(c))
            {
                return Err(AppError::Message(
                    "Ungültiger Telefon-Link blockiert".into(),
                ));
            }
        }
        _ => {
            return Err(AppError::Message(format!(
                "Unsicheres Link-Schema blockiert: {}",
                parsed.scheme()
            )));
        }
    }

    Ok(trimmed.to_string())
}

#[tauri::command]
fn download_attachment(
    db: State<Db>,
    attachment_id: i64,
    destination_path: String,
) -> AppResult<()> {
    let (file_name, source_path, bytes) = db.attachment_payload(attachment_id)?;
    if !bytes.is_empty() {
        std::fs::write(&destination_path, bytes).map_err(anyhow::Error::from)?;
        return Ok(());
    }
    if let Some(source_path) = source_path {
        if Path::new(&source_path).exists() {
            std::fs::copy(&source_path, &destination_path).map_err(anyhow::Error::from)?;
            return Ok(());
        }
    }
    Err(AppError::Message(format!(
        "Anhang '{file_name}' konnte nicht heruntergeladen werden: keine Daten gefunden"
    )))
}

#[tauri::command]
fn get_file_size(path: String) -> AppResult<u64> {
    let metadata = std::fs::metadata(path).map_err(anyhow::Error::from)?;
    Ok(metadata.len())
}

#[tauri::command]
fn send_mail(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    supervisor: State<SyncSupervisor>,
    draft: Draft,
) -> AppResult<()> {
    let account = db.account(draft.account_id)?;
    let allow_local_fallback = allow_local_secret_fallback(&db);
    let password = get_cached_password(
        &cache,
        &persistent,
        allow_local_fallback,
        account.id,
        "smtp",
        &account.email,
    )?;
    if let Err(error) = mail::smtp::send(&account, &password, &draft) {
        let payload = serde_json::to_string(&QueueSendPayload {
            draft: draft.clone(),
        })
        .map_err(anyhow::Error::from)?;
        let key = format!(
            "send:{}:{}",
            draft.account_id,
            draft
                .id
                .map(|value| value.to_string())
                .unwrap_or_else(|| format!(
                    "{}:{}",
                    draft.to.trim().to_lowercase(),
                    draft.subject.trim().to_lowercase()
                ))
        );
        db.enqueue_sync_action(account.id, "send", &key, &payload, 25)?;
        supervisor.update_runtime(account.id, |status| {
            status.last_sync_error = Some(error.to_string());
        });
        update_queue_metrics(&db, &supervisor, account.id);
        return Ok(());
    }
    db.store_sent(&account, &draft)?;
    for (name, email) in collect_contact_candidates(&draft) {
        let _ = db.touch_contact(&name, &email);
    }
    if let Some(id) = draft.id {
        let _ = db.delete_draft(id);
    }
    update_queue_metrics(&db, &supervisor, account.id);
    Ok(())
}

#[tauri::command]
fn save_draft(db: State<Db>, draft: Draft) -> AppResult<i64> {
    db.save_draft(&draft).map_err(Into::into)
}

#[tauri::command]
fn get_drafts(db: State<Db>, account_id: Option<i64>) -> AppResult<Vec<Draft>> {
    db.drafts(account_id).map_err(Into::into)
}

#[tauri::command]
fn delete_draft(db: State<Db>, id: i64) -> AppResult<()> {
    db.delete_draft(id).map_err(Into::into)
}

#[tauri::command]
fn get_tags(db: State<Db>) -> AppResult<Vec<Tag>> {
    db.tags().map_err(Into::into)
}

#[tauri::command]
fn create_tag(db: State<Db>, name: String, color: String) -> AppResult<Tag> {
    db.create_tag(&name, &color).map_err(Into::into)
}

#[tauri::command]
fn delete_tag(db: State<Db>, id: i64) -> AppResult<()> {
    db.delete_tag(id).map_err(Into::into)
}

#[tauri::command]
fn set_email_tags(db: State<Db>, email_id: i64, tag_ids: Vec<i64>) -> AppResult<()> {
    db.set_email_tags(email_id, &tag_ids).map_err(Into::into)
}

#[tauri::command]
fn get_rules(db: State<Db>, account_id: Option<i64>) -> AppResult<Vec<MailRule>> {
    db.rules(account_id).map_err(Into::into)
}

#[tauri::command]
fn save_rule(db: State<Db>, rule: RuleInput) -> AppResult<MailRule> {
    db.save_rule(&rule).map_err(Into::into)
}

#[tauri::command]
fn delete_rule(db: State<Db>, id: i64) -> AppResult<()> {
    db.delete_rule(id).map_err(Into::into)
}

#[tauri::command]
fn get_contacts(db: State<Db>, query: Option<String>) -> AppResult<Vec<Contact>> {
    db.contacts(query.as_deref()).map_err(Into::into)
}

#[tauri::command]
fn save_contact(db: State<Db>, contact: ContactInput) -> AppResult<Contact> {
    db.save_contact(&contact).map_err(Into::into)
}

#[tauri::command]
fn delete_contact(db: State<Db>, id: i64) -> AppResult<()> {
    db.delete_contact(id).map_err(Into::into)
}

#[tauri::command]
fn export_backup(db: State<Db>) -> AppResult<BackupPayload> {
    let accounts = db
        .accounts()?
        .into_iter()
        .map(|account| BackupAccount {
            display_name: account.display_name,
            email: account.email,
            provider: account.provider,
            imap_host: account.imap_host,
            imap_port: account.imap_port,
            imap_secure: account.imap_secure,
            smtp_host: account.smtp_host,
            smtp_port: account.smtp_port,
            smtp_secure: account.smtp_secure,
            username: account.username,
            is_default: account.is_default,
        })
        .collect::<Vec<_>>();
    Ok(BackupPayload {
        version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        accounts,
        settings: db.settings()?,
        rules: db.rules(None)?,
        contacts: db.contacts(None)?,
        tags: db.tags()?,
    })
}

#[tauri::command]
fn export_backup_to_file(db: State<Db>, path: String) -> AppResult<()> {
    let payload = export_backup(db)?;
    let json = serde_json::to_string_pretty(&payload).map_err(anyhow::Error::from)?;
    std::fs::write(path, json).map_err(anyhow::Error::from)?;
    Ok(())
}

#[tauri::command]
fn import_backup(db: State<Db>, backup: BackupPayload) -> AppResult<()> {
    for account in backup.accounts {
        let saved = db.upsert_account_metadata(&AccountInput {
            display_name: account.display_name,
            email: account.email,
            provider: Some(account.provider),
            imap_host: account.imap_host,
            imap_port: account.imap_port,
            imap_secure: Some(account.imap_secure),
            smtp_host: account.smtp_host,
            smtp_port: account.smtp_port,
            smtp_secure: Some(account.smtp_secure),
            username: Some(account.username),
            use_tls: Some(true),
            is_default: Some(account.is_default),
            password: String::new(),
            smtp_password: None,
        })?;
        let _ = db.ensure_default_folders(saved.id);
    }
    db.save_settings(&backup.settings)?;
    for tag in backup.tags {
        let _ = db.create_tag(&tag.name, &tag.color);
    }
    for contact in backup.contacts {
        let _ = db.save_contact(&ContactInput {
            id: None,
            name: contact.name,
            email: contact.email,
            is_favorite: Some(contact.is_favorite),
        });
    }
    for rule in backup.rules {
        let _ = db.save_rule(&RuleInput {
            id: None,
            account_id: rule.account_id,
            name: rule.name,
            enabled: Some(rule.enabled),
            priority: Some(rule.priority),
            field: rule.field,
            operator: rule.operator,
            value: rule.value,
            action_type: rule.action_type,
            action_value: rule.action_value,
        });
    }
    Ok(())
}

#[tauri::command]
fn import_backup_from_file(db: State<Db>, path: String) -> AppResult<()> {
    let text = std::fs::read_to_string(path).map_err(anyhow::Error::from)?;
    let backup: BackupPayload = serde_json::from_str(&text).map_err(anyhow::Error::from)?;
    import_backup(db, backup)
}

#[tauri::command]
fn preview_ics_attachment(db: State<Db>, attachment_id: i64) -> AppResult<Option<IcsPreview>> {
    let (_, _, bytes) = db.attachment_payload(attachment_id)?;
    if bytes.is_empty() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&bytes);
    if !text.contains("BEGIN:VCALENDAR") {
        return Ok(None);
    }
    Ok(Some(parse_ics_preview(&text)))
}

#[tauri::command]
fn get_database_size(db: State<Db>) -> AppResult<i64> {
    db.database_size_bytes().map_err(Into::into)
}

#[tauri::command]
fn search_emails(db: State<Db>, query: String) -> AppResult<Vec<Email>> {
    db.emails(None, None, Some(&query), None, None)
        .map_err(Into::into)
}

#[tauri::command]
fn get_settings(db: State<Db>) -> AppResult<Settings> {
    db.settings().map_err(Into::into)
}

#[tauri::command]
fn save_settings(db: State<Db>, settings: Settings) -> AppResult<()> {
    db.save_settings(&settings).map_err(Into::into)
}

fn update_queue_metrics(db: &Db, supervisor: &SyncSupervisor, account_id: i64) {
    if let Ok((pending, failed, in_flight)) = db.queue_status(Some(account_id)) {
        supervisor.update_runtime(account_id, |status| {
            status.queue_pending = pending;
            status.queue_failed = failed;
            status.queue_in_flight = in_flight;
        });
    }
}

fn process_account_action_queue(
    db: &Db,
    cache: &SecretsCache,
    persistent: &PersistentSecrets,
    supervisor: &SyncSupervisor,
    account_id: i64,
) -> AppResult<usize> {
    let policy = QueueBackoffPolicy::default();
    let mut processed = 0_usize;
    let items = db.pending_sync_actions(account_id, 50)?;
    for (action_id, action_type, payload_json, attempt_count) in items {
        db.mark_sync_action_in_flight(action_id)?;
        let result: AppResult<()> = match action_type.as_str() {
            "move" | "delete" => {
                let payload: QueueMovePayload =
                    serde_json::from_str(&payload_json).map_err(anyhow::Error::from)?;
                let account = db.account(payload.account_id)?;
                let source_folder = db.folder(payload.source_folder_id)?;
                let target_folder = db.folder(payload.target_folder_id)?;
                if let Some(uid) = payload.uid {
                    let password = get_cached_password(
                        cache,
                        persistent,
                        allow_local_secret_fallback(db),
                        account.id,
                        "imap",
                        &account.email,
                    )?;
                    mail::imap::move_message(
                        &account,
                        &password,
                        &source_folder.remote_name,
                        &target_folder.remote_name,
                        uid,
                    )?;
                }
                db.move_email_to_folder(payload.email_id, payload.target_folder_id)?;
                Ok(())
            }
            "mark_read" => {
                let payload: QueueReadPayload =
                    serde_json::from_str(&payload_json).map_err(anyhow::Error::from)?;
                let account = db.account(payload.account_id)?;
                let folder = db.folder(payload.folder_id)?;
                if let Some(uid) = payload.uid {
                    let password = get_cached_password(
                        cache,
                        persistent,
                        allow_local_secret_fallback(db),
                        account.id,
                        "imap",
                        &account.email,
                    )?;
                    mail::imap::set_seen(
                        &account,
                        &password,
                        &folder.remote_name,
                        uid,
                        payload.read,
                    )?;
                }
                db.mark_email_read(payload.email_id, payload.read)?;
                Ok(())
            }
            "send" => {
                let payload: QueueSendPayload =
                    serde_json::from_str(&payload_json).map_err(anyhow::Error::from)?;
                let account = db.account(payload.draft.account_id)?;
                let password = get_cached_password(
                    cache,
                    persistent,
                    allow_local_secret_fallback(db),
                    account.id,
                    "smtp",
                    &account.email,
                )?;
                mail::smtp::send(&account, &password, &payload.draft)?;
                db.store_sent(&account, &payload.draft)?;
                Ok(())
            }
            _ => Ok(()),
        };
        match result {
            Ok(()) => {
                db.mark_sync_action_done(action_id)?;
                processed += 1;
            }
            Err(error) => {
                let next_attempt = attempt_count + 1;
                db.mark_sync_action_failed(
                    action_id,
                    next_attempt,
                    policy.next_retry_minutes(next_attempt),
                    &error.to_string(),
                )?;
            }
        }
    }
    update_queue_metrics(db, supervisor, account_id);
    Ok(processed)
}

#[tauri::command]
fn process_sync_queue(
    db: State<Db>,
    cache: State<SecretsCache>,
    persistent: State<PersistentSecrets>,
    supervisor: State<SyncSupervisor>,
    account_id: Option<i64>,
) -> AppResult<usize> {
    let account_ids = match account_id {
        Some(id) => vec![id],
        None => db
            .accounts()?
            .into_iter()
            .map(|item| item.id)
            .collect::<Vec<_>>(),
    };
    let mut processed = 0_usize;
    for account_id in account_ids {
        processed +=
            process_account_action_queue(&db, &cache, &persistent, &supervisor, account_id)?;
    }
    Ok(processed)
}

#[tauri::command]
fn get_categories(db: State<Db>) -> AppResult<Vec<SmartCategory>> {
    db.categories().map_err(Into::into)
}

#[tauri::command]
fn run_integrity_check(db: State<Db>) -> AppResult<IntegrityDiagnostics> {
    let (duplicate_message_ids, orphan_attachments, account_folder_mismatches) =
        db.integrity_summary()?;
    Ok(IntegrityDiagnostics {
        duplicate_message_ids,
        orphan_attachments,
        account_folder_mismatches,
    })
}

#[tauri::command]
fn get_health_status(db: State<Db>, supervisor: State<SyncSupervisor>) -> AppResult<HealthStatus> {
    let (pending, failed, in_flight) = db.queue_status(None)?;
    let queue = QueueStatusSnapshot {
        pending,
        failed,
        in_flight,
    };
    let (duplicate_message_ids, orphan_attachments, account_folder_mismatches) =
        db.integrity_summary()?;
    Ok(HealthStatus {
        sync: supervisor.snapshot(),
        queue,
        database_size_bytes: db.database_size_bytes()?,
        total_mails: db.mail_total_count()?,
        total_attachments: db.attachment_total_count()?,
        keyring_available: true,
        integrity: IntegrityDiagnostics {
            duplicate_message_ids,
            orphan_attachments,
            account_folder_mismatches,
        },
    })
}

#[tauri::command]
fn get_attachment_preview(
    db: State<Db>,
    attachment_id: i64,
) -> AppResult<Option<AttachmentPreview>> {
    let (file_name, _, bytes) = db.attachment_payload(attachment_id)?;
    if bytes.is_empty() {
        return Ok(None);
    }
    let content_type = file_name
        .rsplit('.')
        .next()
        .map(|ext| ext.to_ascii_lowercase())
        .map(|ext| match ext.as_str() {
            "png" => "image/png".to_string(),
            "jpg" | "jpeg" => "image/jpeg".to_string(),
            "gif" => "image/gif".to_string(),
            "webp" => "image/webp".to_string(),
            "pdf" => "application/pdf".to_string(),
            "txt" | "log" | "md" => "text/plain".to_string(),
            _ => "application/octet-stream".to_string(),
        })
        .unwrap_or_else(|| "application/octet-stream".to_string());
    if bytes.len() > 2 * 1024 * 1024 {
        return Ok(None);
    }
    Ok(Some(AttachmentPreview {
        attachment_id,
        file_name,
        content_type,
        data_base64: BASE64.encode(bytes),
    }))
}

fn sync_account_with_retry(
    account: &mail::Account,
    password: &str,
    folders: &[mail::SyncFolder],
) -> anyhow::Result<(
    SyncReport,
    Vec<(mail::SyncFolder, Vec<mail::IncomingEmail>)>,
)> {
    let mut last_error: Option<anyhow::Error> = None;
    for attempt in 0..2 {
        match mail::imap::sync_account(account, password, folders) {
            Ok(result) => return Ok(result),
            Err(error) => {
                if attempt == 0 && is_temporary_network_error(&error.to_string()) {
                    last_error = Some(error);
                    continue;
                }
                return Err(error);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Unbekannter Synchronisationsfehler")))
}

fn is_temporary_network_error(message: &str) -> bool {
    let text = message.to_lowercase();
    text.contains("timeout")
        || text.contains("timed out")
        || text.contains("tempor")
        || text.contains("connection reset")
        || text.contains("broken pipe")
        || text.contains("network")
        || text.contains("eof")
}

fn collect_contact_candidates(draft: &Draft) -> Vec<(String, String)> {
    let mut contacts = Vec::new();
    for raw in [
        &draft.to,
        draft.cc.as_deref().unwrap_or(""),
        draft.bcc.as_deref().unwrap_or(""),
    ] {
        for token in raw.split(&[',', ';'][..]) {
            let value = token.trim();
            if value.is_empty() {
                continue;
            }
            if let (Some(start), Some(end)) = (value.find('<'), value.find('>')) {
                let name = value[..start].trim().trim_matches('"').to_string();
                let email = value[start + 1..end].trim().to_string();
                if !email.is_empty() {
                    contacts.push((name, email));
                }
                continue;
            }
            contacts.push((String::new(), value.to_string()));
        }
    }
    contacts
}

fn parse_ics_preview(ics: &str) -> IcsPreview {
    let mut title = None;
    let mut start = None;
    let mut end = None;
    let mut location = None;
    let mut organizer = None;
    for line in ics.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("SUMMARY:") {
            title = Some(trimmed.trim_start_matches("SUMMARY:").trim().to_string());
        } else if trimmed.starts_with("DTSTART") {
            start = trimmed
                .split_once(':')
                .map(|(_, value)| value.trim().to_string());
        } else if trimmed.starts_with("DTEND") {
            end = trimmed
                .split_once(':')
                .map(|(_, value)| value.trim().to_string());
        } else if trimmed.starts_with("LOCATION:") {
            location = Some(trimmed.trim_start_matches("LOCATION:").trim().to_string());
        } else if trimmed.starts_with("ORGANIZER") {
            organizer = trimmed
                .split_once(':')
                .map(|(_, value)| value.trim().to_string());
        }
    }
    IcsPreview {
        title,
        start,
        end,
        location,
        organizer,
    }
}

pub fn run() {
    notifications::init_session_env();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(data_dir.join("mail.sqlite3"))?;
            db.migrate()?;
            app.manage(db);
            app.manage(SecretsCache::default());
            app.manage(PersistentSecrets::open(data_dir.join("secrets.vault.json")));
            app.manage(SyncDebugState::default());
            app.manage(SyncSupervisor::default());
            app.manage(BackgroundSyncState {
                last_inbox_poll: Mutex::new(Instant::now() - Duration::from_secs(3600)),
            });
            notifications::update_dock_badge(app.handle());
            if let Err(error) = setup_system_tray(app.handle()) {
                eprintln!("Tray-Icon konnte nicht erstellt werden: {error}");
            }
            attach_window_lifecycle(app.handle())?;
            spawn_background_sync_worker(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_accounts,
            save_account,
            get_folders,
            get_emails,
            get_email,
            hydrate_email,
            sync_inbox,
            sync_all_messages,
            process_sync_queue,
            diagnose_account,
            diagnose_inbox,
            fetch_latest_server_messages,
            force_full_inbox_sync,
            force_incremental_sync,
            set_polling_active,
            load_older_messages,
            test_account,
            delete_account,
            mark_email_read,
            delete_email,
            delete_emails_permanently,
            move_email,
            toggle_favorite,
            toggle_important,
            get_mail_counts,
            open_external_link,
            download_attachment,
            get_file_size,
            send_mail,
            save_draft,
            get_drafts,
            delete_draft,
            get_tags,
            create_tag,
            delete_tag,
            set_email_tags,
            get_categories,
            get_rules,
            save_rule,
            delete_rule,
            get_contacts,
            save_contact,
            delete_contact,
            export_backup,
            export_backup_to_file,
            import_backup,
            import_backup_from_file,
            preview_ics_attachment,
            get_attachment_preview,
            run_integrity_check,
            get_health_status,
            get_database_size,
            search_emails,
            get_settings,
            save_settings,
            test_desktop_notification,
            show_main_window_cmd,
            request_close,
            quit_app,
            sync_all_inboxes
        ])
        .build(tauri::generate_context!())
        .expect("failed to build app")
        .run(|_, event| {
            if let RunEvent::Exit { .. } = event {
                notifications::clear_dock_badge();
            }
        });
}
