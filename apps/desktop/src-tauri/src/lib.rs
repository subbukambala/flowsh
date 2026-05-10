use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{Emitter, State};

struct ShellSession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

#[derive(Default)]
struct AppState {
    session: Mutex<Option<ShellSession>>,
}

#[derive(Clone, Serialize)]
struct ShellOutputPayload {
    chunk: String,
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

fn shell_kind(shell_path: &str) -> &str {
    shell_path
        .rsplit('/')
        .next()
        .unwrap_or(shell_path)
        .split_whitespace()
        .next()
        .unwrap_or(shell_path)
}

fn initialize_shell_integration(
    shell_path: &str,
    writer: &mut Box<dyn Write + Send>,
) -> Result<(), String> {
    let script = match shell_kind(shell_path) {
        "zsh" => Some(
            "autoload -Uz add-zsh-hook >/dev/null 2>&1\n\
             __flowsh_preexec(){ printf '\\033]133;C;\\007'; }\n\
             __flowsh_precmd(){ local __s=\"$?\"; printf '\\033]133;D;%s\\007\\033]133;A\\007' \"$__s\"; }\n\
             add-zsh-hook preexec __flowsh_preexec\n\
             add-zsh-hook precmd __flowsh_precmd\n\
             printf '\\033]133;A\\007'\n",
        ),
        "bash" => Some(
            "__flowsh_preexec(){ printf '\\033]133;C;\\007'; }\n\
             __flowsh_precmd(){ local __s=\"$?\"; printf '\\033]133;D;%s\\007\\033]133;A\\007' \"$__s\"; }\n\
             trap '__flowsh_preexec' DEBUG\n\
             PROMPT_COMMAND=\"__flowsh_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}\"\n\
             printf '\\033]133;A\\007'\n",
        ),
        "fish" => Some(
            "function __flowsh_preexec --on-event fish_preexec\n\
             printf '\\033]133;C;\\a'\n\
             end\n\
             function __flowsh_postexec --on-event fish_postexec\n\
             set -l __s $status\n\
             printf '\\033]133;D;%s\\a\\033]133;A\\a' $__s\n\
             end\n\
             printf '\\033]133;A\\a'\n",
        ),
        _ => None,
    };

    let Some(script) = script else {
        return Ok(());
    };

    writer
        .write_all(script.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|error| format!("failed to initialize shell integration: {error}"))
}

#[tauri::command]
fn start_shell(
    cols: u16,
    rows: u16,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut session_slot = state
        .session
        .lock()
        .map_err(|_| "failed to lock shell session".to_string())?;

    if session_slot.is_some() {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("failed to open pty: {error}"))?;

    let shell = default_shell();
    let mut command = CommandBuilder::new(shell.clone());
    command.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("failed to spawn shell: {error}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("failed to clone pty reader: {error}"))?;
    let mut writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("failed to acquire pty writer: {error}"))?;

    if let Err(error) = initialize_shell_integration(&shell, &mut writer) {
        eprintln!("{error}");
    }

    let app_for_reader = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(read_len) => {
                    let chunk = String::from_utf8_lossy(&buf[..read_len]).to_string();
                    if app_for_reader
                        .emit("pty-output", ShellOutputPayload { chunk })
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    *session_slot = Some(ShellSession {
        master: pair.master,
        writer,
        child,
    });

    Ok(())
}

#[tauri::command]
fn write_to_shell(data: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut session_slot = state
        .session
        .lock()
        .map_err(|_| "failed to lock shell session".to_string())?;

    let Some(session) = session_slot.as_mut() else {
        return Err("shell not started".to_string());
    };

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| format!("failed to write to pty: {error}"))?;
    session
        .writer
        .flush()
        .map_err(|error| format!("failed to flush pty: {error}"))?;
    Ok(())
}

#[tauri::command]
fn resize_shell(cols: u16, rows: u16, state: State<'_, AppState>) -> Result<(), String> {
    let mut session_slot = state
        .session
        .lock()
        .map_err(|_| "failed to lock shell session".to_string())?;

    let Some(session) = session_slot.as_mut() else {
        return Ok(());
    };

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("failed to resize pty: {error}"))?;
    Ok(())
}

#[tauri::command]
fn stop_shell(state: State<'_, AppState>) -> Result<(), String> {
    let mut session_slot = state
        .session
        .lock()
        .map_err(|_| "failed to lock shell session".to_string())?;

    if let Some(mut session) = session_slot.take() {
        session
            .child
            .kill()
            .map_err(|error| format!("failed to stop shell: {error}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_shell,
            write_to_shell,
            resize_shell,
            stop_shell
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
