use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State};

pub struct PtyState {
    pub pty_master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    pub pty_writer: Mutex<Option<Box<dyn Write + Send>>>,
}

#[tauri::command]
pub fn spawn_pty(app: AppHandle, state: State<'_, PtyState>) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("bash");
    cmd.env("TERM", "xterm-256color");

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    
    *state.pty_master.lock().unwrap() = Some(pair.master);
    *state.pty_writer.lock().unwrap() = Some(writer);

    thread::spawn(move || {
        let mut buf = [0; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    let _ = app.emit("pty_data", data);
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn write_pty(data: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut lock = state.pty_writer.lock().unwrap();
    if let Some(writer) = lock.as_mut() {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_pty(rows: u16, cols: u16, state: State<'_, PtyState>) -> Result<(), String> {
    let lock = state.pty_master.lock().unwrap();
    if let Some(master) = lock.as_ref() {
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn kill_pty(state: State<'_, PtyState>) -> Result<(), String> {
    let mut lock = state.pty_master.lock().unwrap();
    *lock = None; // Dropping the master closes the PTY
    Ok(())
}
