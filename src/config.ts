import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CLAUDE_FM_URL } from "./constants.js";

interface ClaudeFmConfig {
  streamUrl?: string;
}

function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "claudefm");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

export function readConfig(): ClaudeFmConfig {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ClaudeFmConfig) : {};
  } catch {
    return {};
  }
}

export function getSavedStreamUrl(): string | undefined {
  const url = readConfig().streamUrl;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

export function getDefaultStreamUrl(): string {
  return getSavedStreamUrl() ?? CLAUDE_FM_URL;
}

export function saveStreamUrl(streamUrl: string): void {
  if (!streamUrl || streamUrl === getSavedStreamUrl()) {
    return;
  }

  try {
    mkdirSync(configDir(), { recursive: true });
    const config = readConfig();
    config.streamUrl = streamUrl;
    writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch {
    // Persisting the stream URL is best-effort; ignore filesystem errors.
  }
}
