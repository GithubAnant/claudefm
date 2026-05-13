<p align="center">
  <img src="assets/logo.png" alt="Claude FM logo" width="256">
</p>

<h1 align="center">claudefm</h1>

<p align="center">
  Claude FM in your terminal. Audio-only playback for the official Claude FM YouTube live stream.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claudefm"><img alt="npm" src="https://img.shields.io/npm/v/claudefm?style=for-the-badge&logo=npm&logoColor=white&color=CB3837"></a>
  <a href="https://www.npmjs.com/package/claudefm"><img alt="downloads" src="https://img.shields.io/npm/dm/claudefm?style=for-the-badge&logo=npm&logoColor=white&color=2F855A"></a>
  <a href="https://github.com/GithubAnant/claudefm/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/npm/l/claudefm?style=for-the-badge&color=111827"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/GithubAnant/claudefm/main/assets/demo.png" alt="claudefm terminal dashboard demo" width="900">
</p>

## Why this exists

Anthropic made Claude FM, a live stream for thinking and building. They even added `/radio` mode. The odd part is that the official path opens the stream in a browser.

For an audio-only stream, that is a heavy default: a video page, browser cache, extra storage, more bandwidth, and another tab sitting around for no real reason. It felt like a strange miss from a company operating at that level.

`claudefm` is the simpler path I wanted: terminal in, audio out. No browser tab required.

## Install

```bash
npm install -g claudefm
```

Requires Node.js 18 or newer.

macOS quick install:

```bash
curl -fsSL https://raw.githubusercontent.com/GithubAnant/claudefm/main/install.sh | sh
```

## Run

```bash
claudefm
```

When terminal playback is ready, `claudefm` starts the stream and shows playback status, progress, volume, and controls.

## Controls

| Key | Action |
| --- | --- |
| `space` | Pause or resume |
| `left` / `right` | Seek backward or forward |
| `h` / `l` | Seek backward or forward |
| `+` / `=` | Volume up |
| `-` | Volume down |
| `o` | Open YouTube |
| `q` | Quit |

## Requirements

Terminal playback needs:

- `yt-dlp`
- `mpv` or `ffplay`

`mpv` is recommended for the full dashboard controls. `ffplay` works as a simpler audio fallback.

Check your machine:

```bash
claudefm doctor
```

Print setup guidance:

```bash
claudefm setup
```

Run the recommended setup command:

```bash
claudefm setup --yes
```

Common dependency installs:

```bash
# macOS
brew install yt-dlp mpv

# Debian / Ubuntu
sudo apt-get install yt-dlp mpv

# Fedora
sudo dnf install yt-dlp mpv

# Arch
sudo pacman -S yt-dlp mpv

# Windows
winget install yt-dlp.yt-dlp
```

## Commands

These are the supported commands exposed by the CLI:

| Command | What it does |
| --- | --- |
| `claudefm` | Start the terminal player |
| `claudefm play` | Start the terminal player explicitly |
| `claudefm open` | Open Claude FM in your browser |
| `claudefm doctor` | Check playback dependencies |
| `claudefm setup` | Print the recommended setup command |
| `claudefm setup --yes` | Run the recommended setup command |
| `claudefm --help` | Show help |
| `claudefm --version` | Show version |

The default stream is the official Claude FM YouTube live stream.
