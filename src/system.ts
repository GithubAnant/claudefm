import { spawnSync } from "node:child_process";
import type { CommandResult, CommandRunner } from "./types.js";

export function createCommandRunner(): CommandRunner {
  return {
    run(command, args = [], options = {}) {
      const result = spawnSync(command, [...args], {
        encoding: options.encoding ?? "utf8",
        shell: options.shell ?? false,
        stdio: options.stdio ?? "pipe"
      });

      return normalizeResult(result.status, result.stdout, result.stderr);
    }
  };
}

function normalizeResult(
  status: number | null,
  stdout: string | Buffer | null | undefined,
  stderr: string | Buffer | null | undefined
): CommandResult {
  return {
    status,
    stdout: typeof stdout === "string" ? stdout : stdout?.toString("utf8") ?? "",
    stderr: typeof stderr === "string" ? stderr : stderr?.toString("utf8") ?? ""
  };
}
