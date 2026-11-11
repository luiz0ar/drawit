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
    pub login_delay_ms: u64,
    pub amqp_url: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub mail_from: String,
    pub app_public_url: String,
    pub verify_link_ttl_hours: i64,
    pub verify_resend_cooldown_seconds: i64,
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
            login_delay_ms: env::var("LOGIN_DELAY_MS")
                .unwrap_or_else(|_| "1000".to_string())
                .parse()
                .unwrap_or(1000),
            amqp_url: env::var("AMQP_URL")
                .unwrap_or_else(|_| "amqp://guest:guest@localhost:5672".to_string()),
            smtp_host: env::var("SMTP_HOST").unwrap_or_else(|_| "localhost".to_string()),
            smtp_port: env::var("SMTP_PORT")
                .unwrap_or_else(|_| "1025".to_string())
                .parse()
                .unwrap_or(1025),
            mail_from: env::var("MAIL_FROM")
                .unwrap_or_else(|_| "DrawIt <no-reply@drawit.local>".to_string()),
            app_public_url: env::var("APP_PUBLIC_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            verify_link_ttl_hours: env::var("VERIFY_LINK_TTL_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .unwrap_or(24),
            verify_resend_cooldown_seconds: env::var("VERIFY_RESEND_COOLDOWN_SECONDS")
                .unwrap_or_else(|_| "90".to_string())
                .parse()
                .unwrap_or(90),
        }
    }
}
