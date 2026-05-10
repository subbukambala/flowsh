import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import "./TerminalView.css";

type ShellOutputPayload = {
  chunk: string;
};

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

export default function TerminalView() {
  const hostRef = useRef<HTMLDivElement | null>(null);

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
        terminal.write(event.payload.chunk);
      });
      teardownOutputListener = unlisten;

      const dataDisposable = terminal.onData((data) => {
        void invoke("write_to_shell", { data });
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
      <header className="terminal-header">flowsh · phase 0.1 terminal wrapper</header>
      <div className="terminal-host" ref={hostRef} />
    </section>
  );
}
