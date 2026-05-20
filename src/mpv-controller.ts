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

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

export interface MpvAudioDevice {
  name: string;
  description: string;
  selected?: boolean;
}

export interface MpvStartOptions {
  paused?: boolean;
  startSeconds?: number;
}

export class MpvController extends EventEmitter {
  private static readonly SOCKET_WAIT_MS = 20000;
  private static readonly IPC_REQUEST_TIMEOUT_MS = 5000;
  private child: ChildProcess | null = null;
  private socket: Socket | null = null;
  private buffer = "";
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private socketPath = join(tmpdir(), `claudefm-${process.pid}-${Date.now()}.sock`);
  private state: MpvRuntimeState = createInitialRuntimeState();
  private destroyed = false;
  private startupError: Error | null = null;
  private stderrTail = "";

  get snapshot(): MpvRuntimeState {
    return { ...this.state };
  }

  async start(streamUrl: string = CLAUDE_FM_URL, options: MpvStartOptions = {}): Promise<void> {
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
        ...(options.paused ? ["--pause=yes"] : []),
        ...(typeof options.startSeconds === "number" ? [`--start=${Math.max(0, options.startSeconds)}`] : []),
        streamUrl
      ],
      {
        stdio: ["ignore", "ignore", "pipe"]
      }
    );

    this.child = child;
    this.startupError = null;
    this.stderrTail = "";
    this.state = {
      ...createInitialRuntimeState(),
      status: "starting",
      paused: Boolean(options.paused),
      title: "Claude FM"
    };
    this.emitState();

    child.once("error", (error) => {
      this.startupError = error;
      if (!this.destroyed) {
        this.state = { ...this.state, status: "idle" };
        this.emit("exit", { code: null, signal: null });
      }
    });

    child.once("exit", (code, signal) => {
      if (!this.destroyed) {
        this.state = { ...this.state, status: "idle" };
        this.emit("exit", { code, signal });
      }
      void this.destroy();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      // Keep stderr drained without surfacing mpv noise into the TUI.
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(-600);
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

  async loadUrl(streamUrl: string): Promise<void> {
    await this.send(["loadfile", streamUrl, "replace"]);
    this.state = {
      ...createInitialRuntimeState(),
      status: "starting",
      volume: this.state.volume,
      title: "Loading stream"
    };
    this.emitState();
  }

  async resumeFresh(streamUrl: string): Promise<void> {
    await this.send(["loadfile", streamUrl, "replace"]);
    await this.send(["set_property", "pause", false]);
    this.state = {
      ...createInitialRuntimeState(),
      status: "starting",
      volume: this.state.volume,
      title: "Refreshing stream"
    };
    this.emitState();
  }

  async ping(): Promise<void> {
    await this.send(["get_property", "pause"]);
  }

  async listAudioDevices(): Promise<MpvAudioDevice[]> {
    const [payload, activeDevice] = await Promise.all([
      this.send(["get_property", "audio-device-list"]),
      this.send(["get_property", "audio-device"]).catch(() => "auto")
    ]);
    if (!Array.isArray(payload)) {
      return [];
    }

    const activeName = typeof activeDevice === "string" && activeDevice.length > 0 ? activeDevice : "auto";
    return payload.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const record = item as Record<string, unknown>;
      if (typeof record.name !== "string") {
        return [];
      }

      return [{
        name: record.name,
        description: typeof record.description === "string" && record.description.length > 0
          ? record.description
          : record.name,
        selected: record.name === activeName
      }];
    }).sort((first, second) => Number(Boolean(second.selected)) - Number(Boolean(first.selected)));
  }

  async selectAudioDevice(name: string): Promise<void> {
    await this.send(["set_property", "audio-device", name]);
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

    this.rejectPending(new Error("mpv controller destroyed"));

    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }

    this.child = null;
  }

  private async connectSocket(): Promise<void> {
    const deadline = Date.now() + MpvController.SOCKET_WAIT_MS;

    while (Date.now() < deadline) {
      if (this.startupError) {
        throw new Error(`mpv failed to start: ${this.startupError.message}`);
      }

      if (!this.child || this.child.exitCode !== null || this.child.killed) {
        throw new Error(`mpv exited before IPC socket became available${this.formatStderrTail()}`);
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
            socket.on("error", (error) => this.handleSocketFailure(error));
            socket.on("close", () => this.handleSocketFailure(new Error("mpv IPC socket closed")));
            resolve();
          });
        });
        return;
      } catch {
        await delay(100);
      }
    }

    throw new Error(`mpv IPC socket did not become available${this.formatStderrTail()}`);
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

      let payload: MpvMessage;
      try {
        payload = JSON.parse(trimmed) as MpvMessage;
      } catch {
        continue;
      }

      if (typeof payload.request_id === "number") {
        const pending = this.pending.get(payload.request_id);
        if (!pending) {
          continue;
        }

        this.pending.delete(payload.request_id);
        clearTimeout(pending.timeout);
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
    if (!this.socket || !this.socket.writable || this.destroyed) {
      return Promise.reject(new Error("mpv IPC socket is not connected"));
    }

    this.requestId += 1;
    const requestId = this.requestId;
    const commandName = typeof command[0] === "string" ? command[0] : "command";

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handleSocketFailure(new Error(`mpv IPC ${commandName} timed out`));
      }, MpvController.IPC_REQUEST_TIMEOUT_MS);
      timeout.unref?.();
      this.pending.set(requestId, { resolve, reject, timeout });

      try {
        this.socket?.write(`${JSON.stringify({ command, request_id: requestId })}\n`);
      } catch (error) {
        this.rejectRequest(
          requestId,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
  }

  private handleSocketFailure(error: Error): void {
    if (this.destroyed || !this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
    this.rejectPending(error);
    this.state = { ...this.state, status: "idle" };
    this.emitState();
    this.emit("exit", { code: null, signal: null });
    void this.destroy();
  }

  private rejectRequest(requestId: number, error: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  private rejectPending(error: Error): void {
    for (const [requestId, pending] of this.pending.entries()) {
      this.pending.delete(requestId);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }

  private formatStderrTail(): string {
    const message = this.stderrTail.trim().split("\n").at(-1)?.trim();
    return message ? ` (${message})` : "";
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
