import { CLAUDE_FM_URL } from "./constants.js";
import type { ParseResult, ParsedArgs } from "./types.js";

export function printHelp(): void {
  console.log("Usage: claudefm [command] [options]");
  console.log("");
  console.log("Commands:");
  console.log("  play         Launch the Claude FM terminal player.");
  console.log("  doctor       Check dependencies and show setup guidance.");
  console.log("  setup        Print or run the recommended install command.");
  console.log("  open         Open Claude FM in your browser.");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help      Show help.");
  console.log("  -v, --version   Show version.");
  console.log("  --player        Force a player: mpv or ffplay.");
  console.log("  --url           Override the default stream URL or yt-dlp search locator.");
  console.log("  --json          Print machine-readable JSON.");
  console.log("  --print         Print the setup command instead of running it.");
  console.log("  --yes           Run the setup command immediately.");
  console.log("  --no-browser    Hide browser handoff controls.");
  console.log("  --no-ui         Skip the Claude FM terminal player.");
}

export function parseArgs(argv: string[] = []): ParseResult {
  const args = [...argv];
  const parsed: ParsedArgs = {
    command: "play",
    player: undefined,
    url: CLAUDE_FM_URL,
    json: false,
    yes: false,
    print: false,
    browser: true,
    ui: true
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (!arg) {
      continue;
    }

    if (["play", "doctor", "setup", "open"].includes(arg)) {
      parsed.command = arg as ParsedArgs["command"];
      continue;
    }

    if (arg === "--player") {
      parsed.player = args.shift();
      continue;
    }

    if (arg === "--url") {
      parsed.url = args.shift() ?? parsed.url;
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--yes") {
      parsed.yes = true;
      continue;
    }

    if (arg === "--print") {
      parsed.print = true;
      continue;
    }

    if (arg === "--no-browser") {
      parsed.browser = false;
      continue;
    }

    if (arg === "--no-ui") {
      parsed.ui = false;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      return { help: true };
    }

    if (arg === "-v" || arg === "--version") {
      return { version: true };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}
