use anyhow::{anyhow, Result};
use keyring::Entry;
use std::time::Duration;

const PRIMARY_SERVICE: &str = "com.lunamail.app";
const LEGACY_SERVICES: &[&str] = &[
    "com.mail-app.app",
    "com.luna-mail.app",
    "LunaMail",
    "lunamail",
];

fn key(account_id: i64, protocol: &str, email: &str) -> String {
    format!("{account_id}:{protocol}:{}", normalize_email(email))
}

fn fallback_key(protocol: &str, email: &str) -> String {
    format!("{protocol}:{}", normalize_email(email))
}

fn legacy_key(account_id: i64, protocol: &str, email: &str) -> String {
    format!("{account_id}:{protocol}:{email}")
}

fn legacy_fallback_key(protocol: &str, email: &str) -> String {
    format!("{protocol}:{email}")
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn username_candidates(account_id: i64, protocol: &str, email: &str) -> [String; 4] {
    [
        key(account_id, protocol, email),
        fallback_key(protocol, email),
        legacy_key(account_id, protocol, email),
        legacy_fallback_key(protocol, email),
    ]
}

fn required_usernames(account_id: i64, protocol: &str, email: &str) -> [String; 2] {
    [
        key(account_id, protocol, email),
        fallback_key(protocol, email),
    ]
}

fn legacy_usernames(account_id: i64, protocol: &str, email: &str) -> [String; 2] {
    [
        legacy_key(account_id, protocol, email),
        legacy_fallback_key(protocol, email),
    ]
}

fn service_candidates() -> impl Iterator<Item = &'static str> {
    std::iter::once(PRIMARY_SERVICE).chain(LEGACY_SERVICES.iter().copied())
}

fn read_from_service(
    service: &str,
    account_id: i64,
    protocol: &str,
    email: &str,
) -> Result<String> {
    let mut last_error: Option<String> = None;
    for candidate in username_candidates(account_id, protocol, email) {
        match Entry::new(service, &candidate)?.get_password() {
            Ok(password) => return Ok(password),
            Err(error) => last_error = Some(error.to_string()),
        }
    }
    Err(anyhow!(
        "Kein {protocol}-Passwort unter {service}: {}",
        last_error.unwrap_or_else(|| "nicht gefunden".to_string())
    ))
}

pub fn store_password(account_id: i64, protocol: &str, email: &str, password: &str) -> Result<()> {
    for username in required_usernames(account_id, protocol, email) {
        Entry::new(PRIMARY_SERVICE, &username)?
            .set_password(password)
            .map_err(|error| anyhow!("Keyring konnte das Passwort nicht speichern: {error}"))?;
    }

    for service in LEGACY_SERVICES {
        for username in required_usernames(account_id, protocol, email) {
            if let Err(error) = Entry::new(service, &username)?.set_password(password) {
                eprintln!(
                    "warn: could not write legacy keyring entry for service '{service}': {error}"
                );
            }
        }
    }

    for username in legacy_usernames(account_id, protocol, email) {
        if let Err(error) = Entry::new(PRIMARY_SERVICE, &username)?.set_password(password) {
            eprintln!("warn: could not write legacy keyring entry: {error}");
        }
    }

    Ok(())
}

pub fn get_primary_password(account_id: i64, protocol: &str, email: &str) -> Result<String> {
    let mut last_error: Option<String> = None;
    for attempt in 0..3 {
        match read_from_service(PRIMARY_SERVICE, account_id, protocol, email) {
            Ok(password) => return Ok(password),
            Err(error) => last_error = Some(error.to_string()),
        }
        if attempt < 2 {
            std::thread::sleep(Duration::from_millis(200));
        }
    }
    Err(anyhow!(
        "Für {email} ist kein {protocol}-Passwort im LunaMail-Keyring verfügbar.{}",
        last_error
            .as_deref()
            .map(|value| format!(" ({value})"))
            .unwrap_or_default()
    ))
}

pub fn get_legacy_password(account_id: i64, protocol: &str, email: &str) -> Result<String> {
    for service in LEGACY_SERVICES {
        if let Ok(password) = read_from_service(service, account_id, protocol, email) {
            let _ = store_password(account_id, protocol, email, &password);
            return Ok(password);
        }
    }
    Err(anyhow!(
        "Kein älteres {protocol}-Passwort für {email} im Keyring gefunden."
    ))
}

pub fn delete_password(account_id: i64, protocol: &str, email: &str) {
    for service in service_candidates() {
        for username in username_candidates(account_id, protocol, email) {
            if let Ok(entry) = Entry::new(service, &username) {
                let _ = entry.delete_credential();
            }
        }
    }
}
