use chrono::Utc;
use mongodb::{
    bson::{doc, DateTime as BsonDateTime},
    Collection, Database,
};

use crate::{
    dto::{CreateGroupRequest, GroupDto, UpdateGroupRequest},
    error::{AppError, InvalidParam},
    models::{Board, Group},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GroupDeleteAction {
    Move,
    Trash,
}

pub struct GroupService {
    groups_col: Collection<Group>,
    boards_col: Collection<Board>,
}

impl GroupService {
    pub fn new(db: &Database) -> Self {
        Self {
            groups_col: db.collection("groups"),
            boards_col: db.collection("boards"),
        }
    }

    pub async fn list_groups(&self, owner_id: &str) -> Result<Vec<GroupDto>, AppError> {
        let mut cursor = self
            .groups_col
            .find(doc! { "owner_id": owner_id })
            .sort(doc! { "name": 1 })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let mut groups = Vec::new();
        while cursor
            .advance()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        {
            let group = cursor
                .deserialize_current()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            groups.push(GroupDto {
                id: group.id,
                owner_id: group.owner_id,
                name: group.name,
                parent_id: group.parent_id,
                color: group.color,
                created_at: group.created_at,
                updated_at: group.updated_at,
            });
        }

        Ok(groups)
    }

    pub async fn create_group(
        &self,
        owner_id: &str,
        req: CreateGroupRequest,
    ) -> Result<GroupDto, AppError> {
        let name = req.name.trim().to_string();
        if name.is_empty() || name.len() > 80 {
            return Err(AppError::Validation(vec![InvalidParam {
                name: "name".to_string(),
                reason: "Group name must be between 1 and 80 characters.".to_string(),
            }]));
        }

        let now = Utc::now();
        let group_id = uuid::Uuid::new_v4().to_string();

        let group = Group {
            id: group_id.clone(),
            owner_id: owner_id.to_string(),
            name,
            parent_id: req.parent_id,
            color: req.color,
            created_at: now,
            updated_at: now,
        };

        self.groups_col
            .insert_one(&group)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        Ok(GroupDto {
            id: group.id,
            owner_id: group.owner_id,
            name: group.name,
            parent_id: group.parent_id,
            color: group.color,
            created_at: group.created_at,
            updated_at: group.updated_at,
        })
    }

    pub async fn update_group(
        &self,
        owner_id: &str,
        group_id: &str,
        req: UpdateGroupRequest,
    ) -> Result<GroupDto, AppError> {
        let now = Utc::now();
        let mut set_doc = doc! {
            "updated_at": BsonDateTime::from_millis(now.timestamp_millis())
        };

        if let Some(name) = req.name {
            let n = name.trim().to_string();
            if n.is_empty() || n.len() > 80 {
                return Err(AppError::Validation(vec![InvalidParam {
                    name: "name".to_string(),
                    reason: "Group name must be between 1 and 80 characters.".to_string(),
                }]));
            }
            set_doc.insert("name", n);
        }

        if let Some(color) = req.color {
            set_doc.insert("color", color);
        }

        if let Some(parent_id) = req.parent_id {
            set_doc.insert("parent_id", parent_id);
        }

        let res = self
            .groups_col
            .update_one(
                doc! { "_id": group_id, "owner_id": owner_id },
                doc! { "$set": set_doc },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if res.matched_count == 0 {
            return Err(AppError::NotFound("Group not found.".to_string()));
        }

        let updated = self
            .groups_col
            .find_one(doc! { "_id": group_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Group not found.".to_string()))?;

        Ok(GroupDto {
            id: updated.id,
            owner_id: updated.owner_id,
            name: updated.name,
            parent_id: updated.parent_id,
            color: updated.color,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
        })
    }

    pub async fn delete_group(
        &self,
        owner_id: &str,
        group_id: &str,
        action: GroupDeleteAction,
    ) -> Result<(), AppError> {
        let res = self
            .groups_col
            .delete_one(doc! { "_id": group_id, "owner_id": owner_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if res.deleted_count == 0 {
            return Err(AppError::NotFound("Group not found.".to_string()));
        }

        let now = Utc::now();
        match action {
            GroupDeleteAction::Move => {
                // Move boards in this group to ungrouped (null)
                self.boards_col
                    .update_many(
                        doc! { "owner_id": owner_id, "group_id": group_id },
                        doc! {
                            "$set": {
                                "group_id": mongodb::bson::Bson::Null,
                                "updated_at": BsonDateTime::from_millis(now.timestamp_millis())
                            }
                        },
                    )
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            }
            GroupDeleteAction::Trash => {
                // Soft delete all boards in this group
                self.boards_col
                    .update_many(
                        doc! { "owner_id": owner_id, "group_id": group_id },
                        doc! {
                            "$set": {
                                "is_deleted": true,
                                "deleted_at": BsonDateTime::from_millis(now.timestamp_millis()),
                                "updated_at": BsonDateTime::from_millis(now.timestamp_millis())
                            }
                        },
                    )
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            }
        }

        Ok(())
    }
}
