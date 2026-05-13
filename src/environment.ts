import { canOpenBrowser, commandExists } from "./platform.js";
import type { CommandRunner, EnvironmentCommands, EnvironmentInfo, InstallPlan, Platform } from "./types.js";

export function getInstallPlan(environment: {
  platform: Platform;
  commands: EnvironmentCommands;
}): InstallPlan {
  const steps: string[] = [];
  let command: string | undefined;
  let manager: string | undefined;
  let note: string | undefined;

  if (environment.platform === "darwin" && environment.commands.brew) {
    manager = "homebrew";
    command = "brew install yt-dlp mpv";
    steps.push("Install Homebrew dependencies.");
  } else if (environment.platform === "win32" && environment.commands.winget) {
    manager = "winget";
    command = "winget install yt-dlp.yt-dlp mpv.net";
    steps.push("Install yt-dlp and mpv with WinGet.");
    note = "Restart the terminal after installation, then run `claudefm doctor` again.";
  } else if (environment.platform === "linux" && environment.commands["apt-get"]) {
    manager = "apt";
    command = "sudo apt-get install yt-dlp mpv";
    steps.push("Install yt-dlp and mpv with apt.");
  } else if (environment.platform === "linux" && environment.commands.dnf) {
    manager = "dnf";
    command = "sudo dnf install yt-dlp mpv";
    steps.push("Install yt-dlp and mpv with dnf.");
  } else if (environment.platform === "linux" && environment.commands.pacman) {
    manager = "pacman";
    command = "sudo pacman -S yt-dlp mpv";
    steps.push("Install yt-dlp and mpv with pacman.");
  } else {
    steps.push("Install `yt-dlp` and either `mpv` or `ffplay`, then rerun `claudefm`.");
  }

  return { manager, command, note, steps };
}

export function inspectEnvironment(
  runner: CommandRunner,
  platform: Platform = process.platform
): EnvironmentInfo {
  const commands: EnvironmentCommands = {
    "yt-dlp": commandExists("yt-dlp", runner, platform),
    mpv: commandExists("mpv", runner, platform),
    ffplay: commandExists("ffplay", runner, platform),
    open: canOpenBrowser(runner, platform),
    brew: platform === "darwin" ? commandExists("brew", runner, platform) : false,
    winget: platform === "win32" ? commandExists("winget", runner, platform) : false,
    "apt-get": platform === "linux" ? commandExists("apt-get", runner, platform) : false,
    dnf: platform === "linux" ? commandExists("dnf", runner, platform) : false,
    pacman: platform === "linux" ? commandExists("pacman", runner, platform) : false
  };

  const preferredPlayer = commands.mpv ? "mpv" : commands.ffplay ? "ffplay" : null;

  return {
    platform,
    commands,
    preferredPlayer,
    canPlayTerminal: commands["yt-dlp"] && Boolean(preferredPlayer),
    installPlan: getInstallPlan({ platform, commands })
  };
}
