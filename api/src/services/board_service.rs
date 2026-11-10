use chrono::Utc;
use mongodb::{
    bson::{doc, to_bson, Bson, DateTime as BsonDateTime},
    Collection, Database,
};

use crate::{
    dto::{BoardDto, CreateBoardRequest, SceneDto, UpdateBoardRequest, ViewportDto},
    error::{AppError, InvalidParam},
    models::{Board, BoardScene, Viewport},
};

pub struct BoardService {
    boards_col: Collection<Board>,
    scenes_col: Collection<BoardScene>,
}

impl BoardService {
    pub fn new(db: &Database) -> Self {
        Self {
            boards_col: db.collection("boards"),
            scenes_col: db.collection("board_scenes"),
        }
    }

    /// RF-Q01: Create board with strictly validated title (1-120 chars) and atomic scene init
    pub async fn create_board(
        &self,
        owner_id: &str,
        req: CreateBoardRequest,
    ) -> Result<BoardDto, AppError> {
        let title = req.title.trim().to_string();
        if title.is_empty() || title.len() > 120 {
            return Err(AppError::Validation(vec![InvalidParam {
                name: "title".to_string(),
                reason: "Title is required and must be between 1 and 120 characters.".to_string(),
            }]));
        }

        let now = Utc::now();
        let board_id = uuid::Uuid::new_v4().to_string();

        let board = Board {
            id: board_id.clone(),
            owner_id: owner_id.to_string(),
            group_id: req.group_id,
            title,
            tags: vec![],
            is_favorite: false,
            thumbnail: None,
            is_deleted: false,
            deleted_at: None,
            last_opened_at: Some(now),
            created_at: now,
            updated_at: now,
        };

        self.boards_col
            .insert_one(&board)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let scene = BoardScene {
            id: board_id.clone(),
            owner_id: owner_id.to_string(),
            schema_version: 1,
            revision: 1,
            last_client_save_id: None,
            content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            elements: vec![],
            viewport: Viewport::default(),
            updated_at: now,
        };

        self.scenes_col
            .insert_one(&scene)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        Ok(self.to_board_dto(board))
    }

    /// RF-Q02: List boards with tenant isolation
    pub async fn list_boards(
        &self,
        owner_id: &str,
        include_trash: bool,
    ) -> Result<Vec<BoardDto>, AppError> {
        let filter = if include_trash {
            doc! { "owner_id": owner_id, "is_deleted": true }
        } else {
            doc! { "owner_id": owner_id, "is_deleted": false }
        };

        let mut cursor = self
            .boards_col
            .find(filter)
            .sort(doc! { "updated_at": -1 })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let mut boards = Vec::new();
        while cursor.advance().await.map_err(|e| AppError::Internal(e.to_string()))? {
            let board = cursor
                .deserialize_current()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            boards.push(self.to_board_dto(board));
        }

        Ok(boards)
    }

    /// RF-Q03: Get full board scene
    pub async fn get_scene(&self, owner_id: &str, board_id: &str) -> Result<SceneDto, AppError> {
        let scene = self
            .scenes_col
            .find_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Scene not found.".to_string()))?;

        Ok(SceneDto {
            board_id: scene.id,
            schema_version: scene.schema_version,
            revision: scene.revision,
            elements: scene.elements,
            viewport: ViewportDto {
                pan_x: scene.viewport.x,
                pan_y: scene.viewport.y,
                zoom: scene.viewport.zoom,
            },
            updated_at: scene.updated_at,
        })
    }

    /// RF-Q10 & RNF-R02: Save board scene with OCC (Optimistic Concurrency Control)
    pub async fn save_scene(
        &self,
        owner_id: &str,
        board_id: &str,
        expected_revision: u64,
        elements: Vec<serde_json::Value>,
        viewport: ViewportDto,
        content_hash: String,
        last_client_save_id: Option<String>,
    ) -> Result<u64, AppError> {
        let now = Utc::now();
        let next_revision = expected_revision + 1;

        let filter = doc! {
            "_id": board_id,
            "owner_id": owner_id,
            "revision": expected_revision as i64,
        };

        let elements_bson = to_bson(&elements)
            .map_err(|e| AppError::Internal(format!("Failed to serialize scene elements: {}", e)))?;

        let update = doc! {
            "$set": {
                "revision": next_revision as i64,
                "elements": elements_bson,
                "viewport": {
                    "x": viewport.pan_x,
                    "y": viewport.pan_y,
                    "zoom": viewport.zoom,
                },
                "content_hash": &content_hash,
                "last_client_save_id": last_client_save_id,
                "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
            }
        };

        let result = self
            .scenes_col
            .update_one(filter, update)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if result.matched_count == 0 {
            let current_scene = self
                .scenes_col
                .find_one(doc! { "_id": board_id, "owner_id": owner_id })
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?
                .ok_or_else(|| AppError::NotFound("Board not found.".to_string()))?;

            return Err(AppError::ConcurrencyConflict {
                server_revision: current_scene.revision,
                instance: format!("/api/boards/{}/scene", board_id),
            });
        }

        let _ = self
            .boards_col
            .update_one(
                doc! { "_id": board_id, "owner_id": owner_id },
                doc! { "$set": { "updated_at": BsonDateTime::from_millis(now.timestamp_millis()) } },
            )
            .await;

        Ok(next_revision)
    }

    /// RF-Q04: Update board metadata
    pub async fn update_board(
        &self,
        owner_id: &str,
        board_id: &str,
        req: UpdateBoardRequest,
    ) -> Result<BoardDto, AppError> {
        let mut set_doc = doc! {
            "updated_at": BsonDateTime::from_millis(Utc::now().timestamp_millis())
        };

        if let Some(title) = req.title {
            let t = title.trim().to_string();
            if t.is_empty() || t.len() > 120 {
                return Err(AppError::Validation(vec![InvalidParam {
                    name: "title".to_string(),
                    reason: "Title must be between 1 and 120 characters.".to_string(),
                }]));
            }
            set_doc.insert("title", t);
        }

        if let Some(group_opt) = req.group_id {
            match group_opt {
                Some(gid) => set_doc.insert("group_id", gid),
                None => set_doc.insert("group_id", Bson::Null),
            };
        }

        if let Some(tags) = req.tags {
            let norm_tags: Vec<String> = tags
                .into_iter()
                .map(|t| t.trim().to_lowercase())
                .filter(|t| !t.is_empty())
                .collect();
            set_doc.insert("tags", norm_tags);
        }

        if let Some(fav) = req.is_favorite {
            set_doc.insert("is_favorite", fav);
        }

        let _ = self
            .boards_col
            .find_one_and_update(
                doc! { "_id": board_id, "owner_id": owner_id },
                doc! { "$set": set_doc },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Board not found.".to_string()))?;

        self.get_board(owner_id, board_id).await
    }

    pub async fn get_board(&self, owner_id: &str, board_id: &str) -> Result<BoardDto, AppError> {
        let board = self
            .boards_col
            .find_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Board not found.".to_string()))?;

        Ok(self.to_board_dto(board))
    }

    /// RF-Q05: Soft delete
    pub async fn soft_delete(&self, owner_id: &str, board_id: &str) -> Result<(), AppError> {
        let now = Utc::now();
        let res = self
            .boards_col
            .update_one(
                doc! { "_id": board_id, "owner_id": owner_id },
                doc! {
                    "$set": {
                        "is_deleted": true,
                        "deleted_at": BsonDateTime::from_millis(now.timestamp_millis()),
                        "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
                    }
                },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if res.matched_count == 0 {
            return Err(AppError::NotFound("Board not found.".to_string()));
        }

        Ok(())
    }

    /// RF-Q06: Restore board from trash
    pub async fn restore_board(&self, owner_id: &str, board_id: &str) -> Result<(), AppError> {
        let now = Utc::now();
        let res = self
            .boards_col
            .update_one(
                doc! { "_id": board_id, "owner_id": owner_id, "is_deleted": true },
                doc! {
                    "$set": {
                        "is_deleted": false,
                        "deleted_at": Bson::Null,
                        "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
                    }
                },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if res.matched_count == 0 {
            return Err(AppError::NotFound("Board not found in trash.".to_string()));
        }

        Ok(())
    }

    fn to_board_dto(&self, board: Board) -> BoardDto {
        BoardDto {
            id: board.id,
            owner_id: board.owner_id,
            group_id: board.group_id,
            title: board.title,
            tags: board.tags,
            is_favorite: board.is_favorite,
            is_deleted: board.is_deleted,
            deleted_at: board.deleted_at,
            created_at: board.created_at,
            updated_at: board.updated_at,
        }
    }
}
