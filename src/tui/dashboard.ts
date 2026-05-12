import process from "node:process";
import { clearScreenDown, cursorTo } from "node:readline";
import { inspectEnvironment } from "../environment.js";
import { formatClock, formatDisplayTitle, renderBar } from "../format.js";
import { MpvController } from "../mpv-controller.js";
import { openInBrowser, playWithFfplay } from "../player.js";
import type { CommandRunner, MpvRuntimeState, ParsedArgs, Platform } from "../types.js";
import { blankLines, centerText, paintScreen, type ScreenLine, wrapText } from "./screen.js";
import {
  controlLines,
  describeRuntime,
  formatArtistLine,
  formatPlaybackError,
  sectionLines
} from "./sections.js";
import { type DashboardState, EMPTY_PLAYER } from "./state.js";
import { enterScreen, exitScreen, PANEL_PADDING_X, THEME } from "./theme.js";

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
    playerLabel: environment.preferredPlayer ?? (browserEnabled ? "browser" : "none"),
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
    state.headline = "Claude FM";
    state.detail = "Opened in YouTube because terminal playback is missing.";
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
      state.headline = formatDisplayTitle(nextState.title);
      state.detail = describeRuntime(nextState);
    });

    controller.on("exit", () => {
      state.status = "STOPPED";
      state.detail = "Playback stopped.";
    });

    await controller.start(streamUrl);
    state.runtime = controller.snapshot;
    state.status = state.runtime.status.toUpperCase();
    state.headline = formatDisplayTitle(state.runtime.title);
    state.detail = describeRuntime(state.runtime);
  } catch (error) {
    state.status = "ERROR";
    state.runtime = { ...state.runtime, status: "idle" };
    state.error = formatPlaybackError(error);
    state.detail = openBrowser
      ? "Could not start mpv. Press o to open YouTube."
      : "Could not start mpv. Run claudefm doctor.";
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

    const reportError = (error: unknown) => {
      state.error = error instanceof Error ? error.message : String(error);
    };

    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString("utf8");

      if (key === "q" || key === "Q" || key === "\u0003") {
        void finish(0);
        return;
      }

      if ((key === "o" || key === "O") && openBrowser) {
        if (!openBrowser()) {
          state.error = "Browser handoff failed.";
        }
        return;
      }

      if (key === " ") {
        void controller.togglePause().catch(reportError);
        return;
      }

      if (key === "\u001b[D" || key === "h") {
        void controller.seek(-5).catch(reportError);
        return;
      }

      if (key === "\u001b[C" || key === "l") {
        void controller.seek(5).catch(reportError);
        return;
      }

      if (key === "+" || key === "=") {
        void controller.changeVolume(5).catch(reportError);
        return;
      }

      if (key === "-") {
        void controller.changeVolume(-5).catch(reportError);
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
    const handleResize = () => render(state);

    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString("utf8");
      if ((key === "o" || key === "O") && openBrowser) {
        if (!openBrowser()) {
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

export function buildDashboard(state: DashboardState): string {
  const columns = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const horizontalMargin = columns >= 80 ? 8 : 0;
  const width = Math.max(1, Math.min(100, columns - horizontalMargin));
  const lines = buildDashboardLines(state, width, rows);

  return paintScreen(lines, width);
}

type LogoMode = "full" | "compact" | "none";

interface LayoutCandidate {
  logo: LogoMode;
  gap: number;
  panelPaddingY: number;
}

function buildDashboardLines(state: DashboardState, width: number, rows: number): ScreenLine[] {
  const candidates = layoutCandidates(width, rows);
  const layouts = candidates.map((candidate) => buildDashboardCandidate(state, width, candidate));
  return layouts.find((layout) => layout.length <= rows) ?? layouts[layouts.length - 1];
}

function layoutCandidates(width: number, rows: number): LayoutCandidate[] {
  const shouldPreferCompact = width < 72 || rows < 28;
  const compactCandidates: LayoutCandidate[] = [
    { logo: "compact", gap: 1, panelPaddingY: 0 },
    { logo: "compact", gap: 0, panelPaddingY: 0 },
    { logo: "compact", gap: 1, panelPaddingY: 1 },
    { logo: "none", gap: 0, panelPaddingY: 0 }
  ];

  if (shouldPreferCompact) {
    return compactCandidates;
  }

  return [
    { logo: "full", gap: 1, panelPaddingY: 1 },
    ...compactCandidates
  ];
}

function buildDashboardCandidate(state: DashboardState, width: number, candidate: LayoutCandidate): ScreenLine[] {
  const progressDuration = state.runtime.duration ?? 1;
  const progressValue = state.runtime.timePos ?? 0;
  const progressClock = `${formatClock(progressValue)} / ${formatClock(state.runtime.duration)}`;
  const playerBodyWidth = width - (PANEL_PADDING_X * 2);
  const progressWidth = Math.max(4, playerBodyWidth - progressClock.length - 2);
  const stateLine = `${state.status.toLowerCase()}  volume ${state.runtime.volume}%`;
  const errorLines = state.error ? wrapText(state.error, playerBodyWidth - 6).slice(0, 2) : [];
  const artistLine = formatArtistLine(state.runtime.artist);
  const playerLines = [
    inlineRight(state.headline, stateLine, playerBodyWidth),
    `${renderBar(progressValue, progressDuration, progressWidth)}  ${progressClock}`,
    state.error ? `error ${errorLines.join(" ")}` : artistLine
  ].filter((line, index) => index < 2 || line.length > 0);
  const player = sectionLines("Now Playing", playerLines, width, { paddingY: candidate.panelPaddingY });
  const controls = sectionLines("Controls", controlLines(state, playerBodyWidth), width, { paddingY: candidate.panelPaddingY });
  return [
    ...logoLines(width, candidate.logo),
    ...blankLines(candidate.gap),
    ...player,
    ...blankLines(candidate.gap),
    ...controls
  ];
}

function inlineRight(left: string, right: string, width: number): string {
  if (width <= 0) {
    return "";
  }

  if (right.length >= width) {
    return right.slice(0, width);
  }

  const gap = 2;
  const leftWidth = Math.max(0, width - right.length - gap);
  const fittedLeft = left.length > leftWidth
    ? `${left.slice(0, Math.max(0, leftWidth - 3))}...`
    : left;
  const spacing = Math.max(gap, width - fittedLeft.length - right.length);
  return `${fittedLeft}${" ".repeat(spacing)}${right}`;
}

function logoLines(width: number, mode: LogoMode): ScreenLine[] {
  if (mode === "none") {
    return [];
  }

  if (mode === "compact") {
    return [{ text: centerText("CLAUDE FM", width), variant: "logo" as const }];
  }

  const logo = [
    "█▀▀ █  ▄▀▀▄ █ █ █▀▄ █▀▀  █▀▀ █▄▀▄█",
    "█   █  █▀▀█ █ █ █ █ █▀   █▀  █ ▀ █",
    "▀▀▀ ▀▀ ▀  ▀ ▀▀▀ ▀▀  ▀▀▀  ▀   ▀   ▀"
  ];

  return [
    ...logo.map((line) => ({ text: centerText(line, width), variant: "logo" as const })),
    { text: "", variant: "blank" as const },
    { text: centerText("music for thinking and building", width), variant: "muted" as const }
  ];
}
