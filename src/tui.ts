import process from "node:process";
import { clearScreenDown, cursorTo } from "node:readline";
import { formatClock, renderBar, summarizeRuntime } from "./format.js";
import { MpvController } from "./mpv-controller.js";
import { inspectEnvironment } from "./environment.js";
import { CLAUDE_FM_URL } from "./constants.js";
import { openInBrowser, playWithFfplay } from "./player.js";
import type { CommandRunner, MpvRuntimeState, ParsedArgs, Platform } from "./types.js";

interface DashboardState {
  status: string;
  headline: string;
  detail: string;
  error?: string;
  runtime: MpvRuntimeState;
  browserEnabled: boolean;
  canUseRichPlayer: boolean;
  installCommand?: string;
  url: string;
}

type LineVariant = "blank" | "logo" | "panel" | "panelTitle" | "columns" | "columnsTitle" | "hint" | "danger" | "muted";

interface ScreenLine {
  text: string;
  variant: LineVariant;
  gap?: number;
  leftWidth?: number;
  rightText?: string;
  rightWidth?: number;
  logoFmStart?: number;
}

const EMPTY_PLAYER: MpvRuntimeState = {
  status: "idle",
  paused: false,
  volume: 100,
  timePos: 0,
  duration: null,
  cacheSeconds: null,
  bufferPercent: null,
  title: "Claude FM",
  artist: "",
  codec: "",
  sampleRate: null,
  channels: null
};

const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[?25l";
const EXIT_ALT_SCREEN = "\x1b[?1049l\x1b[?25h\x1b[0m";
const RESET = "\x1b[0m";
const THEME = {
  canvas: "\x1b[48;2;0;0;0m",
  panel: "\x1b[48;2;17;17;17m",
  panelAlt: "\x1b[48;2;23;23;23m",
  text: "\x1b[38;2;246;238;232m",
  muted: "\x1b[38;2;169;151;141m",
  dim: "\x1b[38;2;116;99;90m",
  accent: "\x1b[38;2;217;119;87m",
  danger: "\x1b[38;2;255;128;102m",
  warning: "\x1b[38;2;224;163;91m",
  border: "\x1b[38;2;62;49;43m",
  borderHot: "\x1b[38;2;217;119;87m"
} as const;
const PANEL_PADDING_X = 2;
const PANEL_PADDING_Y = 2;
const SECTION_GAP = 2;

export function shouldUseDashboard(options: Pick<ParsedArgs, "json" | "ui">): boolean {
  return options.ui && !options.json && Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

export async function runDashboard(
  options: Pick<ParsedArgs, "player" | "url" | "browser">,
  runner: CommandRunner,
  platform: Platform = process.platform
): Promise<number> {
  const environment = inspectEnvironment(runner, platform);
  const browserEnabled = options.browser && environment.commands.open;
  const openBrowser = () => openInBrowser(options.url, runner, platform) === 0;
  const state: DashboardState = {
    status: "STARTING",
    headline: "Claude FM",
    detail: "Connecting to the live stream.",
    runtime: { ...EMPTY_PLAYER, title: "Claude FM" },
    browserEnabled,
    canUseRichPlayer: environment.commands.mpv,
    installCommand: environment.installPlan.command,
    url: options.url
  };

  if (environment.commands.mpv) {
    return await runRichDashboard(state, options.url, browserEnabled ? openBrowser : undefined);
  }

  if (environment.canPlayTerminal) {
    return await runLegacyDashboard(state, runner, options.url, browserEnabled ? openBrowser : undefined);
  }

  if (browserEnabled && openBrowser()) {
    state.status = "BROWSER";
    state.headline = "Claude FM opened in your browser";
    state.detail = "mpv is missing, so the stream was handed off to YouTube.";
    return await holdStaticDashboard(state, browserEnabled ? openBrowser : undefined);
  }

  state.status = "ERROR";
  state.detail = environment.installPlan.command
    ? `Run ${environment.installPlan.command} to unlock full terminal playback.`
    : environment.installPlan.steps[0];
  state.error = "Terminal playback is unavailable on this machine.";
  return await holdStaticDashboard(state, browserEnabled ? openBrowser : undefined);
}

async function runRichDashboard(
  state: DashboardState,
  streamUrl: string,
  openBrowser?: () => boolean
): Promise<number> {
  const controller = new MpvController();

  try {
    controller.on("state", (nextState: MpvRuntimeState) => {
      state.runtime = nextState;
      state.status = nextState.status.toUpperCase();
      state.headline = nextState.title || "Claude FM";
      state.detail = describeRuntime(nextState);
    });

    controller.on("exit", () => {
      state.status = "STOPPED";
      state.detail = "Playback stopped.";
    });

    await controller.start(streamUrl);
    state.runtime = controller.snapshot;
    state.status = state.runtime.status.toUpperCase();
    state.headline = state.runtime.title || "Claude FM";
    state.detail = describeRuntime(state.runtime);
  } catch (error) {
    state.status = "ERROR";
    state.error = error instanceof Error ? error.message : String(error);
    state.detail = "mpv failed to start the live stream.";
    return await holdStaticDashboard(state, openBrowser);
  }

  return await holdInteractiveDashboard(state, controller, openBrowser);
}

async function runLegacyDashboard(
  state: DashboardState,
  runner: CommandRunner,
  streamUrl: string,
  openBrowser?: () => boolean
): Promise<number> {
  state.status = "PLAYING";
  state.headline = "Claude FM";
  state.detail = "Rich controls require mpv. Starting basic audio mode instead.";
  render(state);
  const code = playWithFfplay(streamUrl, runner);
  state.status = code === 0 ? "STOPPED" : "ERROR";
  state.detail = code === 0 ? "Playback finished." : "Basic audio mode exited with an error.";
  state.error = code === 0 ? undefined : "ffplay playback failed.";
  return await holdStaticDashboard(state, openBrowser);
}

async function holdInteractiveDashboard(
  state: DashboardState,
  controller: MpvController,
  openBrowser?: () => boolean
): Promise<number> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const cleanupTasks = new Set<() => void>();
  let finished = false;
  let renderTimer: NodeJS.Timeout | undefined;

  const cleanup = async () => {
    cleanupTasks.forEach((task) => task());
    cleanupTasks.clear();
    if (renderTimer) {
      clearInterval(renderTimer);
    }
    exitScreen();
    await controller.destroy().catch(() => undefined);
  };

  enterScreen();
  render(state);
  renderTimer = setInterval(() => render(state), 250);

  return await new Promise<number>((resolve) => {
    const finish = async (code: number) => {
      if (finished) {
        return;
      }

      finished = true;
      await cleanup();
      resolve(code);
    };

    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString("utf8");

      if (key === "q" || key === "Q" || key === "\u0003") {
        void finish(0);
        return;
      }

      if ((key === "o" || key === "O") && openBrowser) {
        const opened = openBrowser();
        if (!opened) {
          state.error = "Browser handoff failed.";
        }
        return;
      }

      if (key === " ") {
        void controller.togglePause().catch((error: unknown) => {
          state.error = error instanceof Error ? error.message : String(error);
        });
        return;
      }

      if (key === "\u001b[D" || key === "h") {
        void controller.seek(-5).catch((error: unknown) => {
          state.error = error instanceof Error ? error.message : String(error);
        });
        return;
      }

      if (key === "\u001b[C" || key === "l") {
        void controller.seek(5).catch((error: unknown) => {
          state.error = error instanceof Error ? error.message : String(error);
        });
        return;
      }

      if (key === "+" || key === "=") {
        void controller.changeVolume(5).catch((error: unknown) => {
          state.error = error instanceof Error ? error.message : String(error);
        });
        return;
      }

      if (key === "-") {
        void controller.changeVolume(-5).catch((error: unknown) => {
          state.error = error instanceof Error ? error.message : String(error);
        });
        return;
      }
    };

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", handleKey);
    cleanupTasks.add(() => {
      stdin.off("data", handleKey);
      stdin.setRawMode?.(false);
      stdin.pause();
    });

    const handleResize = () => render(state);
    stdout.on("resize", handleResize);
    cleanupTasks.add(() => {
      stdout.off("resize", handleResize);
    });

    const handleSigInt = () => void finish(0);
    const handleSigTerm = () => void finish(0);
    const handleExit = () => void finish(0);
    process.once("SIGINT", handleSigInt);
    process.once("SIGTERM", handleSigTerm);
    controller.once("exit", handleExit);
    cleanupTasks.add(() => {
      process.off("SIGINT", handleSigInt);
      process.off("SIGTERM", handleSigTerm);
      controller.off("exit", handleExit);
    });
  });
}

async function holdStaticDashboard(state: DashboardState, openBrowser?: () => boolean): Promise<number> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  enterScreen();
  render(state);

  if (!stdin.isTTY) {
    exitScreen();
    return 0;
  }

  return await new Promise<number>((resolve) => {
    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString("utf8");
      if ((key === "o" || key === "O") && openBrowser) {
        const opened = openBrowser();
        if (!opened) {
          state.error = "Browser handoff failed.";
        }
        render(state);
        return;
      }

      if (key === "q" || key === "Q" || key === "\u0003") {
        stdin.off("data", handleKey);
        stdout.off("resize", handleResize);
        stdin.setRawMode?.(false);
        stdin.pause();
        exitScreen();
        resolve(0);
      }
    };

    const handleResize = () => render(state);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", handleKey);
    stdout.on("resize", handleResize);
  });
}

function render(state: DashboardState): void {
  process.stdout.write(`${THEME.canvas}${THEME.text}`);
  cursorTo(process.stdout, 0, 0);
  clearScreenDown(process.stdout);
  process.stdout.write(buildDashboard(state));
}

function buildDashboard(state: DashboardState): string {
  const columns = process.stdout.columns || 80;
  const width = Math.max(72, Math.min(100, columns - 8));
  const columnGap = 4;
  const leftWidth = Math.max(42, Math.floor((width - columnGap) * 0.62));
  const rightWidth = width - leftWidth - columnGap;
  const progressDuration = state.runtime.duration ?? 1;
  const progressValue = state.runtime.timePos ?? 0;
  const progressClock = `${formatClock(progressValue)} / ${formatClock(state.runtime.duration)}`;
  const nowPlayingBodyWidth = leftWidth - (PANEL_PADDING_X * 2);
  const progressWidth = Math.max(12, nowPlayingBodyWidth - progressClock.length - 2);
  const runtime = summarizeRuntime(state.runtime);
  const detailLines = wrapText(state.detail, nowPlayingBodyWidth).slice(0, 2);
  const errorLines = state.error ? wrapText(state.error, nowPlayingBodyWidth - 6).slice(0, 2) : [];
  const hero = sectionLines("Claude FM", [
    state.status,
    `source ${state.url || CLAUDE_FM_URL}`
  ], width);
  const nowPlaying = sectionLines("Now Playing", [
    state.headline,
    ...detailLines,
    "",
    `${renderBar(progressValue, progressDuration, progressWidth)}  ${progressClock}`,
    state.error ? `error ${errorLines.join(" ")}` : `artist ${state.runtime.artist || "--"}`
  ], leftWidth);
  const stats = sectionLines("Runtime", [
    runtime[0] ?? "state --",
    runtime[1] ?? "volume --",
    runtime[2] ?? "cache --",
    runtime[3] ?? "codec --",
    `setup ${state.installCommand || "none"}`,
    state.browserEnabled ? "browser yes" : "browser no"
  ], rightWidth);
  const controls = sectionLines("Controls", [
    state.canUseRichPlayer
      ? "space pause/resume   left/right seek   +/- volume"
      : "rich transport controls need mpv",
    state.browserEnabled ? "o youtube     q quit" : "q quit"
  ], width);
  const lines: ScreenLine[] = [
    ...logoLines(width),
    ...blankLines(SECTION_GAP),
    ...hero,
    ...blankLines(SECTION_GAP),
    ...joinLineColumns(nowPlaying, stats, columnGap),
    ...blankLines(SECTION_GAP),
    ...controls,
    ...hintLines(state, width)
  ];

  return paintScreen(lines, width);
}

function fit(text: string, width: number): string {
  if (text.length > width) {
    return `${text.slice(0, Math.max(0, width - 3))}...`;
  }

  return text.padEnd(width, " ");
}

function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return [""];
  }

  if (text.length <= width) {
    return [text];
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function enterScreen(): void {
  process.stdout.write(`${ENTER_ALT_SCREEN}${THEME.canvas}${THEME.text}`);
}

function exitScreen(): void {
  process.stdout.write(EXIT_ALT_SCREEN);
}

function logoLines(width: number): ScreenLine[] {
  const logo = [
    ["████ █    ████ █  █ ███  ████", " ████ █   █"],
    ["█    █    █  █ █  █ █  █ █   ", " █    ██ ██"],
    ["█    █    ████ █  █ █  █ ███ ", " ███  █ █ █"],
    ["█    █    █  █ █  █ █  █ █   ", " █    █   █"],
    ["████ ████ █  █ ████ ███  ████", " █    █   █"]
  ];

  return [
    ...logo.map(([main, fm]) => centerLogoLine(main, fm, width)),
    { text: "", variant: "blank" as const },
    { text: centerText("music for thinking and building", width), variant: "muted" as const }
  ];
}

function centerLogoLine(main: string, fm: string, width: number): ScreenLine {
  const text = `${main}${fm}`;
  if (text.length >= width) {
    return { text: fit(text, width), logoFmStart: Math.min(main.length, width), variant: "logo" };
  }

  const left = Math.floor((width - text.length) / 2);
  return {
    text: `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`,
    logoFmStart: left + main.length,
    variant: "logo"
  };
}

function sectionLines(title: string, lines: string[], width: number): ScreenLine[] {
  const bodyWidth = width - (PANEL_PADDING_X * 2);
  const paddedLines = [
    ...Array.from({ length: PANEL_PADDING_Y }, () => ""),
    title.toUpperCase(),
    ...lines.flatMap((line) => line.length === 0 ? [""] : wrapText(line, bodyWidth)),
    ...Array.from({ length: PANEL_PADDING_Y }, () => "")
  ];

  return paddedLines.map((line, index) => ({
    text: `${" ".repeat(PANEL_PADDING_X)}${fit(line, bodyWidth)}${" ".repeat(PANEL_PADDING_X)}`,
    variant: index === PANEL_PADDING_Y ? "panelTitle" : "panel"
  }));
}

function hintLines(state: DashboardState, width: number): ScreenLine[] {
  const setup = state.installCommand ? `setup ${state.installCommand}` : "ready";

  return [
    ...blankLines(SECTION_GAP),
    { text: centerText(setup, width), variant: "muted" }
  ];
}

function blankLine(): ScreenLine {
  return { text: "", variant: "blank" };
}

function blankLines(count: number): ScreenLine[] {
  return Array.from({ length: count }, () => blankLine());
}

function centerText(text: string, width: number): string {
  if (text.length >= width) {
    return fit(text, width);
  }

  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`;
}

function paintScreen(lines: ScreenLine[], width: number): string {
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const leftPad = Math.max(0, Math.floor((columns - width) / 2));
  const topPad = Math.max(0, Math.floor((rows - lines.length) / 2));
  const painted = [
    ...Array.from({ length: topPad }, () => paintBlankLine(columns)),
    ...lines.map((line) => paintLine(line, width, columns, leftPad))
  ];

  while (painted.length < rows) {
    painted.push(paintBlankLine(columns));
  }

  return `${painted.join("\n")}${RESET}`;
}

function paintLine(line: ScreenLine, width: number, columns: number, leftPad: number): string {
  const padded = fit(line.text, width);
  const rightPad = Math.max(0, columns - leftPad - width);

  if (line.variant === "columns" || line.variant === "columnsTitle") {
    const gap = line.gap ?? 3;
    const leftWidth = line.leftWidth ?? line.text.length;
    const rightText = line.rightText ?? "";
    const rightWidth = line.rightWidth ?? rightText.length;
    const remainingPad = Math.max(0, width - leftWidth - gap - rightWidth);
    const leftForeground = panelForeground(line.text, line.variant === "columnsTitle");
    const rightForeground = panelForeground(rightText, line.variant === "columnsTitle");

    return [
      THEME.canvas,
      " ".repeat(leftPad),
      THEME.panel,
      leftForeground,
      fit(line.text, leftWidth),
      THEME.canvas,
      " ".repeat(gap),
      THEME.panel,
      rightForeground,
      fit(rightText, rightWidth),
      THEME.canvas,
      " ".repeat(remainingPad + rightPad),
      RESET
    ].join("");
  }

  if (line.variant === "panel" || line.variant === "panelTitle") {
    const foreground = panelForeground(line.text, line.variant === "panelTitle");
    return `${THEME.canvas}${" ".repeat(leftPad)}${THEME.panel}${foreground}${padded}${THEME.canvas}${" ".repeat(rightPad)}${RESET}`;
  }

  if (line.variant === "blank" || line.text.trim().length === 0) {
    return paintBlankLine(columns);
  }

  if (line.variant === "logo" && line.logoFmStart !== undefined) {
    return [
      THEME.canvas,
      " ".repeat(leftPad),
      THEME.accent,
      padded,
      THEME.canvas,
      " ".repeat(rightPad),
      RESET
    ].join("");
  }

  const foreground = line.variant === "logo"
    ? THEME.accent
    : line.variant === "danger"
      ? THEME.danger
      : line.variant === "hint"
        ? THEME.text
        : THEME.muted;

  return `${THEME.canvas}${" ".repeat(leftPad)}${foreground}${padded}${THEME.canvas}${" ".repeat(rightPad)}${RESET}`;
}

function paintBlankLine(columns: number): string {
  return `${THEME.canvas}${" ".repeat(columns)}${RESET}`;
}

function joinLineColumns(left: ScreenLine[], right: ScreenLine[], gap: number): ScreenLine[] {
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

function panelForeground(text: string, isTitle: boolean): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("error")) {
    return THEME.danger;
  }

  if (trimmed.startsWith("ERROR") || trimmed.startsWith("PLAYING") || trimmed.startsWith("STARTING") || trimmed.startsWith("BUFFERING")) {
    return THEME.accent;
  }

  if (text.includes("█") || text.includes("·")) {
    return THEME.accent;
  }

  if (text.includes("source ")) {
    return THEME.muted;
  }

  return isTitle ? THEME.accent : THEME.text;
}

function describeRuntime(runtime: MpvRuntimeState): string {
  if (runtime.status === "buffering") {
    return `Buffering the stream${runtime.cacheSeconds ? ` with ${runtime.cacheSeconds.toFixed(1)}s cached` : ""}.`;
  }

  if (runtime.status === "paused") {
    return "Playback paused. Hit space to resume.";
  }

  if (runtime.status === "playing") {
    return "Live stream is playing. Use the transport controls below.";
  }

  if (runtime.status === "starting") {
    return "Connecting to the live stream.";
  }

  return "Standing by.";
}
