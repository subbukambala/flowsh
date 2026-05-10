import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import CommandBlock from "./CommandBlock";
import { appendOutputToBlock, completeBlock, createRunningBlock, type CommandBlock as CommandBlockModel } from "../lib/blocks";
import { parseShellIntegrationChunk } from "../lib/shellIntegration";
import "xterm/css/xterm.css";
import "./TerminalView.css";

type ShellOutputPayload = {
  chunk: string;
};

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const PROMPT_SUFFIX_REGEX = /[#$%>] $/;
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const ANSI_OSC_REGEX = /\u001b\][^\u0007]*(\u0007|\u001b\\)/g;

export default function TerminalView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [blocks, setBlocks] = useState<CommandBlockModel[]>([]);
  const activeBlockIdRef = useRef<string | null>(null);
  const currentInputRef = useRef("");
  const interruptedRef = useRef(false);
  const markerEventsDetectedRef = useRef(false);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const terminal = new Terminal({
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      fontFamily: "\"SF Mono\", Menlo, Monaco, Consolas, \"Liberation Mono\", monospace",
      fontSize: 14,
      lineHeight: 1.25,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      allowProposedApi: false,
      theme: {
        background: "#0a0d14",
        foreground: "#f5f7ff",
        cursor: "#7aa2f7",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminal.focus();

    const resizeToTerminal = async () => {
      fitAddon.fit();
      await invoke("resize_shell", {
        cols: terminal.cols,
        rows: terminal.rows,
      }).catch(() => undefined);
    };

    let teardownOutputListener: (() => void) | undefined;
    let teardownDataHandler: (() => void) | undefined;
    let teardownResizeObserver: (() => void) | undefined;
    let teardownPasteHandler: (() => void) | undefined;
    let cancelled = false;

    const start = async () => {
      const unlisten = await listen<ShellOutputPayload>("pty-output", (event) => {
        const chunk = event.payload.chunk;
        const { cleanChunk, events } = parseShellIntegrationChunk(chunk);
        terminal.write(chunk);
        for (const shellEvent of events) {
          markerEventsDetectedRef.current = true;

          if (shellEvent.type === "command_done") {
            const activeBlockId = activeBlockIdRef.current;
            if (!activeBlockId) {
              continue;
            }

            const exitCode = shellEvent.exitCode;
            const status = exitCode === 0 ? "success" : "failed";
            activeBlockIdRef.current = null;
            interruptedRef.current = false;
            setBlocks((prev) => completeBlock(prev, activeBlockId, status, exitCode));
          }
        }

        const activeBlockId = activeBlockIdRef.current;
        if (!activeBlockId) {
          return;
        }
        if (cleanChunk) {
          setBlocks((prev) => appendOutputToBlock(prev, activeBlockId, cleanChunk));
        }

        if (!markerEventsDetectedRef.current && isPromptReturnChunk(cleanChunk)) {
          const status = interruptedRef.current ? "failed" : "success";
          interruptedRef.current = false;
          activeBlockIdRef.current = null;
          setBlocks((prev) => completeBlock(prev, activeBlockId, status, status === "success" ? 0 : null));
        }
      });
      teardownOutputListener = unlisten;

      const dataDisposable = terminal.onData((data) => {
        void invoke("write_to_shell", { data });

        for (const char of data) {
          if (char === "\u0003") {
            interruptedRef.current = true;
            continue;
          }

          if (char === "\u007f") {
            currentInputRef.current = currentInputRef.current.slice(0, -1);
            continue;
          }

          if (char === "\r" || char === "\n") {
            const command = currentInputRef.current.trim();
            currentInputRef.current = "";

            if (!command) {
              continue;
            }

            const nextBlock = createRunningBlock(command);
            activeBlockIdRef.current = nextBlock.id;
            interruptedRef.current = false;
            setBlocks((prev) => [nextBlock, ...prev]);
            continue;
          }

          if (char >= " " && char !== "\u007f") {
            currentInputRef.current += char;
          }
        }
      });
      teardownDataHandler = () => dataDisposable.dispose();

      await invoke("start_shell", {
        cols: terminal.cols,
        rows: terminal.rows,
      });

      const observer = new ResizeObserver(() => {
        void resizeToTerminal();
      });
      observer.observe(hostRef.current!);
      teardownResizeObserver = () => observer.disconnect();

      const pasteHandler = (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData("text");
        if (!text) {
          return;
        }
        event.preventDefault();
        void invoke("write_to_shell", { data: text });
      };

      hostRef.current?.addEventListener("paste", pasteHandler);
      teardownPasteHandler = () => hostRef.current?.removeEventListener("paste", pasteHandler);

      terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        const isMacCopy = event.metaKey && event.key.toLowerCase() === "c";
        if (!isMacCopy) {
          return true;
        }
        const selection = terminal.getSelection();
        if (!selection) {
          return true;
        }
        void navigator.clipboard.writeText(selection);
        return false;
      });

      await resizeToTerminal();
    };

    void start().catch((error) => {
      if (!cancelled) {
        terminal.writeln(`\r\n[flowsh] failed to start shell: ${String(error)}\r\n`);
      }
    });

    return () => {
      cancelled = true;
      teardownOutputListener?.();
      teardownDataHandler?.();
      teardownResizeObserver?.();
      teardownPasteHandler?.();
      void invoke("stop_shell").catch(() => undefined);
      terminal.dispose();
    };
  }, []);

  return (
    <section className="terminal-root">
      <header className="terminal-header">flowsh · phase 0.2.1 marker-based blocks</header>
      <div className="terminal-workspace">
        <aside className="blocks-panel">
          <div className="blocks-panel-title">Command Blocks</div>
          {blocks.length === 0 ? (
            <p className="blocks-empty-state">Run a command and press Enter to create a block.</p>
          ) : (
            <div className="blocks-list">
              {blocks.map((block) => (
                <CommandBlock key={block.id} block={block} />
              ))}
            </div>
          )}
        </aside>
        <div className="terminal-host" ref={hostRef} />
      </div>
    </section>
  );
}

function isPromptReturnChunk(chunk: string): boolean {
  const clean = chunk.replace(ANSI_ESCAPE_REGEX, "").replace(ANSI_OSC_REGEX, "");
  const normalized = clean.replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const lastLine = lines[lines.length - 1] ?? "";
  return PROMPT_SUFFIX_REGEX.test(lastLine);
}
