# Flowsh Desktop (Phase 0.2.1)
Terminal wrapper + command block MVP using Tauri + React + xterm.

## What this phase includes
- Open desktop app and spawn the user default shell (`$SHELL`, fallback `/bin/zsh`)
- Send keyboard input to shell
- Render shell output in xterm
- Resize handling (window/layout changes resize PTY)
- Copy/Paste support
- Ctrl+C passthrough to shell
- Warp-style command blocks panel
- Command starts when Enter is pressed
- Output is streamed into the active block
- Block is marked complete from shell integration markers with exit code
- Prompt-like completion fallback remains available when markers are missing

## Prerequisites
- Node.js + npm
- Rust toolchain (`rustup`)
- Tauri system prerequisites for macOS/Linux/Windows

## Run locally
```bash
npm install
npm run tauri dev
```
