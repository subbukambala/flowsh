# flowsh
Flowsh is a modern terminal workspace.  
Current implementation status: **Phase 0.2 command blocks** in `apps/desktop`.

## Current scope (Phase 0.2)
The desktop app currently supports:
- Launching the user’s default shell (`$SHELL`, fallback `/bin/zsh`)
- Interactive keyboard input
- Terminal output rendering via xterm
- Terminal resize handling
- Copy/paste support
- `Ctrl+C` passthrough
- Command blocks in the left panel
- Block lifecycle tracking:
  - Block starts when Enter is pressed
  - PTY output streams into the active block
  - Block ends when prompt-like output returns (simple heuristic)

## Repository layout
- `apps/desktop` → Tauri + React desktop app (active implementation)
- `desktop` → currently unused placeholder directory

## Prerequisites
- Node.js + npm
- Rust toolchain (`rustup`, includes `cargo`)
- Tauri prerequisites for your OS: https://tauri.app/start/prerequisites/

## Quick start
From repo root:

```bash
npm install --prefix apps/desktop
source "$HOME/.cargo/env"
npm run --prefix apps/desktop tauri dev
```

## Build checks
From repo root:

```bash
npm run --prefix apps/desktop build
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Manual validation checklist
After launching `tauri dev`, validate:
1. Shell prompt appears automatically.
2. Run `pwd` and `ls`; confirm a new command block is created for each command.
3. Confirm each block status changes from `running` to `success` after prompt returns.
4. Run `sleep 30`, press `Ctrl+C`, and confirm command interruption and failed block status.
5. Resizing the window keeps terminal usable.
6. Copy selected output and paste back into terminal.

## Known tooling note
If you see `npm WARN EBADENGINE` for Vite on Node 21, app may still run, but using Node 20.x or 22.12+ is recommended for a fully supported setup.
