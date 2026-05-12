#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tracing_subscriber::EnvFilter;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new("info"))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Tray icon com menu
            let quit = MenuItem::with_id(app, "quit", "Encerrar helper", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Garmin Flight Video Helper — rodando")
                .on_menu_event(|app, event| {
                    if event.id == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            // Iniciar servidor HTTP em background
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tauri_video_helper_lib::server::start(handle).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o helper");
}
