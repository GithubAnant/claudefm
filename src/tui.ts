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
  cursorTo(process.stdout, 0, 0);
  clearScreenDown(process.stdout);
  process.stdout.write(buildDashboard(state));
}

function buildDashboard(state: DashboardState): string {
  const columns = process.stdout.columns || 80;
  const width = Math.max(72, Math.min(108, columns - 2));
  const leftWidth = Math.max(38, Math.floor((width - 3) * 0.62));
  const rightWidth = width - leftWidth - 3;
  const progressDuration = state.runtime.duration ?? 1;
  const progressValue = state.runtime.timePos ?? 0;
  const progressWidth = Math.max(18, leftWidth - 12);

  const hero = createBox("Claude FM", [
    `${state.status}  |  always live  |  one stream, zero search`,
    `source  ${state.url || CLAUDE_FM_URL}`
  ], width);

  const nowPlaying = createBox("Now Playing", [
    state.headline,
    ...wrapText(state.detail, leftWidth - 2),
    "",
    `${renderBar(progressValue, progressDuration, progressWidth)}  ${formatClock(progressValue)} / ${formatClock(state.runtime.duration)}`,
    state.error ? `error   ${state.error}` : `artist  ${state.runtime.artist || "--"}`
  ], leftWidth);

  const stats = createBox("Runtime", [
    ...summarizeRuntime(state.runtime),
    `setup   ${state.installCommand || "none"}`,
    state.browserEnabled ? "browser yes" : "browser no"
  ], rightWidth);

  const controls = createBox("Controls", [
    state.canUseRichPlayer
      ? "space pause/resume   left/right seek   +/- volume"
      : "rich transport controls need mpv",
    state.browserEnabled ? "o open youtube     q quit" : "q quit",
    "style openaudio-inspired single-stream layout"
  ], width);

  return [
    hero,
    joinColumns(nowPlaying, stats),
    controls
  ].join("\n");
}

function fit(text: string, width: number): string {
  if (text.length > width) {
    return `${text.slice(0, Math.max(0, width - 3))}...`;
  }

  return text.padEnd(width, " ");
}

function createBox(title: string, lines: string[], width: number): string {
  const innerWidth = Math.max(8, width - 2);
  const bodyWidth = innerWidth - 2;
  const topLabel = ` ${title.toUpperCase()} `;
  const top = `┌${topLabel}${"─".repeat(Math.max(0, innerWidth - topLabel.length))}┐`;
  const body = lines.flatMap((line) => {
    if (line.length === 0) {
      return [`│ ${" ".repeat(bodyWidth)} │`];
    }

    return wrapText(line, bodyWidth).map((part) => `│ ${fit(part, bodyWidth)} │`);
  });
  const bottom = `└${"─".repeat(innerWidth)}┘`;
  return [top, ...body, bottom].join("\n");
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

function joinColumns(left: string, right: string): string {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const leftWidth = Math.max(...leftLines.map((line) => line.length));
  const rows = Math.max(leftLines.length, rightLines.length);
  const output: string[] = [];

  for (let index = 0; index < rows; index += 1) {
    const leftLine = leftLines[index] ?? " ".repeat(leftWidth);
    const rightLine = rightLines[index] ?? "";
    output.push(`${fit(leftLine, leftWidth)}   ${rightLine}`);
  }

  return output.join("\n");
}

function enterScreen(): void {
  process.stdout.write(ENTER_ALT_SCREEN);
}

function exitScreen(): void {
  process.stdout.write(EXIT_ALT_SCREEN);
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
