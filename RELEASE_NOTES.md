# Release Notes

## Unreleased

### Fixed

- Fixed a long-running CLI hang where the dashboard could become unresponsive after being left open for hours.
- Added timeouts for `mpv` IPC commands so stale player control sockets fail quickly instead of leaving controls waiting forever.
- Added periodic `mpv` health checks while the dashboard is open so stale player control sockets recover before the next user action.
- Refresh live streams when resuming after a long pause, so leaving Claude FM paused for hours and pressing play later gets a fresh stream.
- Preserve normal video pause/resume behavior. Custom non-live YouTube videos do not use the long-pause refresh path, and player recovery restarts them at the last known timestamp when possible.
- Reduced idle dashboard overhead by rendering on player/input/resize changes instead of repainting on a fixed loop.
- Reduced background health-check frequency while keeping stale-player recovery in place.
- Added a timeout for `yt-dlp` metadata/audio URL checks so stream recovery cannot block the CLI indefinitely.
- Treat `yt-dlp` process timeouts as network failures, which keeps fallback and retry messaging accurate.

### Root Cause

The CLI used long-lived `mpv` IPC requests and synchronous `yt-dlp` checks without hard timeouts. If `mpv` stopped replying on its IPC socket, or if a `yt-dlp` subprocess stalled during stream recovery, the Node process could keep running while the dashboard waited on work that would never resolve. Separately, a paused live stream could be hours old by the time playback resumed, so live-stream resume now refreshes after a long pause instead of trusting stale stream state.
