import process from "node:process";
import { clearScreenDown, cursorTo } from "node:readline";
import { CLAUDE_FM_URL } from "../constants.js";
import { inspectEnvironment } from "../environment.js";
import { formatClock, formatDisplayTitle, renderBar } from "../format.js";
import { MpvController } from "../mpv-controller.js";
import { openInBrowser, playWithFfplay } from "../player.js";
import type { CommandRunner, MpvRuntimeState, ParsedArgs, Platform } from "../types.js";
import { logoLines } from "./logo.js";
import { blankLines, paintScreen, type ScreenLine, wrapText } from "./screen.js";
import {
  controlLines,
  describeRuntime,
  formatArtistLine,
  formatPlaybackError,
  joinLineColumns,
  sectionLines,
  setupLines,
  shouldShowSetup
} from "./sections.js";
import { type DashboardState, EMPTY_PLAYER } from "./state.js";
import { enterScreen, exitScreen, PANEL_PADDING_X, SECTION_GAP, THEME } from "./theme.js";

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
  const detailLines = wrapText(state.detail, nowPlayingBodyWidth).slice(0, 2);
  const errorLines = state.error ? wrapText(state.error, nowPlayingBodyWidth - 6).slice(0, 2) : [];
  const artistLine = formatArtistLine(state.runtime.artist);
  const nowPlayingLines = [
    state.headline,
    ...detailLines,
    "",
    `${renderBar(progressValue, progressDuration, progressWidth)}  ${progressClock}`,
    state.error ? `error ${errorLines.join(" ")}` : artistLine
  ].filter((line, index) => index < 4 || line.length > 0);
  const hero = sectionLines("Claude FM", [
    state.status,
    `source ${state.url || CLAUDE_FM_URL}`
  ], width);
  const nowPlaying = sectionLines("Now Playing", nowPlayingLines, leftWidth);
  const sidePanel = shouldShowSetup(state)
    ? sectionLines("Setup", setupLines(state), rightWidth)
    : sectionLines("Status", [
        state.status.toLowerCase(),
        `volume ${state.runtime.volume}%`,
        `player ${state.playerLabel}`
      ], rightWidth);
  const controls = sectionLines("Controls", controlLines(state), width);
  const lines: ScreenLine[] = [
    ...logoLines(width),
    ...blankLines(SECTION_GAP),
    ...hero,
    ...blankLines(SECTION_GAP),
    ...joinLineColumns(nowPlaying, sidePanel, columnGap),
    ...blankLines(SECTION_GAP),
    ...controls
  ];

  return paintScreen(lines, width);
}
