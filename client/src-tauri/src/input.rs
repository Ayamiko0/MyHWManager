use serde::Deserialize;
use enigo::{Enigo, Mouse, Settings, Coordinate, Button, Direction};

#[derive(Deserialize)]
pub struct RemoteInput {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub button: Option<u8>,
    pub key: Option<String>,
}

#[tauri::command]
pub async fn simulate_input(event: RemoteInput) -> Result<(), String> {
    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
        match event.msg_type.as_str() {
            "mousemove" => {
                if let (Some(x), Some(y)) = (event.x, event.y) {
                    let _ = enigo.move_mouse(x as i32, y as i32, Coordinate::Abs);
                }
            }
            "mousedown" => {
                let btn = match event.button.unwrap_or(0) {
                    2 => Button::Right,
                    1 => Button::Middle,
                    _ => Button::Left,
                };
                let _ = enigo.button(btn, Direction::Press);
            }
            "mouseup" => {
                let btn = match event.button.unwrap_or(0) {
                    2 => Button::Right,
                    1 => Button::Middle,
                    _ => Button::Left,
                };
                let _ = enigo.button(btn, Direction::Release);
            }
            "keydown" => {
                // To be implemented
            }
            _ => {}
        }
    }
    Ok(())
}
