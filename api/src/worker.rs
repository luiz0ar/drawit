use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use futures_lite::StreamExt;
use lapin::{
    options::{BasicAckOptions, BasicConsumeOptions, BasicNackOptions, BasicQosOptions},
    types::FieldTable,
    Channel, Connection,
};
use mongodb::{bson::doc, Database};
use rand::{rngs::OsRng, RngCore};
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::{
    models::{EmailVerification, VerificationStatus},
    services::{
        mailer::Mailer,
        mq::{VerificationEvent, EMAIL_VERIFICATION_QUEUE},
        verification_service::VerificationService,
    },
};

pub struct EmailWorker {
    channel: Channel,
    db: Database,
    mailer: Arc<dyn Mailer>,
    app_public_url: String,
}

impl EmailWorker {
    pub async fn new(
        conn: &Connection,
        db: Database,
        mailer: Arc<dyn Mailer>,
        app_public_url: String,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let channel = conn.create_channel().await?;
        channel.basic_qos(10, BasicQosOptions::default()).await?;

        Ok(Self {
            channel,
            db,
            mailer,
            app_public_url,
        })
    }

    pub async fn run(self) {
        info!("Email worker consumer started listening on queue: {}", EMAIL_VERIFICATION_QUEUE);

        let mut consumer = match self
            .channel
            .basic_consume(
                EMAIL_VERIFICATION_QUEUE,
                "email_worker_tag",
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await
        {
            Ok(c) => c,
            Err(e) => {
                error!("Email worker failed to start basic_consume: {e}");
                return;
            }
        };

        let verifications_col = self.db.collection::<EmailVerification>("email_verifications");

        while let Some(delivery_res) = consumer.next().await {
            match delivery_res {
                Ok(delivery) => {
                    let payload: Result<VerificationEvent, _> =
                        serde_json::from_slice(&delivery.data);

                    let event = match payload {
                        Ok(ev) => ev,
                        Err(err) => {
                            warn!("Malformed message received on email queue: {err}");
                            let _ = delivery
                                .nack(BasicNackOptions {
                                    requeue: false, // Dead-letter malformed payload
                                    ..Default::default()
                                })
                                .await;
                            continue;
                        }
                    };

                    info!(
                        verification_id = %event.verification_id,
                        email = %event.email,
                        "Processing verification email request from queue"
                    );

                    // Check status idempotently
                    let existing = match verifications_col
                        .find_one(doc! { "_id": &event.verification_id })
                        .await
                    {
                        Ok(Some(v)) => v,
                        Ok(None) => {
                            warn!(
                                verification_id = %event.verification_id,
                                "Verification record not found in MongoDB; acknowledging to drop"
                            );
                            let _ = delivery.ack(BasicAckOptions::default()).await;
                            continue;
                        }
                        Err(e) => {
                            error!("Database error fetching verification record: {e}");
                            let _ = delivery
                                .nack(BasicNackOptions {
                                    requeue: true,
                                    ..Default::default()
                                })
                                .await;
                            continue;
                        }
                    };

                    if existing.status != VerificationStatus::Pending {
                        info!(
                            verification_id = %event.verification_id,
                            status = ?existing.status,
                            "Verification record is no longer pending; dropping message idempotently"
                        );
                        let _ = delivery.ack(BasicAckOptions::default()).await;
                        continue;
                    }

                    // Generate secure 32-byte CSPRNG token (base64url)
                    let mut random_bytes = [0u8; 32];
                    OsRng.fill_bytes(&mut random_bytes);
                    let raw_token = BASE64_URL_SAFE_NO_PAD.encode(random_bytes);
                    let token_hash = VerificationService::hash_token(&raw_token);

                    // Persist token hash and advance state to "Sent"
                    let update_res = verifications_col
                        .update_one(
                            doc! {
                                "_id": &event.verification_id,
                                "status": "pending"
                            },
                            doc! {
                                "$set": {
                                    "token_hash": &token_hash,
                                    "status": "sent"
                                }
                            },
                        )
                        .await;

                    match update_res {
                        Ok(res) if res.modified_count == 1 => {
                            // Link generated and saved, dispatch email via Mailer
                            let link = format!(
                                "{}/verify-email?token={}",
                                self.app_public_url.trim_end_matches('/'),
                                raw_token
                            );

                            match self.mailer.send_verification_email(&event.email, &link).await {
                                Ok(()) => {
                                    info!(
                                        verification_id = %event.verification_id,
                                        email = %event.email,
                                        "Verification email successfully delivered to SMTP; acknowledging message"
                                    );
                                    let _ = delivery.ack(BasicAckOptions::default()).await;
                                }
                                Err(err) => {
                                    error!(
                                        verification_id = %event.verification_id,
                                        email = %event.email,
                                        "Mailer delivery failed: {err}; routing to DLQ / retry"
                                    );
                                    let _ = delivery
                                        .nack(BasicNackOptions {
                                            requeue: false, // Dead-letter to allow investigation
                                            ..Default::default()
                                        })
                                        .await;
                                }
                            }
                        }
                        Ok(_) => {
                            info!(
                                verification_id = %event.verification_id,
                                "Verification was modified concurrently (e.g. invalidated); acknowledging"
                            );
                            let _ = delivery.ack(BasicAckOptions::default()).await;
                        }
                        Err(e) => {
                            error!("Database error updating token hash: {e}");
                            let _ = delivery
                                .nack(BasicNackOptions {
                                    requeue: true,
                                    ..Default::default()
                                })
                                .await;
                        }
                    }
                }
                Err(e) => {
                    warn!("Error receiving delivery from consumer stream: {e}");
                }
            }
        }

        warn!("Email worker consumer loop ended.");
    }
}
