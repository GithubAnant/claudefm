import type { MpvRuntimeState } from "./types.js";

export function formatClock(totalSeconds: number | null): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds === null || totalSeconds < 0) {
    return "--:--";
  }

  const wholeSeconds = Math.floor(totalSeconds);
  const seconds = wholeSeconds % 60;
  const minutes = Math.floor((wholeSeconds / 60) % 60);
  const hours = Math.floor(wholeSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function renderBar(value: number, max: number, width: number): string {
  if (width <= 0) {
    return "";
  }

  const safeMax = max <= 0 ? 1 : max;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"·".repeat(Math.max(0, width - filled))}`;
}

export function formatDisplayTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "Claude FM";
  }

  const withoutTimestamp = normalized
    .replace(/\s+\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\s*$/, "")
    .trim();

  if (/^claude\s+fm\b/i.test(withoutTimestamp)) {
    return "Claude FM";
  }

  return withoutTimestamp || "Claude FM";
}

export function summarizeRuntime(state: MpvRuntimeState): string[] {
  const technical = [
    state.codec || "",
    state.sampleRate ? `${state.sampleRate} Hz` : "",
    state.channels ? `${state.channels}ch` : ""
  ].filter(Boolean);

  return [
    `state   ${state.status}`,
    `volume  ${state.volume}%`,
    `cache   ${state.cacheSeconds ? `${state.cacheSeconds.toFixed(1)}s` : "--"}`,
    `codec   ${technical.length > 0 ? technical.join("  |  ") : "--"}`,
    `artist  ${state.artist || "--"}`
  ];
}
