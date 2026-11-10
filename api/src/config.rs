use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub env: String,
    pub mongo_url: String,
    pub mongo_db_name: String,
    pub jwt_secret: String,
    pub jwt_expiration_minutes: i64,
    pub refresh_token_expiration_days: i64,
    pub frontend_origin: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        Self {
            port: env::var("APP_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("APP_PORT must be a valid port number"),
            env: env::var("APP_ENV").unwrap_or_else(|_| "development".to_string()),
            mongo_url: env::var("MONGO_URL")
                .unwrap_or_else(|_| "mongodb://localhost:27017/drawit".to_string()),
            mongo_db_name: env::var("MONGO_DB_NAME").unwrap_or_else(|_| "drawit".to_string()),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| {
                "super_secret_drawit_jwt_development_key_minimum_32_chars!".to_string()
            }),
            jwt_expiration_minutes: env::var("JWT_EXPIRATION_MINUTES")
                .unwrap_or_else(|_| "15".to_string())
                .parse()
                .expect("JWT_EXPIRATION_MINUTES must be an integer"),
            refresh_token_expiration_days: env::var("REFRESH_TOKEN_EXPIRATION_DAYS")
                .unwrap_or_else(|_| "7".to_string())
                .parse()
                .expect("REFRESH_TOKEN_EXPIRATION_DAYS must be an integer"),
            frontend_origin: env::var("FRONTEND_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
        }
    }
}
