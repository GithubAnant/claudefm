import type { MpvRuntimeState } from "../types.js";
import { fit, type ScreenLine, wrapText } from "./screen.js";
import { PANEL_PADDING_X, PANEL_PADDING_Y } from "./theme.js";
import type { DashboardState } from "./state.js";

export function sectionLines(title: string, lines: string[], width: number): ScreenLine[] {
  const bodyWidth = width - (PANEL_PADDING_X * 2);
  const paddedLines = [
    ...Array.from({ length: PANEL_PADDING_Y }, () => ""),
    title.toUpperCase(),
    ...lines.flatMap((line) => (line.length === 0 ? [""] : wrapText(line, bodyWidth))),
    ...Array.from({ length: PANEL_PADDING_Y }, () => "")
  ];

  return paddedLines.map((line, index) => ({
    text: `${" ".repeat(PANEL_PADDING_X)}${fit(line, bodyWidth)}${" ".repeat(PANEL_PADDING_X)}`,
    variant: index === PANEL_PADDING_Y ? "panelTitle" : "panel"
  }));
}

export function joinLineColumns(left: ScreenLine[], right: ScreenLine[], gap: number): ScreenLine[] {
  const leftWidth = Math.max(...left.map((line) => line.text.length));
  const rightWidth = Math.max(...right.map((line) => line.text.length));
  const rows = Math.max(left.length, right.length);
  const output: ScreenLine[] = [];

  for (let index = 0; index < rows; index += 1) {
    const leftLine = left[index] ?? { text: " ".repeat(leftWidth), variant: "panel" as const };
    const rightLine = right[index] ?? { text: "", variant: "panel" as const };
    output.push({
      text: leftLine.text,
      rightText: rightLine.text,
      leftWidth,
      rightWidth,
      gap,
      variant: leftLine.variant === "panelTitle" || rightLine.variant === "panelTitle" ? "columnsTitle" : "columns"
    });
  }

  return output;
}

export function shouldShowSetup(state: DashboardState): boolean {
  return !state.canUseRichPlayer;
}

export function setupLines(state: DashboardState): string[] {
  if (!state.installCommand) {
    return [
      "install yt-dlp and mpv",
      "then run claudefm doctor"
    ];
  }

  return [
    "run",
    `$ ${state.installCommand}`,
    setupHelpText(state)
  ];
}

function setupHelpText(state: DashboardState): string {
  if (state.playerLabel === "ffplay") {
    return "enables rich controls";
  }

  return "enables terminal playback";
}

export function formatArtistLine(artist: string): string {
  const normalized = artist.trim();
  if (!normalized || /^claude\s+fm$/i.test(normalized)) {
    return "";
  }

  return `artist ${normalized}`;
}

export function controlLines(state: DashboardState): string[] {
  if (state.status === "ERROR") {
    return [state.browserEnabled ? "o      open youtube       q  quit" : "q      quit"];
  }

  if (!state.canUseRichPlayer) {
    return [
      "rich controls need mpv",
      state.browserEnabled ? "o      open youtube       q  quit" : "q      quit"
    ];
  }

  return [
    "space  pause / resume     left/right  seek",
    state.browserEnabled ? "+/-    volume             o  open youtube" : "+/-    volume",
    "q      quit"
  ];
}

export function formatPlaybackError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("IPC socket") || message.includes("mpv exited")) {
    return "mpv exited before playback was ready";
  }

  return message;
}

export function describeRuntime(runtime: MpvRuntimeState): string {
  if (runtime.status === "buffering") {
    return "Buffering the stream.";
  }

  if (runtime.status === "paused") {
    return "Paused. Press space to resume.";
  }

  if (runtime.status === "playing") {
    return "Playing. Controls are below.";
  }

  if (runtime.status === "starting") {
    return "Connecting to the live stream.";
  }

  return "Standing by.";
}
