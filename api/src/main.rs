use drawit_api::{create_router, db, AppConfig, AppState};
use mongodb::Client;
use std::sync::Arc;
use tracing::info;

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
        tracing::error!("Error ensuring MongoDB indexes: {}", e);
    }

    let state = AppState {
        db,
        config: config.clone(),
    };

    let app = create_router(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("HTTP server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
