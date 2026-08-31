import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { CommandRunner, Platform } from "./types.js";

const IS_WINDOWS = process.platform === "win32";

export function testMpvIpc(runner: CommandRunner, platform: Platform = process.platform): boolean {
  if (platform !== process.platform) {
    return false;
  }

  const socketName = `claudefm-ipc-test-${process.pid}-${Date.now()}`;
  const socketPath = join(tmpdir(), `${socketName}.sock`);

  try {
    const result: SpawnSyncReturns<Buffer> = spawnSync(
      "mpv",
      [
        "--no-video",
        "--terminal=no",
        "--input-terminal=no",
        "--force-window=no",
        "--really-quiet",
        `--input-ipc-server=${socketPath}`,
        "av://lavfi:anullsrc=r=44100:cl=stereo",
        "--frames=1"
      ],
      { timeout: 5000, stdio: "ignore" }
    );

    if (!IS_WINDOWS) {
      try {
        if (existsSync(socketPath)) {
          unlinkSync(socketPath);
        }
      } catch {}
    }

    if (result.error) {
      return false;
    }

    if (result.signal === "SIGTERM" || result.signal === "SIGKILL") {
      return true;
    }

    return result.status === 0 || result.status === null;
  } catch {
    return false;
  }
}
