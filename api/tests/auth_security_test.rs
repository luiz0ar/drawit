use drawit_api::config::AppConfig;
use std::env;

#[test]
fn test_config_login_delay_env_parsing() {
    env::set_var("LOGIN_DELAY_MS", "750");
    let config = AppConfig::from_env();
    assert_eq!(config.login_delay_ms, 750);

    env::set_var("LOGIN_DELAY_MS", "invalid_number");
    let fallback_config = AppConfig::from_env();
    assert_eq!(fallback_config.login_delay_ms, 1000);
}
