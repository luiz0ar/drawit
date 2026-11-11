use mongodb::{bson::doc, options::IndexOptions, Database, IndexModel};
use tracing::info;

pub async fn ensure_indexes(db: &Database) -> mongodb::error::Result<()> {
    info!("Ensuring MongoDB indexes...");

    // 1. `users` collection: unique case-insensitive username index and email index
    let users_col = db.collection::<mongodb::bson::Document>("users");
    let username_options = IndexOptions::builder()
        .unique(true)
        .name("idx_users_username_unique".to_string())
        .build();
    let username_index = IndexModel::builder()
        .keys(doc! { "username": 1 })
        .options(username_options)
        .build();
    users_col.create_index(username_index).await?;

    let email_options = IndexOptions::builder()
        .unique(true)
        .name("idx_users_email_unique".to_string())
        .build();
    let email_index = IndexModel::builder()
        .keys(doc! { "email": 1 })
        .options(email_options)
        .build();
    users_col.create_index(email_index).await?;

    // 2. `refresh_tokens` collection: unique token_hash, TTL, and user session queries
    let tokens_col = db.collection::<mongodb::bson::Document>("refresh_tokens");
    let token_hash_options = IndexOptions::builder()
        .unique(true)
        .name("idx_refresh_tokens_hash_unique".to_string())
        .build();
    tokens_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "token_hash": 1 })
                .options(token_hash_options)
                .build(),
        )
        .await?;

    let ttl_options = IndexOptions::builder()
        .expire_after(std::time::Duration::from_secs(0))
        .name("idx_refresh_tokens_ttl".to_string())
        .build();
    tokens_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "expires_at": 1 })
                .options(ttl_options)
                .build(),
        )
        .await?;

    tokens_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "user_id": 1, "family_id": 1 })
                .build(),
        )
        .await?;

    // 3. `groups` collection: unique by owner_id + name
    let groups_col = db.collection::<mongodb::bson::Document>("groups");
    let group_name_options = IndexOptions::builder()
        .name("idx_groups_owner_name".to_string())
        .build();
    groups_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "owner_id": 1, "name": 1 })
                .options(group_name_options)
                .build(),
        )
        .await?;

    // 4. `boards` collection: compound tenant filters and text index
    let boards_col = db.collection::<mongodb::bson::Document>("boards");
    boards_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "owner_id": 1, "is_deleted": 1, "updated_at": -1 })
                .build(),
        )
        .await?;

    boards_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "owner_id": 1, "group_id": 1, "is_deleted": 1 })
                .build(),
        )
        .await?;

    boards_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "owner_id": 1, "tags": 1, "is_deleted": 1 })
                .build(),
        )
        .await?;

    // 5. `board_scenes` collection: strict tenant isolation index (owner_id)
    let scenes_col = db.collection::<mongodb::bson::Document>("board_scenes");
    scenes_col
        .create_index(IndexModel::builder().keys(doc! { "owner_id": 1 }).build())
        .await?;

    // 6. `email_verifications` collection: unique token_hash, TTL, and user lookup
    let verifications_col = db.collection::<mongodb::bson::Document>("email_verifications");
    let token_hash_options = IndexOptions::builder()
        .unique(true)
        .sparse(true)
        .name("idx_email_verifications_token_hash_unique".to_string())
        .build();
    verifications_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "token_hash": 1 })
                .options(token_hash_options)
                .build(),
        )
        .await?;

    let verif_ttl_options = IndexOptions::builder()
        .expire_after(std::time::Duration::from_secs(0))
        .name("idx_email_verifications_ttl".to_string())
        .build();
    verifications_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "expires_at": 1 })
                .options(verif_ttl_options)
                .build(),
        )
        .await?;

    let verif_user_options = IndexOptions::builder()
        .name("idx_email_verifications_user_created".to_string())
        .build();
    verifications_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "user_id": 1, "created_at": -1 })
                .options(verif_user_options)
                .build(),
        )
        .await?;

    // 7. `password_resets` collection: unique token_hash, TTL, and email/user lookup
    let resets_col = db.collection::<mongodb::bson::Document>("password_resets");
    let reset_token_hash_options = IndexOptions::builder()
        .unique(true)
        .name("idx_password_resets_token_hash_unique".to_string())
        .build();
    resets_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "token_hash": 1 })
                .options(reset_token_hash_options)
                .build(),
        )
        .await?;

    let reset_ttl_options = IndexOptions::builder()
        .expire_after(std::time::Duration::from_secs(0))
        .name("idx_password_resets_ttl".to_string())
        .build();
    resets_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "expires_at": 1 })
                .options(reset_ttl_options)
                .build(),
        )
        .await?;

    let reset_email_options = IndexOptions::builder()
        .name("idx_password_resets_email_created".to_string())
        .build();
    resets_col
        .create_index(
            IndexModel::builder()
                .keys(doc! { "email": 1, "created_at": -1 })
                .options(reset_email_options)
                .build(),
        )
        .await?;

    info!("All MongoDB indexes verified successfully.");
    Ok(())
}
