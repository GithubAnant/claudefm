import test from "node:test";
import assert from "node:assert/strict";
import {
  CLAUDE_FM_URL,
  inspectEnvironment,
  parseArgs,
  playStream,
  resolveAudioUrl,
  resolvePlayer,
  resolveWatchUrl,
  run,
  runSetup
} from "../dist/index.js";
import { formatDisplayTitle } from "../dist/format.js";
import { buildDashboard } from "../dist/tui/dashboard.js";
import { formatArtistLine } from "../dist/tui/sections.js";

async function withCapturedConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];

  console.log = (...args) => {
    logs.push(args.join(" "));
  };

  console.error = (...args) => {
    errors.push(args.join(" "));
  };

  try {
    return {
      result: await fn(),
      logs,
      errors
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function withTerminalSize(columns, rows, fn) {
  const columnsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  const rowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");

  Object.defineProperty(process.stdout, "columns", { configurable: true, value: columns });
  Object.defineProperty(process.stdout, "rows", { configurable: true, value: rows });

  try {
    return fn();
  } finally {
    if (columnsDescriptor) {
      Object.defineProperty(process.stdout, "columns", columnsDescriptor);
    } else {
      delete process.stdout.columns;
    }

    if (rowsDescriptor) {
      Object.defineProperty(process.stdout, "rows", rowsDescriptor);
    } else {
      delete process.stdout.rows;
    }
  }
}

function dashboardState(overrides = {}) {
  return {
    status: "PAUSED",
    headline: "Claude FM",
    detail: "Paused. Press space to resume.",
    runtime: {
      status: "paused",
      paused: true,
      volume: 100,
      timePos: 3461,
      duration: 3477,
      cacheSeconds: null,
      bufferPercent: null,
      title: "Claude FM",
      artist: "",
      codec: "",
      sampleRate: null,
      channels: null
    },
    browserEnabled: true,
    canUseRichPlayer: true,
    installCommand: "brew install yt-dlp mpv",
    playerLabel: "mpv",
    url: CLAUDE_FM_URL,
    ...overrides
  };
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

test("parseArgs defaults to play command and Claude FM URL", () => {
  assert.deepEqual(parseArgs([]), {
    command: "play",
    player: undefined,
    url: CLAUDE_FM_URL,
    json: false,
    yes: false,
    print: false,
    browser: true,
    ui: true
  });
});

test("parseArgs accepts setup options", () => {
  assert.deepEqual(parseArgs(["setup", "--yes", "--json"]), {
    command: "setup",
    player: undefined,
    url: CLAUDE_FM_URL,
    json: true,
    yes: true,
    print: false,
    browser: true,
    ui: true
  });
});

test("inspectEnvironment prefers mpv when available", () => {
  const runner = {
    run(command, args = []) {
      return {
        status: command === "which" && ["yt-dlp", "mpv", "open", "brew"].includes(args[0]) ? 0 : 1,
        stdout: "",
        stderr: ""
      };
    }
  };

  const environment = inspectEnvironment(runner, "darwin");

  assert.equal(environment.preferredPlayer, "mpv");
  assert.equal(environment.canPlayTerminal, true);
  assert.equal(environment.installPlan.command, "brew install yt-dlp mpv");
});

test("resolvePlayer uses environment state", () => {
  assert.equal(
    resolvePlayer(undefined, {
      preferredPlayer: "mpv",
      commands: { mpv: true, ffplay: false }
    }),
    "mpv"
  );
});

test("resolvePlayer rejects unsupported player names", () => {
  assert.throws(
    () => resolvePlayer("vlc", { preferredPlayer: null, commands: { mpv: false, ffplay: false } }),
    /Unsupported player: vlc/
  );
});

test("resolveAudioUrl uses yt-dlp output", () => {
  const runner = {
    run(command) {
      return {
        status: command === "yt-dlp" ? 0 : 1,
        stdout: "https://cdn.example.test/audio.m3u8\n",
        stderr: ""
      };
    }
  };

  assert.equal(resolveAudioUrl(CLAUDE_FM_URL, runner), "https://cdn.example.test/audio.m3u8");
});

test("resolveWatchUrl converts a search locator into a YouTube watch URL", () => {
  const runner = {
    run() {
      return {
        status: 0,
        stdout: "YmQ7jRgf4f0\n",
        stderr: ""
      };
    }
  };

  assert.equal(
    resolveWatchUrl(CLAUDE_FM_URL, runner),
    "https://www.youtube.com/watch?v=YmQ7jRgf4f0"
  );
});

test("playStream launches mpv when available", async () => {
  const invocations = [];
  const runner = {
    run(command, args = [], options) {
      invocations.push([command, args, options]);

      if (command === "which") {
        return {
          status: ["yt-dlp", "mpv", "open", "brew"].includes(args[0]) ? 0 : 1,
          stdout: "",
          stderr: ""
        };
      }

      if (command === "yt-dlp") {
        return {
          status: 0,
          stdout: "https://cdn.example.test/audio.m3u8\n",
          stderr: ""
        };
      }

      if (command === "mpv") {
        return { status: 0, stdout: "", stderr: "" };
      }

      throw new Error(`Unexpected command: ${command}`);
    }
  };

  const { result, logs } = await withCapturedConsole(() =>
    playStream({ player: undefined, url: CLAUDE_FM_URL, browser: true }, runner, "darwin")
  );

  assert.equal(result, 0);
  assert.match(logs[0], /Starting Claude FM with mpv/);
  assert.equal(invocations.at(-1)[0], "mpv");
});

test("playStream falls back to browser when terminal deps are missing", async () => {
  const invocations = [];
  const runner = {
    run(command, args = []) {
      invocations.push([command, args]);

      if (command === "which") {
        return {
          status: args[0] === "open" || args[0] === "brew" ? 0 : 1,
          stdout: "",
          stderr: ""
        };
      }

      if (command === "yt-dlp") {
        return {
          status: 0,
          stdout: "YmQ7jRgf4f0\n",
          stderr: ""
        };
      }

      if (command === "open") {
        return { status: 0, stdout: "", stderr: "" };
      }

      throw new Error(`Unexpected command: ${command}`);
    }
  };

  const { result, logs } = await withCapturedConsole(() =>
    playStream({ player: undefined, url: CLAUDE_FM_URL, browser: true }, runner, "darwin")
  );

  assert.equal(result, 0);
  assert.match(logs[0], /Terminal playback dependencies are missing/);
  assert.equal(invocations.at(-1)[0], "open");
});

test("runSetup prints the recommended command", async () => {
  const runner = {
    run(command, args = []) {
      return {
        status: command === "which" && ["brew", "open"].includes(args[0]) ? 0 : 1,
        stdout: "",
        stderr: ""
      };
    }
  };

  const { result, logs } = await withCapturedConsole(() =>
    runSetup({ print: true, json: false, yes: false }, runner, "darwin")
  );

  assert.equal(result, 0);
  assert.equal(logs[0], "brew install yt-dlp mpv");
});

test("run prints help", async () => {
  const { result, logs } = await withCapturedConsole(() => run(["--help"]));
  assert.equal(result, 0);
  assert.match(logs[0], /Usage: claudefm/);
});

test("run reports unknown args", async () => {
  const { result, errors } = await withCapturedConsole(() => run(["--wat"]));
  assert.equal(result, 1);
  assert.match(errors[0], /Unknown argument: --wat/);
});

test("formatDisplayTitle removes Claude FM timestamp noise", () => {
  assert.equal(
    formatDisplayTitle("Claude FM music for thinking and building 2026-05-12 12:26"),
    "Claude FM"
  );
  assert.equal(formatDisplayTitle("Other Stream 2026-05-12 12:26"), "Other Stream");
});

test("formatArtistLine hides generic Claude artist metadata", () => {
  assert.equal(formatArtistLine("Claude"), "");
  assert.equal(formatArtistLine("Claude FM"), "");
  assert.equal(formatArtistLine("Real Artist"), "artist Real Artist");
});

test("buildDashboard fits a short terminal viewport", () => {
  const output = withTerminalSize(40, 14, () => buildDashboard(dashboardState()));
  const lines = output.split("\n");
  const plainLines = stripAnsi(output).split("\n");

  assert.equal(lines.length, 14);
  assert.match(output, /█▀▀/);
  assert.match(output, /NOW PLAYING/);
  assert.match(output, /CONTROLS/);
  assert.ok(plainLines.some((line) => line.includes("NOW PLAYING") && line.includes("paused  volume 100%")));
  assert.ok(plainLines.some((line) => line.trim() === "Claude FM"));
  assert.ok(plainLines.some((line) => line.includes("+/- volume    o open youtube  q quit")));
  assert.ok(plainLines.findIndex((line) => line.trim().length > 0) <= 1);
});
