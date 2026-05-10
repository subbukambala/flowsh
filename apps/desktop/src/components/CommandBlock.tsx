import type { CommandBlock } from "../lib/blocks";

type CommandBlockProps = {
  block: CommandBlock;
};

export default function CommandBlock({ block }: CommandBlockProps) {
  const startedAt = new Date(block.startedAt).toLocaleTimeString();
  const durationMs = (block.endedAt ?? Date.now()) - block.startedAt;
  const durationSeconds = Math.max(0, Math.round(durationMs / 100) / 10);

  return (
    <article className="command-block">
      <header className="command-block-header">
        <span className={`command-block-status command-block-status-${block.status}`}>
          {block.status}
        </span>
        {block.exitCode !== undefined ? (
          <span className="command-block-exit">exit {block.exitCode}</span>
        ) : null}
        <span className="command-block-time">{startedAt}</span>
        <span className="command-block-duration">{durationSeconds}s</span>
      </header>
      <div className="command-block-command">$ {block.command || "(empty command)"}</div>
      <pre className="command-block-output">{block.output || "(no output yet)"}</pre>
    </article>
  );
}
