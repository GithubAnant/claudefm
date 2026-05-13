<p align="center">
  <img src="https://raw.githubusercontent.com/GithubAnant/claudefm/main/assets/claudefm.png" alt="Claude FM" width="494">
</p>

# claudefm

[![npm version](https://img.shields.io/npm/v/claudefm.svg)](https://www.npmjs.com/package/claudefm)
[![license](https://img.shields.io/npm/l/claudefm.svg)](LICENSE)
[![node](https://img.shields.io/node/v/claudefm.svg)](package.json)

Claude FM in your terminal. `claudefm` plays the official Claude FM YouTube live stream with an audio-only terminal dashboard.

## Install

```bash
npm install -g claudefm
```

Requires Node.js 18 or newer.

## Usage

```bash
claudefm
```

When terminal playback is ready, `claudefm` starts the stream and shows playback status, progress, volume, and controls. If local playback dependencies are missing, it can fall back to opening the stream in your browser.

## Controls

| Key | Action |
| --- | --- |
| `space` | Pause or resume |
| `left` / `right` | Seek backward or forward |
| `h` / `l` | Seek backward or forward |
| `+` / `=` | Volume up |
| `-` | Volume down |
| `o` | Open YouTube |
| `ctrl+p` | Open settings |
| `q` | Quit |

## Settings

Press `ctrl+p` in the dashboard.

| Setting | What it does |
| --- | --- |
| `Set YT stream link` | Switch to another YouTube stream URL |
| `Select output device` | Choose an mpv audio output device |
| `GitHub repo` | Open the project repository |

Use `up` / `down` or `j` / `k` to move, `enter` to select, and `esc` to go back or close.

## Requirements

Terminal playback needs:

- `yt-dlp`
- `mpv` or `ffplay`

`mpv` is recommended. It enables the rich dashboard controls and output-device selection. `ffplay` works as a simpler audio fallback.

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

Common install commands:

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

| Command | Description |
| --- | --- |
| `claudefm` | Start Claude FM |
| `claudefm play` | Start Claude FM explicitly |
| `claudefm open` | Open Claude FM in your browser |
| `claudefm doctor` | Check playback dependencies |
| `claudefm setup` | Print the recommended setup command |
| `claudefm setup --yes` | Run the recommended setup command |
| `claudefm --help` | Show help |
| `claudefm --version` | Show version |

Useful options:

```bash
claudefm --player mpv
claudefm --player ffplay
claudefm --url <youtube-url>
claudefm --no-browser
claudefm --no-ui
claudefm --json
```

The default stream is the official Claude FM YouTube live stream.
