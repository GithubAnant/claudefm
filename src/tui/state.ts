import type { MpvRuntimeState } from "../types.js";

export interface DashboardState {
  status: string;
  headline: string;
  detail: string;
  error?: string;
  runtime: MpvRuntimeState;
  browserEnabled: boolean;
  canUseRichPlayer: boolean;
  installCommand?: string;
  playerLabel: string;
  url: string;
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
