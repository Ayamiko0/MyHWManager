use serde::Serialize;
use std::process::Command;
use std::thread;
use std::time::Duration;
use sysinfo::{Components, Disks, Networks, System};
use tauri::{Emitter, Manager};

mod input;
mod terminal;
mod fs;

#[derive(Serialize)]
pub struct DiskInfo {
    name: String,
    mount_point: String,
    total_space: u64,
    available_space: u64,
    is_removable: bool,
}

#[derive(Serialize)]
pub struct HardwareInfo {
    os_name: String,
    os_version: String,
    host_name: String,
    cpu_name: String,
    cpu_cores: usize,
    total_memory: u64,
    used_memory: u64,
    gpu_name: String,
    disks: Vec<DiskInfo>,
}

fn get_linux_gpu() -> String {
    let output = Command::new("sh")
        .arg("-c")
        .arg("lspci | grep -i 'vga\\|3d\\|display' | cut -d ':' -f 3- | sed 's/^ //'")
        .output();
        
    if let Ok(out) = output {
        let result = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !result.is_empty() {
            return result;
        }
    }
    "Generic / Unknown Graphics Adapter".to_string()
}

#[tauri::command]
fn get_hardware_info() -> HardwareInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let disks = Disks::new_with_refreshed_list();
    let mut disk_list = Vec::new();
    for disk in &disks {
        disk_list.push(DiskInfo {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            is_removable: disk.is_removable(),
        });
    }

    HardwareInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        host_name: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
        cpu_name: sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        cpu_cores: sys.cpus().len(),
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        gpu_name: get_linux_gpu(),
        disks: disk_list,
    }
}

// ----------- REALTIME STRUCTS -----------
#[derive(Serialize, Clone)]
pub struct CpuData {
    name: String,
    usage: f32,
}

#[derive(Serialize, Clone)]
pub struct NetworkData {
    download_bytes_per_sec: u64,
    upload_bytes_per_sec: u64,
}

#[derive(Serialize, Clone)]
pub struct TempData {
    label: String,
    temperature: f32,
}

#[derive(Serialize, Clone)]
pub struct RealtimeStats {
    cpu_cores: Vec<CpuData>,
    global_cpu_usage: f32,
    used_memory: u64,
    temps: Vec<TempData>,
    network: NetworkData,
}




pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dirs = fs::load_allowed_dirs(app.handle());
            app.manage(fs::AllowedDirsState {
                dirs: std::sync::Mutex::new(dirs),
            });

            app.manage(terminal::PtyState {
                pty_master: std::sync::Mutex::new(None),
                pty_writer: std::sync::Mutex::new(None),
            });

            // ── Enable WebRTC / media-stream in the WebView on Linux ──────────────
            // WebKitGTK requires explicit permission grants for getUserMedia and
            // getDisplayMedia. We call with_webview to reach the underlying GTK settings.
            #[cfg(target_os = "linux")]
            {
                let main_window = app.get_webview_window("main")
                    .expect("Main window not found");

                main_window
                    .with_webview(|webview| {
                        use webkit2gtk::WebViewExt;
                        use webkit2gtk::SettingsExt;
                        
                        // In Tauri v2, webview.inner() is typically an Rc<webkit2gtk::WebView> or similar
                        // that implements WebViewExt.
                        let wv = webview.inner();
                        if let Some(settings) = wv.settings() {
                            settings.set_enable_media_stream(true);
                            settings.set_enable_webrtc(true);
                        }

                        // Auto-allow permission requests (like screen sharing)
                        wv.connect_permission_request(|_wv, request| {
                            use webkit2gtk::PermissionRequestExt;
                            request.allow();
                            true
                        });
                    })
                    .ok();
            }

            let app_handle = app.handle().clone();

            // Background thread to poll dynamic hardware info
            thread::spawn(move || {
                let mut sys = System::new_all();
                let mut components = Components::new_with_refreshed_list();
                let mut networks = Networks::new_with_refreshed_list();
                
                // Keep track of the last time we measured network to calculate speed.
                // refresh() calculates the diff since the last refresh, so if we refresh ~1s, it's natively B/s.
                loop {
                    sys.refresh_cpu_usage();
                    sys.refresh_memory();
                    components.refresh(true);
                    networks.refresh(true);

                    let global_cpu_usage = sys.global_cpu_usage();

                    let mut cpu_cores = Vec::new();
                    for cpu in sys.cpus() {
                        cpu_cores.push(CpuData {
                            name: cpu.name().to_string(),
                            usage: cpu.cpu_usage(),
                        });
                    }

                    let mut temps = Vec::new();
                    for component in &components {
                        temps.push(TempData {
                            label: component.label().to_string(),
                            temperature: component.temperature().unwrap_or(0.0),
                        });
                    }

                    let mut dl = 0;
                    let mut ul = 0;
                    for (_name, data) in &networks {
                        dl += data.received();
                        ul += data.transmitted();
                    }

                    let stats = RealtimeStats {
                        cpu_cores,
                        global_cpu_usage,
                        used_memory: sys.used_memory(),
                        temps,
                        network: NetworkData {
                            download_bytes_per_sec: dl,
                            upload_bytes_per_sec: ul,
                        },
                    };

                    let _ = app_handle.emit("hardware-telemetry", stats);

                    // Wait 1 second before polling again
                    thread::sleep(Duration::from_millis(1000));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_hardware_info,
            input::simulate_input,
            terminal::spawn_pty,
            terminal::write_pty,
            terminal::resize_pty,
            terminal::kill_pty,
            fs::handle_fs_request,
            fs::get_allowed_dirs,
            fs::add_allowed_dir,
            fs::remove_allowed_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
