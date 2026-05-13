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
import { detectColorMode, resolveTheme } from "../dist/tui/theme.js";

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

test("inspectEnvironment uses WinGet setup guidance on Windows", () => {
  const runner = {
    run(command, args = []) {
      return {
        status: command === "where" && ["cmd", "winget"].includes(args[0]) ? 0 : 1,
        stdout: "",
        stderr: ""
      };
    }
  };

  const environment = inspectEnvironment(runner, "win32");

  assert.equal(environment.canPlayTerminal, false);
  assert.equal(environment.installPlan.command, "winget install yt-dlp.yt-dlp mpv.net");
  assert.match(environment.installPlan.note, /Restart the terminal/);
});

test("inspectEnvironment uses Linux package manager setup guidance", () => {
  const cases = [
    ["apt-get", "sudo apt-get install yt-dlp mpv"],
    ["dnf", "sudo dnf install yt-dlp mpv"],
    ["pacman", "sudo pacman -S yt-dlp mpv"]
  ];

  for (const [manager, installCommand] of cases) {
    const runner = {
      run(command, args = []) {
        return {
          status: command === "which" && args[0] === manager ? 0 : 1,
          stdout: "",
          stderr: ""
        };
      }
    };

    const environment = inspectEnvironment(runner, "linux");

    assert.equal(environment.canPlayTerminal, false);
    assert.equal(environment.installPlan.command, installCommand);
  }
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

test("playStream prints setup guidance when terminal deps are missing", async () => {
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

      throw new Error(`Unexpected command: ${command}`);
    }
  };

  const { result, logs } = await withCapturedConsole(() =>
    playStream({ player: undefined, url: CLAUDE_FM_URL, browser: true }, runner, "darwin")
  );

  assert.equal(result, 1);
  assert.match(logs[0], /Terminal playback is not ready/);
  assert.match(logs.join("\n"), /Missing: yt-dlp, mpv or ffplay/);
  assert.match(logs.join("\n"), /Run this first: brew install yt-dlp mpv/);
  assert.match(logs.join("\n"), /To open YouTube intentionally, run: claudefm open/);
  assert.equal(invocations.some(([command]) => command === "open"), false);
});

test("playStream does not auto-open YouTube on Windows or Linux when deps are missing", async () => {
  for (const platform of ["win32", "linux"]) {
    const invocations = [];
    const runner = {
      run(command, args = []) {
        invocations.push([command, args]);

        if (command === "where") {
          return {
            status: ["cmd", "winget"].includes(args[0]) ? 0 : 1,
            stdout: "",
            stderr: ""
          };
        }

        if (command === "which") {
          return {
            status: ["xdg-open", "apt-get"].includes(args[0]) ? 0 : 1,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected command: ${command}`);
      }
    };

    const { result, logs } = await withCapturedConsole(() =>
      playStream({ player: undefined, url: CLAUDE_FM_URL, browser: true }, runner, platform)
    );

    assert.equal(result, 1);
    assert.match(logs.join("\n"), /Terminal playback is not ready/);
    assert.equal(invocations.some(([command]) => command === "cmd" || command === "xdg-open"), false);
  }
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
    "Claude FM music for thinking and building"
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
  assert.ok(plainLines.some((line) => line.includes("NOW PLAYING") && line.includes("paused | volume 100%")));
  assert.ok(plainLines.some((line) => line.trim() === "Claude FM"));
  assert.ok(plainLines.some((line) => line.includes("space pause/resume") && line.includes("left/right seek")));
  assert.ok(plainLines.some((line) => line.includes("o open youtube") && line.includes("ctrl+p settings")));
  assert.ok(plainLines.some((line) => line.includes("q quit")));
  assert.ok(plainLines.findIndex((line) => line.trim().length > 0) <= 1);
});

test("theme uses ansi256 colors for Apple Terminal", () => {
  const environment = { TERM_PROGRAM: "Apple_Terminal" };

  assert.equal(detectColorMode(environment), "ansi256");
  assert.match(resolveTheme(environment).accent, /^\x1b\[38;5;/);
});

test("theme color mode can be overridden", () => {
  assert.equal(detectColorMode({ TERM_PROGRAM: "Apple_Terminal", CLAUDEFM_COLOR_MODE: "truecolor" }), "truecolor");
  assert.equal(detectColorMode({ CLAUDEFM_COLOR_MODE: "256" }), "ansi256");
  assert.match(resolveTheme({ TERM_PROGRAM: "Apple_Terminal", CLAUDEFM_COLOR_MODE: "truecolor" }).accent, /^\x1b\[38;2;/);
});

test("buildDashboard renders command palette", () => {
  const output = withTerminalSize(80, 24, () => buildDashboard(dashboardState({
    commandPalette: {
      mode: "menu",
      input: CLAUDE_FM_URL
    }
  })));
  const plainLines = stripAnsi(output).split("\n");

  assert.ok(plainLines.some((line) => line.includes("Commands") && line.includes("esc")));
  assert.ok(plainLines.some((line) => line.includes("Set YT stream link") && line.includes("enter")));
  assert.ok(plainLines.some((line) => line.includes("Select output device") && line.includes("enter")));
  assert.ok(plainLines.some((line) => line.includes("GitHub repo") && line.includes("enter")));
  assert.ok(plainLines.some((line) => line.includes("tip: rewind 10-15s if live audio stutters")));
});

test("buildDashboard renders stream URL input as focused", () => {
  const output = withTerminalSize(80, 24, () => buildDashboard(dashboardState({
    commandPalette: {
      mode: "url",
      input: CLAUDE_FM_URL
    }
  })));
  const plainLines = stripAnsi(output).split("\n");

  assert.ok(plainLines.some((line) => line.includes("Set YT stream link") && line.includes("esc back")));
  assert.ok(plainLines.some((line) => line.includes("YouTube URL")));
  assert.ok(!plainLines.some((line) => line.includes("cmd+v paste")));
  assert.ok(!plainLines.some((line) => line.includes("tip: rewind")));
  assert.ok(plainLines.some((line) => line.includes(CLAUDE_FM_URL) && line.includes("▌")));
});

test("buildDashboard renders output device picker", () => {
  const output = withTerminalSize(80, 24, () => buildDashboard(dashboardState({
    commandPalette: {
      mode: "devices",
      input: CLAUDE_FM_URL,
      selectedIndex: 0,
      devices: [
        { name: "auto", description: "Auto", selected: true },
        { name: "coreaudio/default", description: "MacBook Speakers" }
      ]
    }
  })));
  const plainLines = stripAnsi(output).split("\n");

  assert.ok(plainLines.some((line) => line.includes("Select output device") && line.includes("esc back")));
  assert.ok(!plainLines.some((line) => line.includes("tip: rewind")));
  assert.ok(plainLines.some((line) => line.includes("Current")));
  assert.ok(plainLines.some((line) => line.includes("> Auto") && line.includes("active")));
  assert.ok(plainLines.some((line) => line.includes("MacBook Speakers") && line.includes("enter")));
});
