use crate::database::{Db, Settings};
use crate::mail::{NewMessageSummary, SyncReport};
use crate::AppError;
use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

static NOTIFIED_IDS: OnceLock<Mutex<HashSet<i64>>> = OnceLock::new();
static LAST_DOCK_BADGE: OnceLock<Mutex<Option<i64>>> = OnceLock::new();

fn notified_ids() -> &'static Mutex<HashSet<i64>> {
    NOTIFIED_IDS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn last_dock_badge() -> &'static Mutex<Option<i64>> {
    LAST_DOCK_BADGE.get_or_init(|| Mutex::new(None))
}

#[derive(Clone)]
struct PendingNotification {
    email_id: i64,
    title: String,
    body: String,
    play_sound: bool,
}

pub fn init_session_env() {}

pub fn notify_new_messages(app: &AppHandle, report: &SyncReport) {
    let pending = prepare_pending_notifications(app, report);
    for item in pending {
        if already_notified(item.email_id) {
            continue;
        }
        match send_desktop_notification(app, &item.title, &item.body, item.play_sound) {
            Ok(()) => mark_notified(item.email_id),
            Err(error) => diag_log(
                app,
                &format!("Desktop-Benachrichtigung fehlgeschlagen: {error}"),
            ),
        }
    }
}

pub fn test_desktop_notification(app: &AppHandle) -> Result<String, AppError> {
    send_desktop_notification(
        app,
        "LunaMail Test",
        "Wenn du das siehst, funktionieren Desktop-Benachrichtigungen.",
        true,
    )
    .map_err(AppError::Message)?;
    Ok("Testbenachrichtigung gesendet. Prüfe das Windows-Benachrichtigungscenter.".to_string())
}

pub fn update_dock_badge(app: &AppHandle) {
    let Some(db) = app.try_state::<Db>() else {
        return;
    };
    let Ok(unread) = db.unread_inbox_count() else {
        return;
    };
    let Ok(mut previous) = last_dock_badge().lock() else {
        return;
    };
    if *previous == Some(unread) {
        return;
    }
    if emit_dock_badge(unread).is_ok() {
        *previous = Some(unread);
    }
}

pub fn clear_dock_badge() {
    let _ = emit_dock_badge(0);
    if let Ok(mut previous) = last_dock_badge().lock() {
        *previous = Some(0);
    }
}

fn emit_dock_badge(unread: i64) -> Result<(), String> {
    let _ = unread;
    Ok(())
}

fn prepare_pending_notifications(app: &AppHandle, report: &SyncReport) -> Vec<PendingNotification> {
    if report.new_messages.is_empty() {
        return Vec::new();
    }
    let Some(db) = app.try_state::<Db>() else {
        diag_log(
            app,
            "Benachrichtigung übersprungen: Datenbankstatus nicht verfügbar",
        );
        return Vec::new();
    };
    let Ok(settings) = db.settings() else {
        diag_log(
            app,
            "Benachrichtigung übersprungen: Einstellungen nicht lesbar",
        );
        return Vec::new();
    };
    if !settings.notifications_enabled {
        return Vec::new();
    }

    let mut pending = Vec::new();
    for item in &report.new_messages {
        if let Some(notification) = build_pending_notification(app, &settings, item) {
            pending.push(notification);
        }
    }
    pending
}

fn build_pending_notification(
    app: &AppHandle,
    settings: &Settings,
    item: &NewMessageSummary,
) -> Option<PendingNotification> {
    if item.is_read {
        return None;
    }
    if item.folder_role == "spam" || item.folder_role == "drafts" {
        return None;
    }
    if !settings
        .account_notifications
        .get(&item.account_id.to_string())
        .copied()
        .unwrap_or(true)
    {
        return None;
    }
    if already_notified(item.email_id) {
        return None;
    }

    let account_label = app
        .try_state::<Db>()
        .and_then(|db| db.account(item.account_id).ok())
        .map(|account| {
            if account.display_name.trim().is_empty() {
                account.email
            } else {
                account.display_name
            }
        })
        .unwrap_or_else(|| "Account".to_string());

    let title = if settings.notification_preview {
        if item.subject.trim().is_empty() {
            "Neue Mail".to_string()
        } else {
            item.subject.clone()
        }
    } else {
        "Neue Mail".to_string()
    };
    let body = if settings.notification_preview {
        format!("{} · {account_label}", item.sender)
    } else {
        format!("Neuer Eingang in {account_label}")
    };

    Some(PendingNotification {
        email_id: item.email_id,
        title,
        body,
        play_sound: settings.notification_sound,
    })
}

fn already_notified(email_id: i64) -> bool {
    notified_ids()
        .lock()
        .map(|seen| seen.contains(&email_id))
        .unwrap_or(false)
}

fn mark_notified(email_id: i64) {
    if let Ok(mut seen) = notified_ids().lock() {
        seen.insert(email_id);
    }
}

fn send_desktop_notification(
    app: &AppHandle,
    title: &str,
    body: &str,
    play_sound: bool,
) -> Result<(), String> {
    let _ = play_sound;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| format!("Desktop-Benachrichtigung fehlgeschlagen: {error}"))?;

    diag_log(app, &format!("Desktop-Benachrichtigung gesendet: {title}"));
    Ok(())
}

fn diag_log(app: &AppHandle, message: &str) {
    let Ok(path) = diagnostics_log_path(app) else {
        eprintln!("{message}");
        return;
    };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(
            file,
            "[{}] {message}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
        );
    }
}

fn diagnostics_log_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(data_dir.join("diagnostics.log"))
}
