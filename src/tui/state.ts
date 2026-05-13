import type { MpvRuntimeState } from "../types.js";
import type { MpvAudioDevice } from "../mpv-controller.js";

export interface DashboardState {
  status: string;
  headline: string;
  detail: string;
  error?: string;
  commandPalette?: CommandPaletteState;
  runtime: MpvRuntimeState;
  browserEnabled: boolean;
  canUseRichPlayer: boolean;
  installCommand?: string;
  playerLabel: string;
  url: string;
}

export interface CommandPaletteState {
  mode: "menu" | "url" | "devices";
  input: string;
  selectedIndex?: number;
  requestId?: number;
  devices?: MpvAudioDevice[];
  message?: string;
}

export const EMPTY_PLAYER: MpvRuntimeState = {
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
