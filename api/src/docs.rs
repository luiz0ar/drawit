use utoipa::{
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi,
};

use crate::{
    dto::{auth::*, board::*, group::*},
    error::{InvalidParam, ProblemDetails},
    routes,
};

pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                SecurityScheme::Http(
                    HttpBuilder::new()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .build(),
                ),
            );
        }
    }
}

#[derive(OpenApi)]
#[openapi(
    paths(
        routes::health::health,
        routes::health::ready,
        routes::auth::register,
        routes::auth::login,
        routes::auth::verify_email,
        routes::auth::resend_verification,
        routes::auth::forgot_password,
        routes::auth::reset_password,
        routes::auth::refresh,
        routes::auth::logout,
        routes::auth::logout_all,
        routes::auth::change_password,
        routes::users::me,
        routes::users::update_preferences,
        routes::groups::list_groups,
        routes::groups::create_group,
        routes::groups::update_group,
        routes::groups::delete_group,
        routes::boards::list_boards,
        routes::boards::create_board,
        routes::boards::get_board,
        routes::boards::update_board,
        routes::boards::duplicate_board,
        routes::boards::delete_board,
        routes::boards::permanent_delete_board,
        routes::boards::restore_board,
        routes::boards::empty_trash,
        routes::boards::list_tags,
        routes::boards::get_scene,
        routes::boards::save_scene,
        routes::boards::list_versions,
        routes::boards::create_version,
        routes::boards::restore_version,
        routes::boards::list_components,
    ),
    components(schemas(
        RegisterRequest,
        RegisterResponse,
        LoginRequest,
        VerifyEmailRequest,
        ResendVerificationRequest,
        ChangePasswordRequest,
        UpdatePreferencesRequest,
        UserDto,
        AuthResponse,
        CreateBoardRequest,
        UpdateBoardRequest,
        SaveSceneRequest,
        BoardDto,
        SceneDto,
        ViewportDto,
        BoardVersionDto,
        TagCountDto,
        CreateVersionRequest,
        CreateGroupRequest,
        UpdateGroupRequest,
        GroupDto,
        ProblemDetails,
        InvalidParam,
    )),
    tags(
        (name = "Auth", description = "Authentication, registration, email verification, and session lifecycle"),
        (name = "Users", description = "Current authenticated user profile and client preferences"),
        (name = "Boards", description = "Whiteboard management, canvas scene synchronization, and version control"),
        (name = "Groups", description = "Board organization folders and color tags"),
        (name = "Health", description = "Liveness and readiness probes")
    ),
    modifiers(&SecurityAddon),
    info(
        title = "DrawIt API Reference",
        version = "0.1.0",
        description = "Collaborative System Design Whiteboard REST API documented via Scalar"
    )
)]
pub struct ApiDoc;
