use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};

#[derive(Serialize)]
pub struct FileNode {
    id: String,
    parent_id: Option<String>,
    name: String,
    is_dir: bool,
    size: u64,
}

#[derive(Serialize)]
pub struct FsResponse {
    #[serde(rename = "type")]
    msg_type: String,
    request_id: String,
    data: Option<serde_json::Value>,
    error: Option<String>,
}

#[derive(Deserialize)]
pub struct FsRequest {
    request_id: String,
    action: String,
    path: String,
    name: Option<String>,
    data: Option<String>,
}

use std::sync::Mutex;
use tauri::{AppHandle, State, Manager};

pub struct AllowedDirsState {
    pub dirs: Mutex<Vec<String>>,
}

// Helper to load/save config
fn get_config_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_config_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")).join("allowed_dirs.json")
}

pub fn load_allowed_dirs(app: &AppHandle) -> Vec<String> {
    let path = get_config_path(app);
    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(dirs) = serde_json::from_str(&data) {
            return dirs;
        }
    }
    Vec::new()
}

fn save_allowed_dirs(app: &AppHandle, dirs: &[String]) {
    let path = get_config_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string(dirs) {
        let _ = fs::write(path, data);
    }
}

#[tauri::command]
pub fn get_allowed_dirs(state: State<'_, AllowedDirsState>) -> Vec<String> {
    state.dirs.lock().unwrap().clone()
}

#[tauri::command]
pub fn add_allowed_dir(app: AppHandle, dir: String, state: State<'_, AllowedDirsState>) -> Result<(), String> {
    let mut dirs = state.dirs.lock().unwrap();
    if !dirs.contains(&dir) {
        dirs.push(dir.clone());
        save_allowed_dirs(&app, &dirs);
    }
    Ok(())
}

#[tauri::command]
pub fn remove_allowed_dir(app: AppHandle, dir: String, state: State<'_, AllowedDirsState>) -> Result<(), String> {
    let mut dirs = state.dirs.lock().unwrap();
    if let Some(pos) = dirs.iter().position(|x| x == &dir) {
        dirs.remove(pos);
        save_allowed_dirs(&app, &dirs);
    }
    Ok(())
}

fn is_path_allowed(path: &Path, state: &State<'_, AllowedDirsState>) -> bool {
    let dirs = state.dirs.lock().unwrap();
    
    // Canonicalize parent if path doesn't exist
    let path_canon = if path.exists() {
        path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
    } else if let Some(parent) = path.parent() {
        let mut p = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
        if let Some(file_name) = path.file_name() {
            p.push(file_name);
        }
        p
    } else {
        path.to_path_buf()
    };
    
    for dir in dirs.iter() {
        let allowed_canon = Path::new(dir).canonicalize().unwrap_or_else(|_| Path::new(dir).to_path_buf());
        if path_canon.starts_with(&allowed_canon) {
            return true;
        }
    }
    false
}

#[tauri::command]
pub fn handle_fs_request(request: FsRequest, state: State<'_, AllowedDirsState>) -> FsResponse {
    // Before performing any action, verify the target path
    let p = Path::new(&request.path);
    let is_root = request.path == "/" || request.path == "";
    
    if !is_root && !is_path_allowed(p, &state) {
        return error_res(&request.request_id, format!("Access Denied: Path '{}' is not in an allowed directory", request.path));
    }

    if is_root && request.action == "list" {
        let mut nodes = Vec::new();
        let dirs = state.dirs.lock().unwrap();
        for dir in dirs.iter() {
            let name = Path::new(dir).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| dir.clone());
            nodes.push(FileNode {
                id: dir.clone(),
                parent_id: Some("/".to_string()),
                name: name,
                is_dir: true,
                size: 0,
            });
        }
        return FsResponse {
            msg_type: "fs_response".to_string(),
            request_id: request.request_id,
            data: Some(serde_json::json!(nodes)),
            error: None,
        };
    }

    if is_root {
        return error_res(&request.request_id, "Cannot perform this action on root".to_string());
    }

    if request.action == "rename" || request.action == "move" {
        if let Some(ref target) = request.name {
            let target_p = Path::new(target);
            if !is_path_allowed(target_p, &state) {
                return error_res(&request.request_id, format!("Access Denied: Target path '{}' is not in an allowed directory", target));
            }
        } else {
            return error_res(&request.request_id, "Missing target path for rename/move".to_string());
        }
    }

    match request.action.as_str() {
        "list" => list_dir(&request.path, &request.request_id),
        "create_folder" => create_folder(&request.path, &request.name.unwrap_or_default(), &request.request_id),
        "delete" => delete_path(&request.path, &request.request_id),
        "rename" => rename_path(&request.path, &request.name.unwrap_or_default(), &request.request_id),
        "move" => rename_path(&request.path, &request.name.unwrap_or_default(), &request.request_id), // move is same as rename
        "upload" => upload_file(&request.path, &request.name.unwrap_or_default(), request.data, &request.request_id),
        "download" => download_file(&request.path, &request.request_id),
        _ => FsResponse {
            msg_type: "fs_response".to_string(),
            request_id: request.request_id,
            data: None,
            error: Some("Unknown action".to_string()),
        }
    }
}

fn error_res(req_id: &str, err: impl std::fmt::Display) -> FsResponse {
    FsResponse {
        msg_type: "fs_response".to_string(),
        request_id: req_id.to_string(),
        data: None,
        error: Some(err.to_string()),
    }
}

fn list_dir(path: &str, req_id: &str) -> FsResponse {
    let p = Path::new(path);
    if !p.exists() || !p.is_dir() {
        return error_res(req_id, "Path does not exist or is not a directory");
    }

    let mut nodes = Vec::new();
    let parent_id = p.parent().map(|d| d.to_string_lossy().into_owned());

    match fs::read_dir(p) {
        Ok(entries) => {
            for entry in entries.filter_map(Result::ok) {
                if let Ok(metadata) = entry.metadata() {
                    nodes.push(FileNode {
                        id: entry.path().to_string_lossy().into_owned(),
                        parent_id: Some(path.to_string()),
                        name: entry.file_name().to_string_lossy().into_owned(),
                        is_dir: metadata.is_dir(),
                        size: metadata.len(),
                    });
                }
            }
            FsResponse {
                msg_type: "fs_response".to_string(),
                request_id: req_id.to_string(),
                data: Some(serde_json::json!(nodes)),
                error: None,
            }
        }
        Err(e) => error_res(req_id, e),
    }
}

fn create_folder(parent: &str, name: &str, req_id: &str) -> FsResponse {
    let p = Path::new(parent).join(name);
    match fs::create_dir_all(&p) {
        Ok(_) => FsResponse {
            msg_type: "fs_response".to_string(),
            request_id: req_id.to_string(),
            data: Some(serde_json::json!({"status": "ok"})),
            error: None,
        },
        Err(e) => error_res(req_id, e),
    }
}

fn delete_path(path: &str, req_id: &str) -> FsResponse {
    let p = Path::new(path);
    if !p.exists() {
        return error_res(req_id, "Path not found");
    }

    let res = if p.is_dir() {
        fs::remove_dir_all(p)
    } else {
        fs::remove_file(p)
    };

    match res {
        Ok(_) => FsResponse {
            msg_type: "fs_response".to_string(),
            request_id: req_id.to_string(),
            data: Some(serde_json::json!({"status": "ok"})),
            error: None,
        },
        Err(e) => error_res(req_id, e),
    }
}

fn rename_path(path: &str, new_path: &str, req_id: &str) -> FsResponse {
    let p1 = Path::new(path);
    let p2 = Path::new(new_path);
    if !p1.exists() {
        return error_res(req_id, "Source path not found");
    }

    match fs::rename(p1, p2) {
        Ok(_) => FsResponse {
            msg_type: "fs_response".to_string(),
            request_id: req_id.to_string(),
            data: Some(serde_json::json!({"status": "ok"})),
            error: None,
        },
        Err(e) => error_res(req_id, e),
    }
}

fn upload_file(parent: &str, name: &str, data: Option<String>, req_id: &str) -> FsResponse {
    let b64 = match data {
        Some(d) => d,
        None => return error_res(req_id, "No data provided"),
    };

    let p = Path::new(parent).join(name);
    let bytes = match BASE64_STANDARD.decode(b64) {
        Ok(b) => b,
        Err(e) => return error_res(req_id, format!("Base64 decode failed: {}", e)),
    };

    match fs::write(&p, bytes) {
        Ok(_) => FsResponse {
            msg_type: "fs_response".to_string(),
            request_id: req_id.to_string(),
            data: Some(serde_json::json!({"status": "ok"})),
            error: None,
        },
        Err(e) => error_res(req_id, e),
    }
}

fn download_file(path: &str, req_id: &str) -> FsResponse {
    let p = Path::new(path);
    if !p.is_file() {
        return error_res(req_id, "Path is not a file");
    }

    match fs::read(p) {
        Ok(bytes) => {
            let b64 = BASE64_STANDARD.encode(bytes);
            FsResponse {
                msg_type: "fs_response".to_string(),
                request_id: req_id.to_string(),
                data: Some(serde_json::json!(b64)),
                error: None,
            }
        }
        Err(e) => error_res(req_id, e),
    }
}
