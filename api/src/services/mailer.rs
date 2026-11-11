use async_trait::async_trait;
use lettre::{
    message::{header::ContentType, Mailbox, SinglePart},
    transport::smtp::client::Tls,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use std::sync::Arc;
use tracing::{error, info};

use crate::error::AppError;

#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send_verification_email(
        &self,
        to_email: &str,
        verification_link: &str,
    ) -> Result<(), AppError>;
}

#[derive(Clone)]
pub struct SmtpMailer {
    from_header: String,
    transport: AsyncSmtpTransport<Tokio1Executor>,
}

impl SmtpMailer {
    pub fn new(smtp_host: &str, smtp_port: u16, mail_from: &str) -> Self {
        let transport = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(smtp_host)
            .port(smtp_port)
            .tls(Tls::None)
            .build();

        Self {
            from_header: mail_from.to_string(),
            transport,
        }
    }
}

#[async_trait]
impl Mailer for SmtpMailer {
    async fn send_verification_email(
        &self,
        to_email: &str,
        verification_link: &str,
    ) -> Result<(), AppError> {
        let from_mailbox: Mailbox = self
            .from_header
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid sender address: {e}")))?;

        let to_mailbox: Mailbox = to_email
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid recipient address: {e}")))?;

        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; }}
    .logo {{ font-size: 20px; font-weight: 700; color: #2563eb; margin-bottom: 24px; }}
    .title {{ font-size: 18px; font-weight: 600; margin-bottom: 12px; }}
    .text {{ font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }}
    .button {{ display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px; }}
    .footer {{ margin-top: 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; }}
    .link-alt {{ word-break: break-all; color: #2563eb; font-size: 12px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">DrawIt</div>
    <div class="title">Confirme seu endereço de e-mail</div>
    <div class="text">
      Olá!<br><br>
      Obrigado por se registrar no DrawIt. Para ativar sua conta e acessar seus quadros de System Design, confirme seu e-mail clicando no botão abaixo:
    </div>
    <p style="text-align: center; margin: 32px 0;">
      <a href="{verification_link}" class="button" target="_blank" rel="noopener noreferrer">Confirmar meu e-mail</a>
    </p>
    <div class="text" style="font-size: 13px;">
      Este link expira em 24 horas. Se você não solicitou este cadastro, pode ignorar esta mensagem com segurança.
    </div>
    <div class="footer">
      Caso o botão não funcione, copie e cole este link no seu navegador:<br>
      <span class="link-alt">{verification_link}</span>
    </div>
  </div>
</body>
</html>"#
        );

        let email = Message::builder()
            .from(from_mailbox)
            .to(to_mailbox)
            .subject("Confirme seu e-mail no DrawIt")
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_HTML)
                    .body(html_body),
            )
            .map_err(|e| AppError::Internal(format!("Failed to build email message: {e}")))?;

        self.transport
            .send(email)
            .await
            .map_err(|e| {
                error!(to = to_email, "Failed to send email via SMTP: {e}");
                AppError::Internal(format!("SMTP delivery error: {e}"))
            })?;

        info!(to = to_email, "Verification email successfully dispatched via SMTP");
        Ok(())
    }
}

/// In-memory/mock mailer for testing
#[derive(Default, Clone)]
pub struct MockMailer {
    pub sent_emails: Arc<tokio::sync::Mutex<Vec<(String, String)>>>,
}

#[async_trait]
impl Mailer for MockMailer {
    async fn send_verification_email(
        &self,
        to_email: &str,
        verification_link: &str,
    ) -> Result<(), AppError> {
        let mut emails = self.sent_emails.lock().await;
        emails.push((to_email.to_string(), verification_link.to_string()));
        Ok(())
    }
}

