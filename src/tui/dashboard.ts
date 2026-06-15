import process from "node:process";
import { clearScreenDown, cursorTo } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { CLAUDE_FM_SEARCH_LOCATOR } from "../constants.js";
import { saveStreamUrl } from "../config.js";
import { inspectEnvironment } from "../environment.js";
import { formatClock, formatDisplayTitle, renderBar } from "../format.js";
import { MpvController, type MpvAudioDevice } from "../mpv-controller.js";
import { openInBrowser, playWithFfplay, resolveAvailableStream, resolvePlayer } from "../player.js";
import type { CommandRunner, EnvironmentInfo, MpvRuntimeState, ParsedArgs, Platform } from "../types.js";
import { blankLines, centerText, paintScreen, type ScreenLine, wrapText } from "./screen.js";
import {
  controlLines,
  describeRuntime,
  formatArtistLine,
  formatPlaybackError,
  sectionLines,
  styleControlLine
} from "./sections.js";
import { type CommandPaletteState, type DashboardState, EMPTY_PLAYER } from "./state.js";
import { enterScreen, exitScreen, PANEL_PADDING_X, THEME } from "./theme.js";

const CTRL_P = "\u0010";
const ESC = "\u001b";
const ARROW_UP = "\u001b[A";
const ARROW_DOWN = "\u001b[B";
const ENTER_KEYS = new Set(["\r", "\n"]);
const BACKSPACE_KEYS = new Set(["\u007f", "\b"]);
const CLEAR_INPUT_KEYS = new Set(["\u0015", "\u000b", "\u001b\u007f"]);
const COMMANDS = ["Set YT stream link", "Select output device", "GitHub repo"] as const;
const PROJECT_URL = "https://github.com/GithubAnant/claudefm";
const SETTINGS_TIP = "tip: rewind 10-15s if live audio stutters";
const RENDER_THROTTLE_MS = 500;
export const LONG_PAUSE_RELOAD_MS = 15 * 60 * 1000;
const MPV_HEALTHCHECK_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [2000, 5000, 10000];
let commandPaletteRequestId = 0;

export function shouldUseDashboard(options: Pick<ParsedArgs, "json" | "ui">): boolean {
  return options.ui && !options.json && Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

export function shouldRefreshPausedPlayback(
  state: Pick<DashboardState, "runtime" | "isLiveStream">,
  pausedSince: number | null,
  now = Date.now()
): boolean {
  return Boolean(
    state.isLiveStream &&
    state.runtime.paused &&
    pausedSince !== null &&
    now - pausedSince >= LONG_PAUSE_RELOAD_MS
  );
}

export async function runDashboard(
  options: Pick<ParsedArgs, "player" | "url" | "browser">,
  runner: CommandRunner,
  platform: Platform = process.platform
): Promise<number> {
  const environment = inspectEnvironment(runner, platform);
  const browserEnabled = options.browser && environment.commands.open;
  const resolvedPlayer = environment.canPlayTerminal
    ? resolvePlayer(options.player, environment)
    : null;
  const state: DashboardState = {
    status: "STARTING",
    headline: "Claude FM",
    detail: "Connecting to the live stream.",
    runtime: { ...EMPTY_PLAYER, title: "Claude FM" },
    browserEnabled,
    canUseRichPlayer: resolvedPlayer === "mpv",
    installCommand: environment.installPlan.command,
    playerLabel: resolvedPlayer ?? environment.preferredPlayer ?? "none",
    url: options.url,
    isLiveStream: false
  };
  const openBrowser = () => openInBrowser(state.url, runner, platform) === 0;
  const openProject = () => openInBrowser(PROJECT_URL, runner, platform) === 0;

  if (!environment.canPlayTerminal) {
    state.status = "ERROR";
    state.detail = environment.installPlan.command
      ? `Run ${environment.installPlan.command} to unlock full terminal playback.`
      : environment.installPlan.steps[0];
    state.error = formatTerminalPlaybackSetupError(environment);
    return await holdStaticDashboard(
      state,
      browserEnabled ? openBrowser : undefined,
      environment.commands.open ? openProject : undefined
    );
  }

  if (resolvedPlayer === "mpv") {
    return await runRichDashboard(
      state,
      options.url,
      runner,
      browserEnabled ? openBrowser : undefined,
      environment.commands.open ? openProject : undefined
    );
  }

  return await runLegacyDashboard(
    state,
    runner,
    options.url,
    browserEnabled ? openBrowser : undefined,
    environment.commands.open ? openProject : undefined
  );
}

function formatTerminalPlaybackSetupError(environment: EnvironmentInfo): string {
  if (environment.installPlan.command) {
    return `Terminal playback is unavailable on this machine. Run ${environment.installPlan.command}, then run claudefm doctor.`;
  }

  return `Terminal playback is unavailable on this machine. ${environment.installPlan.steps[0]} Then run claudefm doctor.`;
}

async function runRichDashboard(
  state: DashboardState,
  streamUrl: string,
  runner: CommandRunner,
  openBrowser?: () => boolean,
  openProject?: () => boolean
): Promise<number> {
  let nextUrl: string | undefined = streamUrl;

  while (nextUrl !== undefined) {
    let controller: MpvController;

    try {
      controller = await startRichPlayback(state, nextUrl, runner);
    } catch (error) {
      if (!isStreamUnavailableError(error)) {
        state.status = "ERROR";
        state.runtime = { ...state.runtime, status: "idle" };
        state.error = formatPlaybackError(error);
        state.detail = openBrowser
          ? "Could not start mpv. Press o to open YouTube."
          : "Could not start mpv. Run claudefm doctor.";
        return await holdStaticDashboard(state, openBrowser, openProject);
      }

      const recovered = await holdRecoveryDashboard(state, runner, openBrowser, openProject);
      if (recovered === null) {
        return 0;
      }

      nextUrl = recovered;
      continue;
    }

    return await holdInteractiveDashboard(state, controller, runner, openBrowser, openProject);
  }

  return 0;
}

function isStreamUnavailableError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("stream unavailable") || message.includes("fallback search also failed");
}

async function startRichPlayback(
  state: DashboardState,
  streamUrl: string,
  runner: CommandRunner,
  options: { paused?: boolean; startSeconds?: number } = {}
): Promise<MpvController> {
  state.status = "STARTING";
  state.runtime = { ...state.runtime, status: "starting", paused: Boolean(options.paused) };
  state.detail = "Checking YouTube stream availability.";
  state.error = undefined;
  const availability = resolveAvailableStream(streamUrl, runner);
  const controller = new MpvController();

  if (availability.fallbackUsed) {
    state.url = availability.url;
    state.detail = "Default stream moved. Using the current Claude FM result.";
  } else {
    state.url = availability.url;
    state.detail = "Connecting to the live stream.";
  }
  state.isLiveStream = availability.isLive;

  controller.on("state", (nextState: MpvRuntimeState) => {
    state.runtime = nextState;
    state.status = nextState.status.toUpperCase();
    state.headline = formatDisplayTitle(nextState.title);
    state.detail = describeRuntime(nextState);
  });

  try {
    await controller.start(availability.url, {
      paused: options.paused,
      startSeconds: options.startSeconds
    });
  } catch (error) {
    await controller.destroy().catch(() => undefined);
    throw error;
  }

  state.runtime = controller.snapshot;
  state.status = state.runtime.status.toUpperCase();
  state.headline = formatDisplayTitle(state.runtime.title);
  state.detail = describeRuntime(state.runtime);
  return controller;
}

async function runLegacyDashboard(
  state: DashboardState,
  runner: CommandRunner,
  streamUrl: string,
  openBrowser?: () => boolean,
  openProject?: () => boolean
): Promise<number> {
  state.status = "PLAYING";
  state.headline = "Claude FM";
  state.detail = "Rich controls require mpv. Starting basic audio mode instead.";
  resetRenderFrame();
  render(state, { clear: true, force: true });
  const code = playWithFfplay(streamUrl, runner);
  state.status = code === 0 ? "STOPPED" : "ERROR";
  state.detail = code === 0 ? "Playback finished." : "Basic audio mode exited with an error.";
  state.error = code === 0 ? undefined : "ffplay playback failed.";
  return await holdStaticDashboard(state, openBrowser, openProject);
}

async function holdInteractiveDashboard(
  state: DashboardState,
  initialController: MpvController,
  runner: CommandRunner,
  openBrowser?: () => boolean,
  openProject?: () => boolean
): Promise<number> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const cleanupTasks = new Set<() => void>();
  let finished = false;
  let renderTimer: NodeJS.Timeout | undefined;
  let healthTimer: NodeJS.Timeout | undefined;
  let controller: MpvController | null = initialController;
  let retrying = false;
  let retryCount = 0;
  let checkingHealth = false;
  let pausedSince: number | null = state.runtime.paused ? Date.now() : null;

  const cleanup = async () => {
    cleanupTasks.forEach((task) => task());
    cleanupTasks.clear();
    if (renderTimer) {
      clearTimeout(renderTimer);
    }
    if (healthTimer) {
      clearInterval(healthTimer);
    }
    exitScreen();
    await controller?.destroy().catch(() => undefined);
  };

  enterScreen();
  resetRenderFrame();
  render(state, { clear: true, force: true });

  return await new Promise<number>((resolve) => {
    const finish = async (code: number) => {
      if (finished) {
        return;
      }

      finished = true;
      await cleanup();
      resolve(code);
    };

    const syncPausedSince = () => {
      if (state.runtime.paused) {
        pausedSince ??= Date.now();
        return;
      }

      pausedSince = null;
    };

    const checkControllerHealth = async () => {
      if (finished || retrying || checkingHealth || !controller) {
        return;
      }

      checkingHealth = true;
      try {
        await controller.ping();
      } catch (error) {
        reportError(error);
      } finally {
        checkingHealth = false;
      }
    };

    const renderNow = (options: RenderOptions = {}) => {
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = undefined;
      }

      syncPausedSince();
      render(state, options);
    };

    const scheduleRender = (options: RenderOptions = {}) => {
      if (finished) {
        return;
      }

      if (options.clear || options.force) {
        renderNow(options);
        return;
      }

      if (renderTimer) {
        return;
      }

      renderTimer = setTimeout(() => {
        renderTimer = undefined;
        syncPausedSince();
        render(state);
      }, RENDER_THROTTLE_MS);
      renderTimer.unref?.();
    };

    const reportError = (error: unknown) => {
      state.error = error instanceof Error ? error.message : String(error);
      renderNow({ force: true });
    };

    healthTimer = setInterval(() => {
      void checkControllerHealth();
    }, MPV_HEALTHCHECK_INTERVAL_MS);
    healthTimer.unref?.();

    const withController = (): MpvController | null => {
      if (controller) {
        return controller;
      }

      state.error = "Playback is not running.";
      renderNow({ force: true });
      return null;
    };

    const togglePlayback = async () => {
      syncPausedSince();
      const activeController = withController();
      if (!activeController) {
        return;
      }

      if (shouldRefreshPausedPlayback(state, pausedSince)) {
        state.status = "STARTING";
        state.runtime = { ...state.runtime, status: "starting", paused: false };
        state.detail = "Refreshing the stream after a long pause.";
        state.error = undefined;
        renderNow({ force: true });
        await activeController.resumeFresh(state.url);
        pausedSince = null;
        return;
      }

      const wasPaused = state.runtime.paused;
      await activeController.togglePause();
      pausedSince = wasPaused ? null : Date.now();
    };

    const attachControllerHandlers = (nextController: MpvController) => {
      const handleState = () => scheduleRender();
      nextController.on("state", handleState);
      cleanupTasks.add(() => {
        nextController.off("state", handleState);
      });
      nextController.once("exit", () => {
        void handleUnexpectedExit();
      });
    };

    const handleUnexpectedExit = async () => {
      if (finished || retrying) {
        return;
      }

      controller = null;
      retrying = true;
      const restorePaused = state.runtime.paused || pausedSince !== null;
      const restorePosition = state.isLiveStream ? undefined : state.runtime.timePos ?? undefined;

      while (!finished && retryCount < RETRY_DELAYS_MS.length) {
        const waitMs = RETRY_DELAYS_MS[retryCount];
        retryCount += 1;
        state.status = "RETRYING";
        state.runtime = { ...state.runtime, status: "starting" };
        state.detail = `Playback stopped. Retrying in ${Math.round(waitMs / 1000)}s.`;
        state.error = `mpv exited unexpectedly. Retry ${retryCount}/${RETRY_DELAYS_MS.length}.`;
        renderNow({ force: true });

        await delay(waitMs);
        if (finished) {
          return;
        }

        try {
          const nextController = await startRichPlayback(state, state.url, runner, {
            paused: restorePaused,
            startSeconds: restorePosition
          });
          controller = nextController;
          retrying = false;
          retryCount = 0;
          if (restorePaused) {
            pausedSince ??= Date.now();
            state.runtime = { ...state.runtime, status: "paused", paused: true };
            state.status = "PAUSED";
            state.detail = "Paused. Press space to resume.";
          }
          attachControllerHandlers(nextController);
          renderNow({ force: true });
          return;
        } catch (error) {
          state.error = formatPlaybackError(error);
          renderNow({ force: true });
        }
      }

      retrying = false;
      state.status = "ERROR";
      state.runtime = { ...state.runtime, status: "idle" };
      state.detail = "Playback stopped after retry attempts. Press q to quit.";
      state.error = "Could not restore playback.";
      renderNow({ force: true });
    };

    const handleSetStreamUrl = async (nextUrl: string) => {
      state.url = nextUrl;
      state.error = undefined;
      state.status = "STARTING";
      state.headline = "Loading stream";
      state.detail = "Switching stream link.";
      renderNow({ force: true });
      const activeController = withController();
      if (!activeController) {
        return;
      }

      const availability = resolveAvailableStream(nextUrl, runner);
      state.url = availability.url;
      state.isLiveStream = availability.isLive;
      await activeController.loadUrl(availability.url);
      saveStreamUrl(nextUrl);
    };
    const handleListAudioDevices = () => {
      const activeController = withController();
      return activeController ? activeController.listAudioDevices() : Promise.resolve([]);
    };
    const handleSelectAudioDevice = async (device: MpvAudioDevice) => {
      const activeController = withController();
      if (!activeController) {
        return;
      }

      await activeController.selectAudioDevice(device.name);
      state.detail = `Output device set to ${device.description}.`;
      renderNow({ force: true });
    };

    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString("utf8");

      if (handleCommandPaletteKey(state, key, {
        setStreamUrl: handleSetStreamUrl,
        listAudioDevices: handleListAudioDevices,
        selectAudioDevice: handleSelectAudioDevice,
        openProject
      })) {
        renderNow({ force: true });
        return;
      }

      if (key === "q" || key === "Q" || key === "\u0003") {
        void finish(0);
        return;
      }

      if ((key === "o" || key === "O") && openBrowser) {
        if (!openBrowser()) {
          state.error = "Browser handoff failed.";
          renderNow({ force: true });
        }
        return;
      }

      if (key === " ") {
        void togglePlayback().catch(reportError);
        return;
      }

      if (key === "\u001b[D" || key === "h") {
        void withController()?.seek(-5).catch(reportError);
        return;
      }

      if (key === "\u001b[C" || key === "l") {
        void withController()?.seek(5).catch(reportError);
        return;
      }

      if (key === "+" || key === "=") {
        void withController()?.changeVolume(5).catch(reportError);
        return;
      }

      if (key === "-") {
        void withController()?.changeVolume(-5).catch(reportError);
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

    const handleResize = () => renderNow({ clear: true, force: true });
    stdout.on("resize", handleResize);
    cleanupTasks.add(() => {
      stdout.off("resize", handleResize);
    });

    const handleSigInt = () => void finish(0);
    const handleSigTerm = () => void finish(0);
    process.once("SIGINT", handleSigInt);
    process.once("SIGTERM", handleSigTerm);
    attachControllerHandlers(initialController);
    cleanupTasks.add(() => {
      process.off("SIGINT", handleSigInt);
      process.off("SIGTERM", handleSigTerm);
    });
  });
}

async function holdRecoveryDashboard(
  state: DashboardState,
  runner: CommandRunner,
  openBrowser?: () => boolean,
  openProject?: () => boolean
): Promise<string | null> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  state.status = "ERROR";
  state.runtime = { ...state.runtime, status: "idle" };
  state.headline = "Claude FM";
  state.error = "This stream is no longer valid. Press s to search, or ctrl+p to enter a URL.";
  state.detail = "Stream unavailable. Search for the current Claude FM stream or paste a YouTube link.";

  enterScreen();
  resetRenderFrame();
  render(state, { clear: true, force: true });

  if (!stdin.isTTY) {
    exitScreen();
    return null;
  }

  return await new Promise<string | null>((resolve) => {
    let settled = false;

    const teardown = () => {
      stdin.off("data", handleKey);
      stdout.off("resize", handleResize);
      stdin.setRawMode?.(false);
      stdin.pause();
      exitScreen();
    };

    const finishWith = (value: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      teardown();
      resolve(value);
    };

    const tryResolveUrl = (candidate: string) => {
      state.error = undefined;
      state.detail = "Checking the stream...";
      render(state, { force: true });

      try {
        const availability = resolveAvailableStream(candidate, runner);
        state.url = availability.url;
        saveStreamUrl(candidate);
        finishWith(candidate);
      } catch (error) {
        state.error = `${formatPlaybackError(error)} Press s to search, or ctrl+p to enter a URL.`;
        state.detail = "Stream unavailable. Search for the current Claude FM stream or paste a YouTube link.";
        render(state, { force: true });
      }
    };

    const handleResize = () => render(state, { clear: true, force: true });
    const handleSetStreamUrl = async (nextUrl: string) => {
      tryResolveUrl(nextUrl);
    };

    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString("utf8");

      if (handleCommandPaletteKey(state, key, {
        setStreamUrl: handleSetStreamUrl,
        openProject
      })) {
        render(state, { force: true });
        return;
      }

      if (key === "s" || key === "S") {
        tryResolveUrl(CLAUDE_FM_SEARCH_LOCATOR);
        return;
      }

      if ((key === "o" || key === "O") && openBrowser) {
        if (!openBrowser()) {
          state.error = "Browser handoff failed.";
        }
        render(state, { force: true });
        return;
      }

      if (key === "q" || key === "Q" || key === "\u0003") {
        finishWith(null);
      }
    };

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", handleKey);
    stdout.on("resize", handleResize);
  });
}

async function holdStaticDashboard(
  state: DashboardState,
  openBrowser?: () => boolean,
  openProject?: () => boolean
): Promise<number> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  enterScreen();
  resetRenderFrame();
  render(state, { clear: true, force: true });

  if (!stdin.isTTY) {
    exitScreen();
    return 0;
  }

  return await new Promise<number>((resolve) => {
    const handleResize = () => render(state, { clear: true, force: true });
    const handleSetStreamUrl = async (nextUrl: string) => {
      state.url = nextUrl;
      state.error = undefined;
      state.detail = openBrowser
        ? "Stream link updated. Press o to open YouTube."
        : "Stream link updated.";
      saveStreamUrl(nextUrl);
    };

    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString("utf8");

      if (handleCommandPaletteKey(state, key, {
        setStreamUrl: handleSetStreamUrl,
        openProject
      })) {
        render(state, { force: true });
        return;
      }

      if ((key === "o" || key === "O") && openBrowser) {
        if (!openBrowser()) {
          state.error = "Browser handoff failed.";
        }
        render(state, { force: true });
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

interface RenderOptions {
  clear?: boolean;
  force?: boolean;
}

let lastRenderedFrame = "";
let lastRenderedRows = 0;
let lastRenderedColumns = 0;

function resetRenderFrame(): void {
  lastRenderedFrame = "";
  lastRenderedRows = 0;
  lastRenderedColumns = 0;
}

function render(state: DashboardState, options: RenderOptions = {}): void {
  const frame = buildDashboard(state);
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const terminalSizeChanged = rows !== lastRenderedRows || columns !== lastRenderedColumns;

  if (!options.force && !terminalSizeChanged && frame === lastRenderedFrame) {
    return;
  }

  cursorTo(process.stdout, 0, 0);
  if (options.clear || terminalSizeChanged) {
    clearScreenDown(process.stdout);
  }

  process.stdout.write(`${THEME.canvas}${THEME.text}${frame}`);
  lastRenderedFrame = frame;
  lastRenderedRows = rows;
  lastRenderedColumns = columns;
}

export function buildDashboard(state: DashboardState): string {
  const columns = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const minimumSideMargin = columns >= 90 ? 12 : columns >= 72 ? 8 : columns >= 56 ? 4 : 0;
  const width = Math.max(1, Math.min(76, columns - (minimumSideMargin * 2)));
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
  const layout = layouts.find((candidateLayout) => candidateLayout.length <= rows) ?? layouts[layouts.length - 1];

  if (state.commandPalette) {
    return overlayCommandPalette(layout, state.commandPalette, width, rows);
  }

  return layout;
}

function layoutCandidates(width: number, rows: number): LayoutCandidate[] {
  const shouldPreferCompact = width < 72 || rows < 28;
  const compactCandidates: LayoutCandidate[] = [
    { logo: "compact", gap: 1, panelPaddingY: 1 },
    { logo: "compact", gap: 0, panelPaddingY: 1 },
    { logo: "compact", gap: 1, panelPaddingY: 0 },
    { logo: "compact", gap: 0, panelPaddingY: 0 },
    { logo: "none", gap: 0, panelPaddingY: 1 },
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
  const stateLine = `${state.status.toLowerCase()} | volume ${state.runtime.volume}%`;
  const headerStatusFits = "NOW PLAYING".length + stateLine.length + 2 <= playerBodyWidth;
  const errorLines = state.error ? wrapText(state.error, playerBodyWidth - 6).slice(0, 2) : [];
  const artistLine = formatArtistLine(state.runtime.artist);
  const playerLines = [
    ...(headerStatusFits ? [] : [stateLine]),
    state.headline,
    `${renderBar(progressValue, progressDuration, progressWidth)}  ${progressClock}`,
    state.error ? `error ${errorLines.join(" ")}` : artistLine
  ].filter((line, index) => index < 2 || line.length > 0);
  const player = sectionLines("Now Playing", playerLines, width, {
    paddingY: candidate.panelPaddingY,
    titleRight: headerStatusFits ? stateLine : undefined
  });
  const controls = sectionLines("Controls", controlLines(state, playerBodyWidth), width, {
    paddingY: candidate.panelPaddingY,
    styleLine: styleControlLine
  });
  return [
    ...logoLines(width, candidate.logo),
    ...blankLines(candidate.gap),
    ...player,
    ...blankLines(candidate.gap),
    ...controls
  ];
}

function logoLines(width: number, mode: LogoMode): ScreenLine[] {
  const logo = [
    "█▀▀ █  ▄▀▀▄ █ █ █▀▄ █▀▀ █▀▀ █▄▀▄█",
    "█   █  █▀▀█ █ █ █ █ █▀  █▀  █ ▀ █",
    "▀▀▀ ▀▀ ▀  ▀ ▀▀▀ ▀▀  ▀▀▀ ▀   ▀   ▀"
  ];

  if (mode === "none") {
    return [];
  }

  if (mode === "compact") {
    return logo.map((line) => ({ text: centerText(line, width), variant: "logo" as const }));
  }

  return [
    ...logo.map((line) => ({ text: centerText(line, width), variant: "logo" as const })),
    { text: "", variant: "blank" as const },
    { text: centerText("music for thinking and building", width), variant: "muted" as const },
    { text: "", variant: "blank" as const }
  ];
}

interface CommandPaletteActions {
  setStreamUrl: (nextUrl: string) => Promise<void>;
  listAudioDevices?: () => Promise<MpvAudioDevice[]>;
  selectAudioDevice?: (device: MpvAudioDevice) => Promise<void>;
  openProject?: () => boolean;
}

function handleCommandPaletteKey(state: DashboardState, key: string, actions: CommandPaletteActions): boolean {
  if (!state.commandPalette) {
    if (key === CTRL_P) {
      state.commandPalette = { mode: "menu", input: state.url, selectedIndex: 0 };
      return true;
    }

    return false;
  }

  if (key === ESC) {
    state.commandPalette = closeOrBackCommandPalette(state.commandPalette);
    return true;
  }

  if (state.commandPalette.mode === "menu") {
    if (key === ARROW_UP || key === "k") {
      state.commandPalette = {
        ...state.commandPalette,
        selectedIndex: wrapIndex((state.commandPalette.selectedIndex ?? 0) - 1, COMMANDS.length)
      };
      return true;
    }

    if (key === ARROW_DOWN || key === "j") {
      state.commandPalette = {
        ...state.commandPalette,
        selectedIndex: wrapIndex((state.commandPalette.selectedIndex ?? 0) + 1, COMMANDS.length)
      };
      return true;
    }

    if (ENTER_KEYS.has(key)) {
      const selectedIndex = state.commandPalette.selectedIndex ?? 0;
      if (selectedIndex === 0) {
        state.commandPalette = { ...state.commandPalette, mode: "url", message: undefined };
        return true;
      }

      if (selectedIndex === 2) {
        if (!actions.openProject?.()) {
          state.commandPalette = {
            ...state.commandPalette,
            message: "browser handoff unavailable"
          };
        }
        return true;
      }

      if (!actions.listAudioDevices) {
        state.commandPalette = {
          ...state.commandPalette,
          message: "output device selection needs mpv"
        };
        return true;
      }

      commandPaletteRequestId += 1;
      const requestId = commandPaletteRequestId;
      state.commandPalette = {
        ...state.commandPalette,
        mode: "devices",
        selectedIndex: 0,
        requestId,
        devices: [],
        message: "loading devices..."
      };
      void actions.listAudioDevices()
        .then((devices) => {
          if (!isActiveDeviceRequest(state, requestId)) {
            return;
          }

          const palette = state.commandPalette;
          const selectedIndex = selectedDeviceIndex(devices);
          state.commandPalette = {
            mode: "devices",
            input: palette.input,
            requestId,
            selectedIndex,
            devices,
            message: devices.length > 0 ? undefined : "no output devices found"
          };
        })
        .catch((error: unknown) => {
          if (!isActiveDeviceRequest(state, requestId)) {
            return;
          }

          const palette = state.commandPalette;
          state.commandPalette = {
            mode: "devices",
            input: palette.input,
            requestId,
            selectedIndex: 0,
            devices: [],
            message: error instanceof Error ? error.message : String(error)
          };
        });
    }

    return true;
  }

  if (state.commandPalette.mode === "devices") {
    const devices = state.commandPalette.devices ?? [];

    if (key === ARROW_UP || key === "k") {
      state.commandPalette = {
        ...state.commandPalette,
        selectedIndex: wrapIndex((state.commandPalette.selectedIndex ?? 0) - 1, Math.max(1, devices.length))
      };
      return true;
    }

    if (key === ARROW_DOWN || key === "j") {
      state.commandPalette = {
        ...state.commandPalette,
        selectedIndex: wrapIndex((state.commandPalette.selectedIndex ?? 0) + 1, Math.max(1, devices.length))
      };
      return true;
    }

    if (ENTER_KEYS.has(key)) {
      const device = devices[state.commandPalette.selectedIndex ?? 0];
      if (!device || !actions.selectAudioDevice) {
        return true;
      }

      state.commandPalette = undefined;
      void actions.selectAudioDevice(device).catch((error: unknown) => {
        state.error = error instanceof Error ? error.message : String(error);
      });
    }

    return true;
  }

  if (ENTER_KEYS.has(key)) {
    const nextUrl = state.commandPalette.input.trim();

    if (!isSupportedStreamUrl(nextUrl)) {
      state.commandPalette = {
        ...state.commandPalette,
        message: "enter a youtube http(s) link"
      };
      return true;
    }

    state.commandPalette = undefined;
    void actions.setStreamUrl(nextUrl).catch((error: unknown) => {
      state.error = error instanceof Error ? error.message : String(error);
    });
    return true;
  }

  if (BACKSPACE_KEYS.has(key)) {
    state.commandPalette = {
      ...state.commandPalette,
      input: state.commandPalette.input.slice(0, -1),
      message: undefined
    };
    return true;
  }

  if (CLEAR_INPUT_KEYS.has(key)) {
    state.commandPalette = {
      ...state.commandPalette,
      input: "",
      message: undefined
    };
    return true;
  }

  const input = textInputFromKey(key);
  if (input) {
    state.commandPalette = {
      ...state.commandPalette,
      input: `${state.commandPalette.input}${input}`,
      message: undefined
    };
  }

  return true;
}

function closeOrBackCommandPalette(palette: CommandPaletteState): CommandPaletteState | undefined {
  if (palette.mode === "menu") {
    return undefined;
  }

  return {
    mode: "menu",
    input: palette.input,
    selectedIndex: palette.mode === "devices" ? 1 : 0
  };
}

function isActiveDeviceRequest(
  state: DashboardState,
  requestId: number
): state is DashboardState & { commandPalette: CommandPaletteState & { mode: "devices"; requestId: number } } {
  return state.commandPalette?.mode === "devices" && state.commandPalette.requestId === requestId;
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function selectedDeviceIndex(devices: MpvAudioDevice[]): number {
  return Math.max(0, devices.findIndex((device) => device.selected));
}

function textInputFromKey(key: string): string {
  const bracketedPaste = /^\u001b\[200~([\s\S]*)\u001b\[201~$/.exec(key);
  const value = bracketedPaste ? bracketedPaste[1] : key;

  if (!bracketedPaste && value.includes(ESC)) {
    return "";
  }

  return Array.from(value)
    .filter((character) => character >= " " && character !== "\u007f")
    .join("");
}

function isSupportedStreamUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname);
  } catch {
    return false;
  }
}

function overlayCommandPalette(
  lines: ScreenLine[],
  palette: CommandPaletteState,
  width: number,
  rows: number
): ScreenLine[] {
  const viewportLines = centerLines(lines, rows);
  const modal = commandPaletteLines(palette, width);
  const start = Math.max(0, Math.floor((rows - modal.length) / 2));

  for (let index = 0; index < modal.length && start + index < viewportLines.length; index += 1) {
    viewportLines[start + index] = modal[index];
  }

  return viewportLines;
}

function centerLines(lines: ScreenLine[], rows: number): ScreenLine[] {
  const visible = lines.slice(0, rows);
  const topPad = Math.max(0, Math.floor((rows - visible.length) / 2));
  const output = [
    ...blankLines(topPad),
    ...visible
  ];

  while (output.length < rows) {
    output.push({ text: "", variant: "blank" });
  }

  return output;
}

function commandPaletteLines(palette: CommandPaletteState, width: number): ScreenLine[] {
  const boxWidth = Math.max(32, Math.min(width - 4, 64));
  const bodyWidth = Math.max(1, boxWidth - 6);
  const lines = paletteBodyLines(palette, bodyWidth, boxWidth);
  const footerLines = palette.mode === "menu"
    ? [
      modalLine("", "", bodyWidth, "modal", boxWidth),
      modalLine(SETTINGS_TIP, "", bodyWidth, "modalDim", boxWidth)
    ]
    : [
      modalLine("", "", bodyWidth, "modal", boxWidth),
      modalLine("", "", bodyWidth, "modal", boxWidth)
    ];

  return [
    modalLine("", "", bodyWidth, "modal", boxWidth),
    ...lines,
    ...footerLines,
    modalLine("", "", bodyWidth, "modal", boxWidth)
  ];
}

function paletteBodyLines(palette: CommandPaletteState, bodyWidth: number, boxWidth: number): ScreenLine[] {
  if (palette.mode === "menu") {
    return [
      modalLine("Commands", "esc", bodyWidth, "modalTitle", boxWidth),
      modalLine("", "", bodyWidth, "modal", boxWidth),
      modalLine("Search", "", bodyWidth, "modalMuted", boxWidth),
      modalLine("", "", bodyWidth, "modal", boxWidth),
      modalLine("Suggested", "", bodyWidth, "modalHot", boxWidth),
      ...COMMANDS.map((command, index) => modalLine(
        `${index === (palette.selectedIndex ?? 0) ? "> " : "  "}${command}`,
        "enter",
        bodyWidth,
        index === (palette.selectedIndex ?? 0) ? "modalHot" : "modal",
        boxWidth
      )),
      ...(palette.message ? [modalLine(palette.message, "", bodyWidth, "modalMuted", boxWidth)] : [])
    ];
  }

  if (palette.mode === "devices") {
    const devices = palette.devices ?? [];
    const visibleDevices = devices.slice(0, 6);
    return [
      modalLine("Select output device", "esc back", bodyWidth, "modalTitle", boxWidth),
      modalLine("", "", bodyWidth, "modal", boxWidth),
      modalLine("Current", "", bodyWidth, "modalHot", boxWidth),
      ...(devices.length > 0
        ? visibleDevices.flatMap((device, index) => [
          ...(index === 1
            ? [
              modalLine("", "", bodyWidth, "modal", boxWidth),
              modalLine("Other devices", "", bodyWidth, "modalHot", boxWidth)
            ]
            : []),
          modalLine(
          `${index === (palette.selectedIndex ?? 0) ? "> " : "  "}${device.description}`,
          device.selected ? "active" : "enter",
          bodyWidth,
          index === (palette.selectedIndex ?? 0) ? "modalHot" : "modal",
          boxWidth
          )
        ])
        : [modalLine(palette.message ?? "loading devices...", "", bodyWidth, "modalMuted", boxWidth)])
    ];
  }

  return [
    modalLine("Set YT stream link", "esc back", bodyWidth, "modalTitle", boxWidth),
    modalLine("", "", bodyWidth, "modal", boxWidth),
    modalLine("YouTube URL", "", bodyWidth, "modalHot", boxWidth),
    modalInputLine(palette.input || "https://", bodyWidth, boxWidth),
    modalLine(palette.message ?? "enter to apply", "", bodyWidth, palette.message ? "modalHot" : "modalMuted", boxWidth)
  ];
}

function modalLine(
  left: string,
  right: string,
  width: number,
  variant: ScreenLine["variant"],
  boxWidth: number
): ScreenLine {
  const text = right ? inlineModalRight(left, right, width) : left;
  return {
    text: `   ${text}`,
    variant,
    boxWidth
  };
}

function modalInputLine(value: string, width: number, boxWidth: number): ScreenLine {
  const inputWidth = Math.max(1, width - 2);
  const input = value.length > inputWidth - 2
    ? value.slice(Math.max(0, value.length - inputWidth + 5))
    : value;
  const fieldText = ` ${input}${THEME.accent}▌${THEME.text}`;
  const fittedField = `${fieldText}${" ".repeat(Math.max(0, inputWidth - input.length - 2))}`;
  const styledText = [
    "   ",
    THEME.panel,
    THEME.text,
    fittedField,
    THEME.panelAlt,
    " ".repeat(Math.max(0, boxWidth - inputWidth - 3))
  ].join("");

  return {
    text: `   ${value}`,
    styledText,
    variant: "modalInput",
    boxWidth
  };
}

function inlineModalRight(left: string, right: string, width: number): string {
  if (right.length >= width) {
    return right.slice(0, width);
  }

  const leftWidth = Math.max(0, width - right.length - 2);
  const fittedLeft = left.length > leftWidth
    ? `${left.slice(0, Math.max(0, leftWidth - 3))}...`
    : left;
  return `${fittedLeft}${" ".repeat(Math.max(2, width - fittedLeft.length - right.length))}${right}`;
}
