use drawit_api::{
    create_router, db,
    services::{
        mailer::SmtpMailer,
        mq::RabbitMqPublisher,
        verification_service::VerificationService,
    },
    worker::EmailWorker,
    AppConfig, AppState,
};
use lapin::{Connection, ConnectionProperties};
use mongodb::Client;
use std::{sync::Arc, time::Duration};
use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize structured JSON logging via tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,drawit_api=debug".into()),
        )
        .json()
        .init();

    let config = Arc::new(AppConfig::from_env());

    info!(
        "Starting drawit backend on port {} in {} mode",
        config.port, config.env
    );

    // Connect to MongoDB
    let mongo_client = Client::with_uri_str(&config.mongo_url).await?;
    let db = mongo_client.database(&config.mongo_db_name);

    // Ensure database indexes idempotently
    if let Err(e) = db::ensure_indexes(&db).await {
        error!("Error ensuring MongoDB indexes: {}", e);
    }

    // Connect to RabbitMQ with retry
    info!("Connecting to RabbitMQ at {}", config.amqp_url);
    let mut amqp_conn = None;
    for attempt in 1..=10 {
        match Connection::connect(&config.amqp_url, ConnectionProperties::default()).await {
            Ok(conn) => {
                info!("Successfully connected to RabbitMQ on attempt {attempt}");
                amqp_conn = Some(conn);
                break;
            }
            Err(e) => {
                warn!("Attempt {attempt}/10 to connect to RabbitMQ failed: {e}. Retrying in 2s...");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }

    let amqp_conn = amqp_conn.expect("Unable to establish connection to RabbitMQ broker");

    // Initialize RabbitMQ publisher and declare topology
    let publisher_channel = amqp_conn.create_channel().await?;
    RabbitMqPublisher::setup_topology(&publisher_channel).await?;
    let publisher = Arc::new(RabbitMqPublisher::from_channel(Arc::new(publisher_channel)));

    // Initialize Mailer
    let mailer = Arc::new(SmtpMailer::new(
        &config.smtp_host,
        config.smtp_port,
        &config.mail_from,
    ));

    // Initialize VerificationService
    let verification_service = Arc::new(VerificationService::new(
        &db,
        publisher.clone(),
        config.verify_link_ttl_hours,
        config.verify_resend_cooldown_seconds,
    ));

    // Spawn Background Email Worker
    match EmailWorker::new(
        &amqp_conn,
        db.clone(),
        mailer.clone(),
        config.app_public_url.clone(),
    )
    .await
    {
        Ok(worker) => {
            tokio::spawn(async move {
                worker.run().await;
            });
            info!("Background EmailWorker spawned successfully");
        }
        Err(e) => {
            error!("Failed to initialize EmailWorker: {e}");
        }
    }

    let state = AppState {
        db,
        config: config.clone(),
        publisher,
        verification_service,
        mailer,
    };

    let app = create_router(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("HTTP server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
