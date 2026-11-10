use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use tauri::Manager;
use warp::Filter;

#[derive(Serialize, Deserialize, Clone)]
struct ActiveSessionState {
    active: bool,
    rules_version: u64,
    #[serde(default = "default_task")]
    task: String,
    #[serde(default)]
    started_at: Option<String>,
    #[serde(default = "default_planned_minutes")]
    planned_minutes: u32,
    #[serde(default = "default_strictness")]
    strictness_mode: String,
    blocked_domains: Vec<String>,
    allowed_exceptions: Vec<String>,
}

fn default_task() -> String { "Focus Session".to_string() }
fn default_planned_minutes() -> u32 { 25 }
fn default_strictness() -> String { "standard".to_string() }

#[derive(Serialize, Deserialize)]
struct HealthResponse {
    status: String,
    bridge_port: u16,
    version: String,
}

#[derive(Serialize, Deserialize)]
struct BlockAttemptPayload {
    url: String,
    domain: String,
    rule_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct TaskPayload {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_estimated_minutes")]
    estimated_minutes: u32,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default = "default_status")]
    status: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
}

fn default_estimated_minutes() -> u32 { 30 }
fn default_priority() -> String { "high".to_string() }
fn default_status() -> String { "backlog".to_string() }

#[tauri::command]
async fn toggle_hud_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(widget) = app.get_webview_window("widget") {
        if widget.is_visible().unwrap_or(false) {
            let _ = widget.hide();
        } else {
            if let Ok(Some(monitor)) = widget.primary_monitor() {
                let size = monitor.size();
                let x = (size.width as i32) - 340;
                let y = 50;
                let _ = widget.set_position(tauri::PhysicalPosition::new(x, y));
            }
            let _ = widget.set_always_on_top(true);
            let _ = widget.show();
            let _ = widget.set_focus();
        }
    } else {
        if let Ok(builder) = tauri::WebviewWindowBuilder::new(
            &app,
            "widget",
            tauri::WebviewUrl::App("index.html#/widget".into()),
        )
        .title("FocusWatch HUD Widget")
        .inner_size(320.0, 160.0)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .skip_taskbar(true)
        .build()
        {
            if let Ok(Some(monitor)) = builder.primary_monitor() {
                let size = monitor.size();
                let x = (size.width as i32) - 340;
                let y = 50;
                let _ = builder.set_position(tauri::PhysicalPosition::new(x, y));
            }
            let _ = builder.show();
        }
    }
    Ok(())
}

#[tauri::command]
async fn show_hud_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(widget) = app.get_webview_window("widget") {
        if let Ok(Some(monitor)) = widget.primary_monitor() {
            let size = monitor.size();
            let x = (size.width as i32) - 340;
            let y = 50;
            let _ = widget.set_position(tauri::PhysicalPosition::new(x, y));
        }
        let _ = widget.set_always_on_top(true);
        let _ = widget.show();
    }
    Ok(())
}

#[tauri::command]
async fn hide_hud_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(widget) = app.get_webview_window("widget") {
        let _ = widget.hide();
    }
    Ok(())
}

pub fn run() {
    let state = Arc::new(RwLock::new(ActiveSessionState {
        active: false,
        rules_version: 1,
        task: "Deep Work Focus Session".to_string(),
        started_at: None,
        planned_minutes: 25,
        strictness_mode: "standard".to_string(),
        blocked_domains: vec![
            "youtube.com".to_string(),
            "instagram.com".to_string(),
            "reddit.com".to_string(),
            "x.com".to_string(),
            "facebook.com".to_string(),
            "linkedin.com".to_string(),
        ],
        allowed_exceptions: vec![
            "music.youtube.com".to_string(),
            "studio.youtube.com".to_string(),
        ],
    }));

    let tasks_state: Arc<RwLock<Vec<TaskPayload>>> = Arc::new(RwLock::new(Vec::new()));
    let notes_state: Arc<RwLock<serde_json::Value>> = Arc::new(RwLock::new(serde_json::json!([])));

    let state_get = Arc::clone(&state);
    let state_post = Arc::clone(&state);

    let tasks_get = Arc::clone(&tasks_state);
    let tasks_post = Arc::clone(&tasks_state);
    let tasks_delete = Arc::clone(&tasks_state);

    let notes_get = Arc::clone(&notes_state);
    let notes_post = Arc::clone(&notes_state);

    // Spawn Local Extension Bridge HTTP Server on 127.0.0.1:47777
    tokio::spawn(async move {
        // GET /health
        let health_route = warp::path("health")
            .and(warp::get())
            .map(|| {
                warp::reply::json(&HealthResponse {
                    status: "ok".to_string(),
                    bridge_port: 47777,
                    version: "0.1.0".to_string(),
                })
            });

        // GET /session/active
        let active_session_get = warp::path!("session" / "active")
            .and(warp::get())
            .map(move || {
                let current = state_get.read().unwrap().clone();
                warp::reply::json(&current)
            });

        // POST /session/active
        let active_session_post = warp::path!("session" / "active")
            .and(warp::post())
            .and(warp::body::json())
            .map(move |incoming: ActiveSessionState| {
                if let Ok(mut lock) = state_post.write() {
                    lock.active = incoming.active;
                    lock.rules_version = incoming.rules_version;
                    lock.task = incoming.task;
                    lock.started_at = incoming.started_at;
                    lock.planned_minutes = incoming.planned_minutes;
                    lock.strictness_mode = incoming.strictness_mode;
                    lock.blocked_domains = incoming.blocked_domains;
                    lock.allowed_exceptions = incoming.allowed_exceptions;
                }
                warp::reply::json(&serde_json::json!({ "status": "ok" }))
            });

        // GET /tasks
        let tasks_get_route = warp::path("tasks")
            .and(warp::get())
            .map(move || {
                let list = tasks_get.read().unwrap().clone();
                warp::reply::json(&list)
            });

        // POST /tasks
        let tasks_post_route = warp::path("tasks")
            .and(warp::post())
            .and(warp::body::json())
            .map(move |mut incoming: TaskPayload| {
                if incoming.id.is_empty() {
                    incoming.id = format!("task_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
                }
                if let Ok(mut lock) = tasks_post.write() {
                    let mut found = false;
                    for t in lock.iter_mut() {
                        if t.id == incoming.id {
                            *t = incoming.clone();
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        lock.insert(0, incoming.clone());
                    }
                }
                warp::reply::json(&serde_json::json!({ "status": "ok", "task": incoming }))
            });

        // DELETE /tasks
        let tasks_delete_route = warp::path("tasks")
            .and(warp::delete())
            .and(warp::query::<std::collections::HashMap<String, String>>())
            .map(move |query: std::collections::HashMap<String, String>| {
                if let Some(target_id) = query.get("id") {
                    if let Ok(mut lock) = tasks_delete.write() {
                        lock.retain(|t| &t.id != target_id);
                    }
                }
                warp::reply::json(&serde_json::json!({ "status": "ok" }))
            });

        // GET /notes
        let notes_get_route = warp::path("notes")
            .and(warp::get())
            .map(move || {
                let list = notes_get.read().unwrap().clone();
                warp::reply::json(&list)
            });

        // POST /notes
        let notes_post_route = warp::path("notes")
            .and(warp::post())
            .and(warp::body::json())
            .map(move |incoming: serde_json::Value| {
                if let Ok(mut lock) = notes_post.write() {
                    *lock = incoming;
                }
                warp::reply::json(&serde_json::json!({ "status": "ok" }))
            });

        // POST /attempts
        let attempts_route = warp::path("attempts")
            .and(warp::post())
            .and(warp::body::json())
            .map(|_payload: BlockAttemptPayload| {
                warp::reply::json(&serde_json::json!({ "recorded": true }))
            });

        let cors = warp::cors()
            .allow_any_origin()
            .allow_methods(vec!["GET", "POST", "OPTIONS", "DELETE"])
            .allow_headers(vec!["Content-Type", "Authorization"]);

        let routes = health_route
            .or(active_session_get)
            .or(active_session_post)
            .or(tasks_get_route)
            .or(tasks_post_route)
            .or(tasks_delete_route)
            .or(notes_get_route)
            .or(notes_post_route)
            .or(attempts_route)
            .with(cors);

        let addr: SocketAddr = ([127, 0, 0, 1], 47777).into();

        warp::serve(routes).run(addr).await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            toggle_hud_widget,
            show_hud_widget,
            hide_hud_widget
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
