import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { CLAUDE_FM_URL } from "./constants.js";
import type { MpvRuntimeState } from "./types.js";

interface MpvMessage {
  event?: string;
  request_id?: number;
  error?: string;
  data?: unknown;
  name?: string;
}

export class MpvController extends EventEmitter {
  private static readonly SOCKET_WAIT_MS = 20000;
  private child: ChildProcess | null = null;
  private socket: Socket | null = null;
  private buffer = "";
  private requestId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  private socketPath = join(tmpdir(), `claudefm-${process.pid}-${Date.now()}.sock`);
  private state: MpvRuntimeState = createInitialRuntimeState();
  private destroyed = false;

  get snapshot(): MpvRuntimeState {
    return { ...this.state };
  }

  async start(streamUrl: string = CLAUDE_FM_URL): Promise<void> {
    const child = spawn(
      "mpv",
      [
        "--no-video",
        "--terminal=no",
        "--input-terminal=no",
        "--force-window=no",
        "--really-quiet",
        "--ytdl=yes",
        "--ytdl-format=bestaudio/best",
        "--cache=yes",
        "--cache-secs=5",
        `--input-ipc-server=${this.socketPath}`,
        streamUrl
      ],
      {
        stdio: ["ignore", "ignore", "pipe"]
      }
    );

    this.child = child;
    this.state = {
      ...createInitialRuntimeState(),
      status: "starting",
      title: "Claude FM"
    };
    this.emitState();

    child.once("exit", (code, signal) => {
      if (!this.destroyed) {
        this.state = { ...this.state, status: "idle" };
        this.emit("exit", { code, signal });
      }
      void this.destroy();
    });

    child.stderr?.on("data", () => {
      // Keep stderr drained without surfacing mpv noise into the TUI.
    });

    try {
      await this.connectSocket();
      await this.observeProperties();
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }

  async togglePause(): Promise<void> {
    await this.send(["cycle", "pause"]);
  }

  async seek(seconds: number): Promise<void> {
    await this.send(["seek", seconds, "relative"]);
  }

  async changeVolume(delta: number): Promise<void> {
    const nextVolume = Math.max(0, Math.min(130, this.state.volume + delta));
    await this.send(["set_property", "volume", nextVolume]);
  }

  async stop(): Promise<void> {
    await this.send(["quit"]);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.socket?.destroy();
    this.socket = null;

    for (const pending of this.pending.values()) {
      pending.reject(new Error("mpv controller destroyed"));
    }
    this.pending.clear();

    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }

    this.child = null;
  }

  private async connectSocket(): Promise<void> {
    const deadline = Date.now() + MpvController.SOCKET_WAIT_MS;

    while (Date.now() < deadline) {
      if (!this.child || this.child.exitCode !== null || this.child.killed) {
        throw new Error("mpv exited before IPC socket became available");
      }

      if (!existsSync(this.socketPath)) {
        await delay(100);
        continue;
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const socket = createConnection(this.socketPath);
          const onError = (reason: Error) => {
            socket.destroy();
            reject(reason);
          };

          socket.once("error", onError);
          socket.once("connect", () => {
            socket.off("error", onError);
            this.socket = socket;
            socket.on("data", (chunk: Buffer) => this.handleSocketData(chunk));
            socket.on("error", () => {
              // The mpv process lifecycle is the authoritative signal.
            });
            resolve();
          });
        });
        return;
      } catch {
        await delay(100);
      }
    }

    throw new Error("mpv IPC socket did not become available");
  }

  private async observeProperties(): Promise<void> {
    const properties = [
      "time-pos",
      "duration",
      "pause",
      "volume",
      "media-title",
      "demuxer-cache-time",
      "cache-buffering-state",
      "audio-codec-name",
      "audio-params",
      "metadata"
    ];

    for (const [index, property] of properties.entries()) {
      await this.send(["observe_property", index + 1, property]);
    }
  }

  private handleSocketData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const payload = JSON.parse(trimmed) as MpvMessage;

      if (typeof payload.request_id === "number") {
        const pending = this.pending.get(payload.request_id);
        if (!pending) {
          continue;
        }

        this.pending.delete(payload.request_id);
        if (payload.error && payload.error !== "success") {
          pending.reject(new Error(String(payload.error)));
        } else {
          pending.resolve(payload.data);
        }
        continue;
      }

      if (payload.event === "property-change" && payload.name) {
        this.applyProperty(payload.name, payload.data);
      }
    }
  }

  private applyProperty(name: string, data: unknown): void {
    switch (name) {
      case "time-pos":
        this.state.timePos = typeof data === "number" ? data : null;
        break;
      case "duration":
        this.state.duration = typeof data === "number" ? data : null;
        break;
      case "pause":
        this.state.paused = Boolean(data);
        break;
      case "volume":
        this.state.volume = typeof data === "number" ? Math.round(data) : this.state.volume;
        break;
      case "media-title":
        this.state.title = typeof data === "string" ? data : this.state.title;
        break;
      case "demuxer-cache-time":
        this.state.cacheSeconds = typeof data === "number" ? data : null;
        break;
      case "cache-buffering-state":
        this.state.bufferPercent = typeof data === "number" ? data : null;
        break;
      case "audio-codec-name":
        this.state.codec = typeof data === "string" ? data : "";
        break;
      case "audio-params": {
        const payload = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
        this.state.sampleRate = typeof payload.samplerate === "number" ? payload.samplerate : null;
        this.state.channels = typeof payload["channel-count"] === "number" ? payload["channel-count"] : null;
        break;
      }
      case "metadata": {
        const metadata = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
        this.state.artist = firstString(metadata.artist, metadata.ARTIST, metadata.uploader, metadata.channel);
        break;
      }
      default:
        break;
    }

    if (this.state.bufferPercent && this.state.bufferPercent < 100) {
      this.state.status = "buffering";
    } else if (this.state.paused) {
      this.state.status = "paused";
    } else {
      this.state.status = "playing";
    }

    this.emitState();
  }

  private emitState(): void {
    this.emit("state", { ...this.state });
  }

  private send(command: unknown[]): Promise<unknown> {
    if (!this.socket) {
      return Promise.reject(new Error("mpv IPC socket is not connected"));
    }

    this.requestId += 1;
    const requestId = this.requestId;

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.socket?.write(`${JSON.stringify({ command, request_id: requestId })}\n`);
    });
  }
}

function createInitialRuntimeState(): MpvRuntimeState {
  return {
    status: "idle",
    paused: false,
    volume: 100,
    timePos: null,
    duration: null,
    cacheSeconds: null,
    bufferPercent: null,
    title: "",
    artist: "",
    codec: "",
    sampleRate: null,
    channels: null
  };
}

function firstString(...values: unknown[]): string {
  const match = values.find((value) => typeof value === "string" && value.length > 0);
  return typeof match === "string" ? match : "";
}
