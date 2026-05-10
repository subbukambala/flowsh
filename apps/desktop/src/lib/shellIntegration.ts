export type ShellIntegrationEvent =
  | { type: "prompt" }
  | { type: "command_start" }
  | { type: "command_done"; exitCode: number | null };

type ParsedShellChunk = {
  cleanChunk: string;
  events: ShellIntegrationEvent[];
};

const OSC_133_REGEX = /\u001b\]133;([ACD])(?:;([0-9]+))?(?:\u0007|\u001b\\)/g;

export function parseShellIntegrationChunk(chunk: string): ParsedShellChunk {
  const events: ShellIntegrationEvent[] = [];

  const cleanChunk = chunk.replace(
    OSC_133_REGEX,
    (_match: string, code: string, status: string | undefined) => {
      if (code === "A") {
        events.push({ type: "prompt" });
      } else if (code === "C") {
        events.push({ type: "command_start" });
      } else if (code === "D") {
        events.push({
          type: "command_done",
          exitCode: status !== undefined ? Number.parseInt(status, 10) : null,
        });
      }
      return "";
    },
  );

  return { cleanChunk, events };
}
