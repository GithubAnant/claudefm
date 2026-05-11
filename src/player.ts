import { spawn, type ChildProcess } from "node:child_process";
import { SUPPORTED_PLAYERS, YOUTUBE_WATCH_URL_PREFIX } from "./constants.js";
import { getOpenCommand } from "./platform.js";
import type { CommandRunner, EnvironmentInfo, Platform, SupportedPlayer } from "./types.js";

export function resolvePlayer(
  preferredPlayer: string | undefined,
  environment: Pick<EnvironmentInfo, "preferredPlayer" | "commands">
): SupportedPlayer {
  if (preferredPlayer) {
    if (!SUPPORTED_PLAYERS.includes(preferredPlayer as SupportedPlayer)) {
      throw new Error(`Unsupported player: ${preferredPlayer}`);
    }

    if (!environment.commands[preferredPlayer as SupportedPlayer]) {
      throw new Error(`Player not found: ${preferredPlayer}`);
    }

    return preferredPlayer as SupportedPlayer;
  }

  if (environment.preferredPlayer) {
    return environment.preferredPlayer;
  }

  throw new Error("No supported player found. Install mpv or ffplay.");
}

export function resolveAudioUrl(streamUrl: string, runner: CommandRunner): string {
  if (isDirectAudioUrl(streamUrl)) {
    return streamUrl;
  }

  const result = runner.run("yt-dlp", ["-g", streamUrl], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error("Failed to resolve stream URL with yt-dlp.");
  }

  const audioUrl = result.stdout.trim().split("\n")[0];

  if (!audioUrl) {
    throw new Error("yt-dlp did not return an audio URL.");
  }

  return audioUrl;
}

export function isSearchLocator(streamUrl: string): boolean {
  return streamUrl.startsWith("ytsearch");
}

export function isDirectAudioUrl(streamUrl: string): boolean {
  return /^https?:\/\/.+\.(m3u8|mp3|aac)(\?.*)?$/i.test(streamUrl);
}

export function resolveWatchUrl(streamUrl: string, runner: CommandRunner): string {
  if (!isSearchLocator(streamUrl)) {
    return streamUrl;
  }

  const result = runner.run("yt-dlp", ["--get-id", streamUrl], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error("Failed to resolve the current Claude FM live page.");
  }

  const videoId = result.stdout.trim().split("\n")[0];

  if (!videoId) {
    throw new Error("yt-dlp did not return a current Claude FM video ID.");
  }

  return `${YOUTUBE_WATCH_URL_PREFIX}${videoId}`;
}

export function playWithMpv(streamUrl: string, runner: CommandRunner): number {
  const audioUrl = resolveAudioUrl(streamUrl, runner);
  return runner.run("mpv", ["--no-video", "--force-window=no", audioUrl], {
    stdio: "inherit"
  }).status ?? 1;
}

export function playWithFfplay(streamUrl: string, runner: CommandRunner): number {
  const audioUrl = resolveAudioUrl(streamUrl, runner);
  return runner.run("ffplay", ["-nodisp", "-autoexit", "-loglevel", "error", audioUrl], {
    stdio: "inherit"
  }).status ?? 1;
}

export function launchMpv(streamUrl: string, runner: CommandRunner): ChildProcess {
  const audioUrl = resolveAudioUrl(streamUrl, runner);
  return spawn("mpv", ["--no-video", "--force-window=no", "--no-terminal", audioUrl], {
    stdio: "ignore"
  });
}

export function launchFfplay(streamUrl: string, runner: CommandRunner): ChildProcess {
  const audioUrl = resolveAudioUrl(streamUrl, runner);
  return spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "error", audioUrl], {
    stdio: "ignore"
  });
}

export function openInBrowser(
  streamUrl: string,
  runner: CommandRunner,
  platform: Platform = process.platform
): number {
  const opener = getOpenCommand(platform);
  const watchUrl = resolveWatchUrl(streamUrl, runner);
  return runner.run(opener.command, [...opener.args, watchUrl], {
    stdio: "inherit"
  }).status ?? 1;
}
