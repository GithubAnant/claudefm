import { canOpenBrowser, commandExists } from "./platform.js";
import { testMpvIpc } from "./mpv-ipc-test.js";
import type { CommandRunner, EnvironmentCommands, EnvironmentInfo, InstallPlan, Platform } from "./types.js";

export function getInstallPlan(environment: {
  platform: Platform;
  commands: EnvironmentCommands;
}): InstallPlan {
  const steps: string[] = [];
  let command: string | undefined;
  let manager: string | undefined;
  let note: string | undefined;

  const needsYtdlp = !environment.commands["yt-dlp"];
  const needsPlayer = !environment.commands.mpv && !environment.commands.ffplay;

  if (!needsYtdlp && !needsPlayer) {
    return { steps };
  }

  const missing: string[] = [];
  if (needsYtdlp) missing.push("yt-dlp");
  if (needsPlayer) missing.push("mpv");

  if (environment.platform === "darwin" && environment.commands.brew) {
    manager = "homebrew";
    command = `brew install ${missing.join(" ")}`;
    steps.push(`Install ${missing.join(" and ")} with Homebrew.`);
  } else if (environment.platform === "win32" && environment.commands.winget) {
    manager = "winget";
    const parts: string[] = [];
    if (needsYtdlp) parts.push("winget install --id yt-dlp.yt-dlp -e");
    if (needsPlayer) parts.push("winget install --id mpv-player.mpv-CI.MSVC -e --source winget");
    command = parts.join(" ; ");
    steps.push(`Install ${missing.join(" and ")} with WinGet.`);
    note = "Restart the terminal after installation, then run `claudefm doctor` again.";
  } else if (environment.platform === "linux" && environment.commands["apt-get"]) {
    manager = "apt";
    command = `sudo apt-get install ${missing.join(" ")}`;
    steps.push(`Install ${missing.join(" and ")} with apt.`);
  } else if (environment.platform === "linux" && environment.commands.dnf) {
    manager = "dnf";
    command = `sudo dnf install ${missing.join(" ")}`;
    steps.push(`Install ${missing.join(" and ")} with dnf.`);
  } else if (environment.platform === "linux" && environment.commands.pacman) {
    manager = "pacman";
    command = `sudo pacman -S ${missing.join(" ")}`;
    steps.push(`Install ${missing.join(" and ")} with pacman.`);
  } else {
    steps.push(`Install \`${missing.join("` and `")}\`, then rerun \`claudefm\`.`);
  }

  return { manager, command, note, steps };
}

export function inspectEnvironment(
  runner: CommandRunner,
  platform: Platform = process.platform
): EnvironmentInfo {
  const mpvFound = commandExists("mpv", runner, platform);
  const commands: EnvironmentCommands = {
    "yt-dlp": commandExists("yt-dlp", runner, platform),
    mpv: mpvFound,
    mpvIpc: mpvFound && testMpvIpc(runner, platform),
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
