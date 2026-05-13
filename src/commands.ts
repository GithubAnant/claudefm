import { printHelp, parseArgs } from "./args.js";
import { VERSION } from "./constants.js";
import { inspectEnvironment } from "./environment.js";
import { openInBrowser, playWithFfplay, playWithMpv, resolvePlayer } from "./player.js";
import { createCommandRunner } from "./system.js";
import { runDashboard, shouldUseDashboard } from "./tui.js";
import type { CommandRunner, EnvironmentInfo, ParsedArgs, Platform } from "./types.js";

export function printDoctor(environment: EnvironmentInfo): void {
  const lines = [
    `Platform: ${environment.platform}`,
    `yt-dlp: ${environment.commands["yt-dlp"] ? "found" : "missing"}`,
    `mpv: ${environment.commands.mpv ? "found" : "missing"}`,
    `ffplay: ${environment.commands.ffplay ? "found" : "missing"}`,
    `browser opener: ${environment.commands.open ? "found" : "missing"}`,
    `terminal playback: ${environment.canPlayTerminal ? "ready" : "not ready"}`
  ];

  for (const line of lines) {
    console.log(line);
  }

  if (environment.installPlan.command) {
    console.log("");
    console.log("Recommended setup command:");
    console.log(environment.installPlan.command);
  }

  if (environment.installPlan.note) {
    console.log("");
    console.log(environment.installPlan.note);
  }
}

export function runDoctor(
  options: Pick<ParsedArgs, "json">,
  runner: CommandRunner,
  platform: Platform = process.platform
): number {
  const environment = inspectEnvironment(runner, platform);

  if (options.json) {
    console.log(JSON.stringify(environment, null, 2));
    return 0;
  }

  printDoctor(environment);
  return environment.canPlayTerminal ? 0 : 1;
}

export function runSetup(
  options: Pick<ParsedArgs, "json" | "print" | "yes">,
  runner: CommandRunner,
  platform: Platform = process.platform
): number {
  const environment = inspectEnvironment(runner, platform);
  const { installPlan } = environment;

  if (options.json) {
    console.log(JSON.stringify({ environment, installPlan }, null, 2));
    return installPlan.command ? 0 : 1;
  }

  if (!installPlan.command) {
    console.log("Automatic setup is not available on this machine.");
    console.log(installPlan.steps[0]);
    return 1;
  }

  if (options.print || !options.yes) {
    console.log(installPlan.command);

    if (installPlan.note) {
      console.log("");
      console.log(installPlan.note);
    }

    return 0;
  }

  console.log(`Running: ${installPlan.command}`);
  return runner.run(installPlan.command, [], {
    shell: true,
    stdio: "inherit"
  }).status ?? 1;
}

export function printPlayFallback(environment: EnvironmentInfo): void {
  console.log("Terminal playback is not ready on this machine.");
  console.log(`Missing: ${formatMissingDependencies(environment)}.`);

  if (environment.installPlan.command) {
    console.log(`Run this first: ${environment.installPlan.command}`);
  } else {
    console.log(environment.installPlan.steps[0]);
  }

  console.log("Then rerun: claudefm");
  console.log("To open YouTube intentionally, run: claudefm open");
}

function formatMissingDependencies(environment: EnvironmentInfo): string {
  const missing: string[] = [];

  if (!environment.commands["yt-dlp"]) {
    missing.push("yt-dlp");
  }

  if (!environment.commands.mpv && !environment.commands.ffplay) {
    missing.push("mpv or ffplay");
  }

  return missing.join(", ");
}

export function playStream(
  options: Pick<ParsedArgs, "player" | "url" | "browser">,
  runner: CommandRunner,
  platform: Platform = process.platform
): number {
  const environment = inspectEnvironment(runner, platform);

  if (!environment.canPlayTerminal) {
    printPlayFallback(environment);
    return 1;
  }

  const resolvedPlayer = resolvePlayer(options.player, environment);

  console.log(`Starting Claude FM with ${resolvedPlayer}...`);

  if (resolvedPlayer === "mpv") {
    return playWithMpv(options.url, runner);
  }

  return playWithFfplay(options.url, runner);
}

export function runOpen(
  options: Pick<ParsedArgs, "url">,
  runner: CommandRunner,
  platform: Platform = process.platform
): number {
  const environment = inspectEnvironment(runner, platform);

  if (!environment.commands.open) {
    throw new Error("No browser opener was found on this machine.");
  }

  console.log("Opening Claude FM in your browser...");
  return openInBrowser(options.url, runner, platform);
}

export async function run(
  argv: string[] = process.argv.slice(2),
  runner: CommandRunner = createCommandRunner(),
  platform: Platform = process.platform
): Promise<number> {
  try {
    const parsed = parseArgs(argv);

    if ("help" in parsed) {
      printHelp();
      return 0;
    }

    if ("version" in parsed) {
      console.log(`claudefm ${VERSION}`);
      return 0;
    }

    switch (parsed.command) {
      case "doctor":
        return runDoctor(parsed, runner, platform);
      case "setup":
        return runSetup(parsed, runner, platform);
      case "open":
        return runOpen(parsed, runner, platform);
      case "play":
        if (shouldUseDashboard(parsed)) {
          return await runDashboard(parsed, runner, platform);
        }

        return playStream(parsed, runner, platform);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
