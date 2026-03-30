use lettre::message::{header::ContentType, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct EmailPayload {
    pub smtp_host:     String,
    pub smtp_port:     u16,
    pub smtp_user:     String,
    pub smtp_password: String,
    pub to:            String,
    pub subject:       String,
    pub html_body:     String,
}

/// Send an email via SMTP (TLS on port 465, STARTTLS on other ports).
#[tauri::command]
pub async fn send_email(payload: EmailPayload) -> Result<(), String> {
    let email = Message::builder()
        .from(
            payload
                .smtp_user
                .parse()
                .map_err(|e| format!("Adresse expéditeur invalide : {e}"))?,
        )
        .to(
            payload
                .to
                .parse()
                .map_err(|e| format!("Adresse destinataire invalide : {e}"))?,
        )
        .subject(&payload.subject)
        .multipart(
            MultiPart::alternative().singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_HTML)
                    .body(payload.html_body),
            ),
        )
        .map_err(|e| format!("Erreur construction email : {e}"))?;

    let creds = Credentials::new(payload.smtp_user.clone(), payload.smtp_password.clone());

    // Use implicit TLS (SMTPS) on port 465, STARTTLS otherwise
    let transport: AsyncSmtpTransport<Tokio1Executor> = if payload.smtp_port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&payload.smtp_host)
            .map_err(|e| format!("Erreur SMTP relay : {e}"))?
            .port(payload.smtp_port)
            .credentials(creds)
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&payload.smtp_host)
            .map_err(|e| format!("Erreur SMTP relay : {e}"))?
            .port(payload.smtp_port)
            .credentials(creds)
            .build()
    };

    transport
        .send(email)
        .await
        .map_err(|e| format!("Erreur envoi email : {e}"))?;

    Ok(())
}
