use std::collections::HashMap;

use chrono::Utc;
use mongodb::{
    bson::{doc, to_bson, Bson, DateTime as BsonDateTime},
    Collection, Database,
};

use crate::{
    dto::{
        BoardDto, BoardVersionDto, CreateBoardRequest, CreateVersionRequest, SaveSceneRequest,
        SceneDto, TagCountDto, UpdateBoardRequest, ViewportDto,
    },
    error::{AppError, InvalidParam},
    models::{Board, BoardScene, BoardVersion, Viewport},
};

#[derive(Debug, Default)]
pub struct ListBoardsFilter {
    pub trash: bool,
    pub group_id: Option<String>,
    pub tags: Option<String>,
    pub q: Option<String>,
    pub favorite: Option<bool>,
    pub sort: Option<String>,
}

pub struct BoardService {
    boards_col: Collection<Board>,
    scenes_col: Collection<BoardScene>,
    versions_col: Collection<BoardVersion>,
}

impl BoardService {
    pub fn new(db: &Database) -> Self {
        Self {
            boards_col: db.collection("boards"),
            scenes_col: db.collection("board_scenes"),
            versions_col: db.collection("board_versions"),
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
            content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                .to_string(),
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

    /// RF-Q02, RF-O02, RF-O04, RF-O05, RF-O06, RF-O07, RF-O08: List boards with rich filters & sort
    pub async fn list_boards(
        &self,
        owner_id: &str,
        params: ListBoardsFilter,
    ) -> Result<Vec<BoardDto>, AppError> {
        let mut filter = doc! {
            "owner_id": owner_id,
            "is_deleted": params.trash,
        };

        if let Some(gid) = params.group_id {
            let trimmed = gid.trim();
            if trimmed == "none" || trimmed == "null" {
                filter.insert("group_id", Bson::Null);
            } else if !trimmed.is_empty() {
                filter.insert("group_id", trimmed);
            }
        }

        if let Some(fav) = params.favorite {
            filter.insert("is_favorite", fav);
        }

        if let Some(tags_str) = params.tags {
            let tag_list: Vec<String> = tags_str
                .split(',')
                .map(|t| t.trim().to_lowercase())
                .filter(|t| !t.is_empty())
                .collect();
            if !tag_list.is_empty() {
                filter.insert("tags", doc! { "$all": tag_list });
            }
        }

        if let Some(query) = params.q {
            let q = query.trim();
            if !q.is_empty() {
                filter.insert(
                    "$or",
                    vec![
                        doc! { "title": { "$regex": q, "$options": "i" } },
                        doc! { "tags": { "$regex": q, "$options": "i" } },
                    ],
                );
            }
        }

        let sort_doc = match params.sort.as_deref() {
            Some("created_at:desc") | Some("createdAt:desc") => doc! { "created_at": -1 },
            Some("created_at:asc") | Some("createdAt:asc") => doc! { "created_at": 1 },
            Some("title:asc") => doc! { "title": 1 },
            Some("title:desc") => doc! { "title": -1 },
            Some("last_opened_at:desc") | Some("recent") => {
                doc! { "last_opened_at": -1, "updated_at": -1 }
            }
            Some("updated_at:asc") | Some("updatedAt:asc") => doc! { "updated_at": 1 },
            _ => doc! { "updated_at": -1 },
        };

        let mut cursor = self
            .boards_col
            .find(filter)
            .sort(sort_doc)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let mut boards = Vec::new();
        while cursor
            .advance()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        {
            let board = cursor
                .deserialize_current()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            boards.push(self.to_board_dto(board));
        }

        Ok(boards)
    }

    /// RF-Q03 & RF-O08: Get full board scene and touch last_opened_at
    pub async fn get_scene(&self, owner_id: &str, board_id: &str) -> Result<SceneDto, AppError> {
        let scene = self
            .scenes_col
            .find_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Scene not found.".to_string()))?;

        let now = Utc::now();
        let _ = self
            .boards_col
            .update_one(
                doc! { "_id": board_id, "owner_id": owner_id },
                doc! { "$set": { "last_opened_at": BsonDateTime::from_millis(now.timestamp_millis()) } },
            )
            .await;

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
        req: SaveSceneRequest,
    ) -> Result<u64, AppError> {
        let now = Utc::now();
        let next_revision = req.revision + 1;

        let filter = doc! {
            "_id": board_id,
            "owner_id": owner_id,
            "revision": req.revision as i64,
        };

        let elements_bson = to_bson(&req.elements).map_err(|e| {
            AppError::Internal(format!("Failed to serialize scene elements: {}", e))
        })?;

        let update = doc! {
            "$set": {
                "revision": next_revision as i64,
                "elements": elements_bson,
                "viewport": {
                    "x": req.viewport.pan_x,
                    "y": req.viewport.pan_y,
                    "zoom": req.viewport.zoom,
                },
                "content_hash": &req.content_hash,
                "last_client_save_id": req.last_client_save_id,
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

        let mut board_set = doc! {
            "updated_at": BsonDateTime::from_millis(now.timestamp_millis())
        };
        if let Some(thumb) = req.thumbnail {
            board_set.insert("thumbnail", thumb);
        }

        let _ = self
            .boards_col
            .update_one(
                doc! { "_id": board_id, "owner_id": owner_id },
                doc! { "$set": board_set },
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
                .filter(|t| !t.is_empty() && t.len() <= 30)
                .take(20)
                .collect();
            set_doc.insert("tags", norm_tags);
        }

        if let Some(fav) = req.is_favorite {
            set_doc.insert("is_favorite", fav);
        }

        if let Some(thumb_opt) = req.thumbnail {
            match thumb_opt {
                Some(t) => set_doc.insert("thumbnail", t),
                None => set_doc.insert("thumbnail", Bson::Null),
            };
        }

        let res = self
            .boards_col
            .update_one(
                doc! { "_id": board_id, "owner_id": owner_id },
                doc! { "$set": set_doc },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if res.matched_count == 0 {
            return Err(AppError::NotFound("Board not found.".to_string()));
        }

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

    /// RF-Q07: Duplicate board with full scene clone
    pub async fn duplicate_board(
        &self,
        owner_id: &str,
        board_id: &str,
    ) -> Result<BoardDto, AppError> {
        let source_board = self
            .boards_col
            .find_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Board not found.".to_string()))?;

        let source_scene = self
            .scenes_col
            .find_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Scene not found.".to_string()))?;

        let now = Utc::now();
        let new_board_id = uuid::Uuid::new_v4().to_string();
        let mut new_title = format!("{} (Copy)", source_board.title);
        if new_title.len() > 120 {
            new_title.truncate(120);
        }

        let new_board = Board {
            id: new_board_id.clone(),
            owner_id: owner_id.to_string(),
            group_id: source_board.group_id,
            title: new_title,
            tags: source_board.tags,
            is_favorite: false,
            thumbnail: source_board.thumbnail,
            is_deleted: false,
            deleted_at: None,
            last_opened_at: Some(now),
            created_at: now,
            updated_at: now,
        };

        self.boards_col
            .insert_one(&new_board)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let new_scene = BoardScene {
            id: new_board_id,
            owner_id: owner_id.to_string(),
            schema_version: source_scene.schema_version,
            revision: 1,
            last_client_save_id: None,
            content_hash: source_scene.content_hash,
            elements: source_scene.elements,
            viewport: source_scene.viewport,
            updated_at: now,
        };

        self.scenes_col
            .insert_one(&new_scene)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        Ok(self.to_board_dto(new_board))
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

    /// RF-Q06: Permanent delete single board and cascade scene + versions
    pub async fn permanent_delete(&self, owner_id: &str, board_id: &str) -> Result<(), AppError> {
        let res = self
            .boards_col
            .delete_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if res.deleted_count == 0 {
            return Err(AppError::NotFound("Board not found.".to_string()));
        }

        let _ = self
            .scenes_col
            .delete_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await;

        let _ = self
            .versions_col
            .delete_many(doc! { "board_id": board_id, "owner_id": owner_id })
            .await;

        Ok(())
    }

    /// RF-Q06: Empty trash permanently for user
    pub async fn empty_trash(&self, owner_id: &str) -> Result<u64, AppError> {
        let mut cursor = self
            .boards_col
            .find(doc! { "owner_id": owner_id, "is_deleted": true })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let mut trashed_ids = Vec::new();
        while cursor
            .advance()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        {
            let board = cursor
                .deserialize_current()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            trashed_ids.push(board.id);
        }

        if trashed_ids.is_empty() {
            return Ok(0);
        }

        let _ = self
            .scenes_col
            .delete_many(doc! { "_id": { "$in": &trashed_ids }, "owner_id": owner_id })
            .await;

        let _ = self
            .versions_col
            .delete_many(doc! { "board_id": { "$in": &trashed_ids }, "owner_id": owner_id })
            .await;

        let res = self
            .boards_col
            .delete_many(doc! { "_id": { "$in": &trashed_ids }, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        Ok(res.deleted_count)
    }

    /// RF-O03 / RF-O04: List all tags used by the user with board counts
    pub async fn list_tags(&self, owner_id: &str) -> Result<Vec<TagCountDto>, AppError> {
        let mut cursor = self
            .boards_col
            .find(doc! { "owner_id": owner_id, "is_deleted": false })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let mut counts: HashMap<String, u64> = HashMap::new();
        while cursor
            .advance()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        {
            let board = cursor
                .deserialize_current()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            for tag in board.tags {
                *counts.entry(tag).or_insert(0) += 1;
            }
        }

        let mut list: Vec<TagCountDto> = counts
            .into_iter()
            .map(|(tag, count)| TagCountDto { tag, count })
            .collect();
        list.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
        Ok(list)
    }

    /// RF-Q11: Create version snapshot
    pub async fn create_version(
        &self,
        owner_id: &str,
        board_id: &str,
        req: CreateVersionRequest,
    ) -> Result<BoardVersionDto, AppError> {
        let scene = self
            .scenes_col
            .find_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Board scene not found.".to_string()))?;

        let now = Utc::now();
        let version = BoardVersion {
            id: uuid::Uuid::new_v4().to_string(),
            board_id: board_id.to_string(),
            owner_id: owner_id.to_string(),
            revision: scene.revision,
            label: req.label,
            elements: scene.elements,
            viewport: scene.viewport,
            created_at: now,
        };

        self.versions_col
            .insert_one(&version)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        Ok(BoardVersionDto {
            id: version.id,
            board_id: version.board_id,
            revision: version.revision,
            label: version.label,
            created_at: version.created_at,
        })
    }

    /// RF-Q11: List version snapshots for a board
    pub async fn list_versions(
        &self,
        owner_id: &str,
        board_id: &str,
    ) -> Result<Vec<BoardVersionDto>, AppError> {
        let mut cursor = self
            .versions_col
            .find(doc! { "board_id": board_id, "owner_id": owner_id })
            .sort(doc! { "created_at": -1 })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let mut versions = Vec::new();
        while cursor
            .advance()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        {
            let v = cursor
                .deserialize_current()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            versions.push(BoardVersionDto {
                id: v.id,
                board_id: v.board_id,
                revision: v.revision,
                label: v.label,
                created_at: v.created_at,
            });
        }

        Ok(versions)
    }

    /// RF-Q11: Restore board scene from a historical version snapshot
    pub async fn restore_version(
        &self,
        owner_id: &str,
        board_id: &str,
        version_id: &str,
    ) -> Result<SceneDto, AppError> {
        let version = self
            .versions_col
            .find_one(doc! { "_id": version_id, "board_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Version snapshot not found.".to_string()))?;

        let current_scene = self
            .scenes_col
            .find_one(doc! { "_id": board_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Board scene not found.".to_string()))?;

        let next_rev = current_scene.revision + 1;
        let now = Utc::now();
        let elements_bson = to_bson(&version.elements)
            .map_err(|e| AppError::Internal(format!("Failed to serialize elements: {}", e)))?;

        self.scenes_col
            .update_one(
                doc! { "_id": board_id, "owner_id": owner_id },
                doc! {
                    "$set": {
                        "revision": next_rev as i64,
                        "elements": elements_bson,
                        "viewport": {
                            "x": version.viewport.x,
                            "y": version.viewport.y,
                            "zoom": version.viewport.zoom,
                        },
                        "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
                    }
                },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        self.get_scene(owner_id, board_id).await
    }

    fn to_board_dto(&self, board: Board) -> BoardDto {
        BoardDto {
            id: board.id,
            owner_id: board.owner_id,
            group_id: board.group_id,
            title: board.title,
            tags: board.tags,
            is_favorite: board.is_favorite,
            thumbnail: board.thumbnail,
            is_deleted: board.is_deleted,
            deleted_at: board.deleted_at,
            last_opened_at: board.last_opened_at,
            created_at: board.created_at,
            updated_at: board.updated_at,
        }
    }
}
