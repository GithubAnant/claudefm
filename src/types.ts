export type SupportedPlayer = "mpv" | "ffplay";
export type CliCommand = "play" | "doctor" | "setup" | "open";
export type Platform = NodeJS.Platform;
export type PlayerStatus = "idle" | "starting" | "playing" | "paused" | "buffering";

export interface ParsedArgs {
  command: CliCommand;
  player?: string;
  url: string;
  json: boolean;
  yes: boolean;
  print: boolean;
  browser: boolean;
  ui: boolean;
}

export interface HelpArgs {
  help: true;
}

export interface VersionArgs {
  version: true;
}

export type ParseResult = ParsedArgs | HelpArgs | VersionArgs;

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  encoding?: BufferEncoding;
  shell?: boolean;
  stdio?: "ignore" | "inherit" | "pipe";
}

export interface CommandRunner {
  run(command: string, args?: readonly string[], options?: RunOptions): CommandResult;
}

export interface OpenCommand {
  command: string;
  args: string[];
}

export interface InstallPlan {
  manager?: string;
  command?: string;
  note?: string;
  steps: string[];
}

export interface EnvironmentCommands {
  "yt-dlp": boolean;
  mpv: boolean;
  ffplay: boolean;
  open: boolean;
  brew: boolean;
  winget: boolean;
  "apt-get": boolean;
  dnf: boolean;
  pacman: boolean;
}

export interface EnvironmentInfo {
  platform: Platform;
  commands: EnvironmentCommands;
  preferredPlayer: SupportedPlayer | null;
  canPlayTerminal: boolean;
  installPlan: InstallPlan;
}

export interface MpvRuntimeState {
  status: PlayerStatus;
  paused: boolean;
  volume: number;
  timePos: number | null;
  duration: number | null;
  cacheSeconds: number | null;
  bufferPercent: number | null;
  title: string;
  artist: string;
  codec: string;
  sampleRate: number | null;
  channels: number | null;
}
