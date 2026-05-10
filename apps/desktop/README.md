# Flowsh Desktop (Phase 0.1)
Terminal wrapper MVP using Tauri + React + xterm.

## What this phase includes
- Open desktop app and spawn the user default shell (`$SHELL`, fallback `/bin/zsh`)
- Send keyboard input to shell
- Render shell output in xterm
- Resize handling (window/layout changes resize PTY)
- Copy/Paste support
- Ctrl+C passthrough to shell

## Prerequisites
- Node.js + npm
- Rust toolchain (`rustup`)
- Tauri system prerequisites for macOS/Linux/Windows

## Run locally
```bash
npm install
npm run tauri dev
```
