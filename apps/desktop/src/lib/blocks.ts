export type CommandBlockStatus = "running" | "success" | "failed";

export type CommandBlock = {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  output: string;
  status: CommandBlockStatus;
};

export function createRunningBlock(command: string): CommandBlock {
  return {
    id: createBlockId(),
    command,
    cwd: "",
    startedAt: Date.now(),
    output: "",
    status: "running",
  };
}

export function appendOutputToBlock(
  blocks: CommandBlock[],
  blockId: string,
  chunk: string,
): CommandBlock[] {
  return blocks.map((block) =>
    block.id === blockId
      ? {
          ...block,
          output: `${block.output}${chunk}`,
        }
      : block,
  );
}

export function completeBlock(
  blocks: CommandBlock[],
  blockId: string,
  status: Exclude<CommandBlockStatus, "running">,
  exitCode: number | null,
): CommandBlock[] {
  return blocks.map((block) =>
    block.id === blockId && block.status === "running"
      ? {
          ...block,
          status,
          endedAt: Date.now(),
          exitCode: exitCode ?? undefined,
        }
      : block,
  );
}

function createBlockId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
