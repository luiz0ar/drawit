use async_trait::async_trait;
use lapin::{
    options::{BasicPublishOptions, ConfirmSelectOptions, ExchangeDeclareOptions, QueueBindOptions, QueueDeclareOptions},
    types::FieldTable,
    BasicProperties, Channel, Connection, ConnectionProperties, ExchangeKind,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{error, info};

use crate::error::AppError;

pub const EMAIL_EXCHANGE: &str = "drawit.email";
pub const EMAIL_VERIFICATION_ROUTING_KEY: &str = "email.verification.requested";
pub const EMAIL_VERIFICATION_QUEUE: &str = "email.verification";
pub const EMAIL_DLX: &str = "drawit.email.dlx";
pub const EMAIL_VERIFICATION_DLQ: &str = "email.verification.dlq";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationEvent {
    pub verification_id: String,
    pub user_id: String,
    pub email: String,
}

#[async_trait]
pub trait MessagePublisher: Send + Sync {
    async fn publish_verification_requested(
        &self,
        verification_id: &str,
        user_id: &str,
        email: &str,
    ) -> Result<(), AppError>;
}

#[derive(Clone)]
pub struct RabbitMqPublisher {
    channel: Arc<Channel>,
}

impl RabbitMqPublisher {
    pub async fn new(amqp_url: &str) -> Result<Self, AppError> {
        let conn = Connection::connect(amqp_url, ConnectionProperties::default())
            .await
            .map_err(|e| AppError::Internal(format!("Failed to connect to RabbitMQ: {e}")))?;

        let channel = conn
            .create_channel()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to create RabbitMQ channel: {e}")))?;

        channel
            .confirm_select(ConfirmSelectOptions::default())
            .await
            .map_err(|e| AppError::Internal(format!("Failed to enable publisher confirms: {e}")))?;

        Self::setup_topology(&channel).await?;

        Ok(Self {
            channel: Arc::new(channel),
        })
    }

    pub fn from_channel(channel: Arc<Channel>) -> Self {
        Self { channel }
    }

    pub async fn setup_topology(channel: &Channel) -> Result<(), AppError> {
        // Declare Dead Letter Exchange & DLQ
        channel
            .exchange_declare(
                EMAIL_DLX,
                ExchangeKind::Direct,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to declare DLX: {e}")))?;

        channel
            .queue_declare(
                EMAIL_VERIFICATION_DLQ,
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to declare DLQ: {e}")))?;

        channel
            .queue_bind(
                EMAIL_VERIFICATION_DLQ,
                EMAIL_DLX,
                EMAIL_VERIFICATION_ROUTING_KEY,
                QueueBindOptions::default(),
                FieldTable::default(),
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to bind DLQ: {e}")))?;

        // Main Direct Exchange
        channel
            .exchange_declare(
                EMAIL_EXCHANGE,
                ExchangeKind::Direct,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to declare main exchange: {e}")))?;

        // Main Queue with DLX configuration
        let mut queue_args = FieldTable::default();
        queue_args.insert(
            "x-dead-letter-exchange".into(),
            lapin::types::AMQPValue::LongString(EMAIL_DLX.into()),
        );
        queue_args.insert(
            "x-dead-letter-routing-key".into(),
            lapin::types::AMQPValue::LongString(EMAIL_VERIFICATION_ROUTING_KEY.into()),
        );

        channel
            .queue_declare(
                EMAIL_VERIFICATION_QUEUE,
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                queue_args,
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to declare verification queue: {e}")))?;

        channel
            .queue_bind(
                EMAIL_VERIFICATION_QUEUE,
                EMAIL_EXCHANGE,
                EMAIL_VERIFICATION_ROUTING_KEY,
                QueueBindOptions::default(),
                FieldTable::default(),
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to bind verification queue: {e}")))?;

        info!("RabbitMQ exchanges and queues topology verified successfully.");
        Ok(())
    }
}

#[async_trait]
impl MessagePublisher for RabbitMqPublisher {
    async fn publish_verification_requested(
        &self,
        verification_id: &str,
        user_id: &str,
        email: &str,
    ) -> Result<(), AppError> {
        let payload = VerificationEvent {
            verification_id: verification_id.to_string(),
            user_id: user_id.to_string(),
            email: email.to_string(),
        };

        let bytes = serde_json::to_vec(&payload)
            .map_err(|e| AppError::Internal(format!("Serialization error: {e}")))?;

        let props = BasicProperties::default()
            .with_delivery_mode(2) // Persistent delivery
            .with_content_type("application/json".into());

        let confirmation = self
            .channel
            .basic_publish(
                EMAIL_EXCHANGE,
                EMAIL_VERIFICATION_ROUTING_KEY,
                BasicPublishOptions::default(),
                &bytes,
                props,
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to publish AMQP message: {e}")))?
            .await
            .map_err(|e| AppError::Internal(format!("Failed to receive AMQP publisher confirm: {e}")))?;

        if confirmation.is_nack() {
            error!(
                verification_id = verification_id,
                user_id = user_id,
                "AMQP message received NACK from broker"
            );
            return Err(AppError::Internal("AMQP message was not acknowledged by broker".to_string()));
        }

        info!(
            verification_id = verification_id,
            user_id = user_id,
            "Verification requested message published successfully"
        );
        Ok(())
    }
}

/// In-memory/mock publisher useful for testing or fallback
#[derive(Default, Clone)]
pub struct MockPublisher {
    pub published_events: Arc<tokio::sync::Mutex<Vec<VerificationEvent>>>,
}

#[async_trait]
impl MessagePublisher for MockPublisher {
    async fn publish_verification_requested(
        &self,
        verification_id: &str,
        user_id: &str,
        email: &str,
    ) -> Result<(), AppError> {
        let mut events = self.published_events.lock().await;
        events.push(VerificationEvent {
            verification_id: verification_id.to_string(),
            user_id: user_id.to_string(),
            email: email.to_string(),
        });
        Ok(())
    }
}

