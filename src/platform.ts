import type { CommandRunner, OpenCommand, Platform } from "./types.js";

export function commandExists(
  command: string,
  runner: CommandRunner,
  platform: Platform = process.platform
): boolean {
  const lookupCommand = platform === "win32" ? "where" : "which";
  const result = runner.run(lookupCommand, [command], {
    stdio: "ignore"
  });

  return result.status === 0;
}

export function getOpenCommand(platform: Platform = process.platform): OpenCommand {
  if (platform === "darwin") {
    return { command: "open", args: [] };
  }

  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", ""] };
  }

  return { command: "xdg-open", args: [] };
}

export function canOpenBrowser(
  runner: CommandRunner,
  platform: Platform = process.platform
): boolean {
  const { command } = getOpenCommand(platform);
  return commandExists(command, runner, platform);
}
