import { spawn, type ChildProcess } from "node:child_process";
import {
  CLAUDE_FM_SEARCH_LOCATOR,
  CLAUDE_FM_URL,
  SUPPORTED_PLAYERS,
  YOUTUBE_WATCH_URL_PREFIX,
  YTDLP_TIMEOUT_MS
} from "./constants.js";
import { getOpenCommand } from "./platform.js";
import type {
  CommandRunner,
  EnvironmentInfo,
  Platform,
  StreamAvailability,
  StreamAvailabilityStatus,
  SupportedPlayer
} from "./types.js";

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

  const availability = resolveAvailableStream(streamUrl, runner);
  const result = runner.run("yt-dlp", ["-g", availability.url], {
    encoding: "utf8",
    timeoutMs: YTDLP_TIMEOUT_MS
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

export function resolveAvailableStream(streamUrl: string, runner: CommandRunner): StreamAvailability {
  const primary = checkStreamAvailability(streamUrl, runner);

  if (primary.ok) {
    return primary;
  }

  if (shouldTrySearchFallback(streamUrl)) {
    const fallback = checkStreamAvailability(CLAUDE_FM_SEARCH_LOCATOR, runner, true);
    if (fallback.ok) {
      return {
        ...fallback,
        message: `Default stream unavailable. Using current Claude FM search result: ${fallback.url}`
      };
    }

    throw new Error(`${primary.message} Fallback search also failed: ${fallback.message}`);
  }

  throw new Error(primary.message);
}

export function checkStreamAvailability(
  streamUrl: string,
  runner: CommandRunner,
  fallbackUsed = false
): StreamAvailability {
  if (isDirectAudioUrl(streamUrl)) {
    return {
      ok: true,
      status: "available",
      url: streamUrl,
      isLive: false,
      message: "Direct audio stream is available.",
      fallbackUsed
    };
  }

  const result = runner.run("yt-dlp", ["-J", "--no-playlist", streamUrl], {
    encoding: "utf8",
    timeoutMs: YTDLP_TIMEOUT_MS
  });

  if (result.status !== 0) {
    const status = classifyYtdlpFailure(`${result.stderr}\n${result.stdout}`);
    return {
      ok: false,
      status,
      url: streamUrl,
      isLive: false,
      message: formatAvailabilityMessage(status, result.stderr || result.stdout),
      fallbackUsed
    };
  }

  let metadata: Record<string, unknown>;
  try {
    metadata = normalizeYtdlpMetadata(JSON.parse(result.stdout));
  } catch {
    return {
      ok: false,
      status: "unavailable",
      url: streamUrl,
      isLive: false,
      message: "Stream unavailable: yt-dlp returned unreadable metadata.",
      fallbackUsed
    };
  }

  const status = classifyMetadata(metadata);
  const isLive = isLiveMetadata(metadata);
  const videoId = typeof metadata.id === "string" ? metadata.id : undefined;
  const title = typeof metadata.title === "string" ? metadata.title : undefined;
  const webpageUrl = typeof metadata.webpage_url === "string" && metadata.webpage_url.length > 0
    ? metadata.webpage_url
    : videoId
      ? `${YOUTUBE_WATCH_URL_PREFIX}${videoId}`
      : streamUrl;

  if (status !== "available") {
    return {
      ok: false,
      status,
      url: webpageUrl,
      isLive,
      videoId,
      title,
      message: formatAvailabilityMessage(status),
      fallbackUsed
    };
  }

  return {
    ok: true,
    status,
    url: webpageUrl,
    isLive,
    videoId,
    title,
    message: fallbackUsed
      ? `Using current Claude FM search result: ${webpageUrl}`
      : "YouTube stream is available.",
    fallbackUsed
  };
}

export function isSearchLocator(streamUrl: string): boolean {
  return streamUrl.startsWith("ytsearch");
}

export function isDirectAudioUrl(streamUrl: string): boolean {
  return /^https?:\/\/.+\.(m3u8|mp3|aac|m4a|opus|ogg|oga|flac|wav|webm)(\?.*)?$/i.test(streamUrl);
}

export function resolveWatchUrl(streamUrl: string, runner: CommandRunner): string {
  if (!isSearchLocator(streamUrl)) {
    return streamUrl;
  }

  return resolveAvailableStream(streamUrl, runner).url;
}

export function playWithMpv(streamUrl: string, runner: CommandRunner): number {
  const availability = resolveAvailableStream(streamUrl, runner);
  return runner.run("mpv", [
    "--no-video",
    "--force-window=no",
    "--ytdl=yes",
    "--ytdl-format=bestaudio/best",
    availability.url
  ], {
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
  const availability = resolveAvailableStream(streamUrl, runner);
  return spawn("mpv", [
    "--no-video",
    "--force-window=no",
    "--no-terminal",
    "--ytdl=yes",
    "--ytdl-format=bestaudio/best",
    availability.url
  ], {
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

function shouldTrySearchFallback(streamUrl: string): boolean {
  return streamUrl === CLAUDE_FM_URL;
}

function normalizeYtdlpMetadata(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid metadata");
  }

  const record = payload as Record<string, unknown>;
  const entries = record.entries;

  if (Array.isArray(entries)) {
    const entry = entries.find((value) => value && typeof value === "object");
    if (entry && typeof entry === "object") {
      return entry as Record<string, unknown>;
    }

    throw new Error("empty metadata entries");
  }

  return record;
}

function classifyMetadata(metadata: Record<string, unknown>): StreamAvailabilityStatus {
  const availability = typeof metadata.availability === "string" ? metadata.availability.toLowerCase() : "";
  const liveStatus = typeof metadata.live_status === "string" ? metadata.live_status.toLowerCase() : "";

  if (["private", "needs_auth", "premium_only", "subscriber_only"].includes(availability)) {
    return "private";
  }

  if (["is_upcoming"].includes(liveStatus)) {
    return "offline";
  }

  if (["was_live", "post_live"].includes(liveStatus)) {
    return "offline";
  }

  return "available";
}

function isLiveMetadata(metadata: Record<string, unknown>): boolean {
  const liveStatus = typeof metadata.live_status === "string" ? metadata.live_status.toLowerCase() : "";
  return liveStatus === "is_live";
}

function classifyYtdlpFailure(detail: string): StreamAvailabilityStatus {
  const normalized = detail.toLowerCase();

  if (/update yt-dlp|please update|unable to extract|signature|nsig/.test(normalized)) {
    return "outdated";
  }

  if (/private|sign in|login|members-only|premium|subscriber/.test(normalized)) {
    return "private";
  }

  if (/age-restricted|age restricted|geo-restricted|not available in your country|copyright/.test(normalized)) {
    return "unavailable";
  }

  if (/deleted|removed|does not exist|not found/.test(normalized)) {
    return "deleted";
  }

  if (/offline|not currently live|live event will begin|premieres in|not started/.test(normalized)) {
    return "offline";
  }

  if (/timed out|timeout|etimedout|temporary failure|network|connection|dns|name resolution|http error 5|unable to download webpage/.test(normalized)) {
    return "network";
  }

  return "unavailable";
}

function formatAvailabilityMessage(status: StreamAvailabilityStatus, detail = ""): string {
  const suffix = summarizeYtdlpDetail(detail);

  const messages: Record<StreamAvailabilityStatus, string> = {
    available: "YouTube stream is available.",
    private: "Stream unavailable: the YouTube video is private or requires sign-in.",
    deleted: "Stream unavailable: the YouTube video was deleted or removed.",
    offline: "Stream unavailable: the YouTube live stream is offline or has not started.",
    unavailable: "Stream unavailable: YouTube did not return a playable stream.",
    network: "Network issue while checking the YouTube stream.",
    outdated: "yt-dlp appears outdated. Update yt-dlp and try again."
  };

  return suffix ? `${messages[status]} (${suffix})` : messages[status];
}

function summarizeYtdlpDetail(detail: string): string {
  const line = detail
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);

  if (!line) {
    return "";
  }

  return line.replace(/^ERROR:\s*/i, "").slice(0, 180);
}
