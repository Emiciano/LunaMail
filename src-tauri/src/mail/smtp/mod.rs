use super::{Account, Draft};
use anyhow::{anyhow, Result};
use lettre::message::{
    header::ContentType, Attachment as LettreAttachment, Mailbox, MultiPart, SinglePart,
};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use std::fs;
use std::path::Path;

pub fn send(account: &Account, password: &str, draft: &Draft) -> Result<()> {
    if !account.smtp_secure {
        return Err(anyhow!("TLS ist für SMTP erforderlich"));
    }
    if split_addresses(&draft.to).next().is_none() {
        return Err(anyhow!("Mindestens ein Empfänger ist erforderlich"));
    }

    let mut builder = Message::builder()
        .from(parse_mailbox(&account.email)?)
        .subject(&draft.subject);

    for to in split_addresses(&draft.to) {
        builder = builder.to(parse_mailbox(to)?);
    }
    for cc in split_addresses(draft.cc.as_deref().unwrap_or_default()) {
        builder = builder.cc(parse_mailbox(cc)?);
    }
    for bcc in split_addresses(draft.bcc.as_deref().unwrap_or_default()) {
        builder = builder.bcc(parse_mailbox(bcc)?);
    }

    let mut multipart = MultiPart::mixed().singlepart(SinglePart::plain(draft.body.clone()));
    for attachment in &draft.attachments {
        let Some(path) = attachment.path.as_deref() else {
            continue;
        };
        let bytes = fs::read(path)?;
        let file_name = attachment
            .file_name
            .trim()
            .is_empty()
            .then(|| file_name_from_path(path))
            .flatten()
            .unwrap_or_else(|| attachment.file_name.clone());
        let content_type = ContentType::parse(&attachment.content_type)
            .unwrap_or(ContentType::parse("application/octet-stream").expect("valid content type"));
        multipart =
            multipart.singlepart(LettreAttachment::new(file_name).body(bytes, content_type));
    }

    let message = builder.multipart(multipart)?;
    let creds = Credentials::new(account.username.clone(), password.to_string());
    let transport = if account.smtp_port == 587 {
        SmtpTransport::starttls_relay(&account.smtp_host)?
    } else {
        SmtpTransport::relay(&account.smtp_host)?
    };
    let mailer = transport.port(account.smtp_port).credentials(creds).build();
    mailer
        .send(&message)
        .map_err(|error| anyhow!("SMTP-Versand fehlgeschlagen: {error}"))?;
    Ok(())
}

fn parse_mailbox(value: &str) -> Result<Mailbox> {
    value
        .trim()
        .parse()
        .map_err(|error| anyhow!("Ungültige Mailadresse '{value}': {error}"))
}

fn split_addresses(value: &str) -> impl Iterator<Item = &str> {
    value
        .split([',', ';'])
        .map(str::trim)
        .filter(|address| !address.is_empty())
}

fn file_name_from_path(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
}

pub fn test_connection(account: &Account, password: &str) -> Result<()> {
    if !account.smtp_secure {
        return Err(anyhow!("TLS ist für SMTP erforderlich"));
    }
    let creds = Credentials::new(account.username.clone(), password.to_string());
    let transport = if account.smtp_port == 587 {
        SmtpTransport::starttls_relay(&account.smtp_host)?
    } else {
        SmtpTransport::relay(&account.smtp_host)?
    };
    let mailer = transport.port(account.smtp_port).credentials(creds).build();
    mailer
        .test_connection()
        .map_err(|error| anyhow!("SMTP Verbindung fehlgeschlagen: {error}"))?;
    Ok(())
}
