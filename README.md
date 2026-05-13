<p align="center">
  <img src="https://raw.githubusercontent.com/GithubAnant/claudefm/main/assets/logo.png" alt="Claude FM logo" width="96">
</p>

<h1 align="center">claudefm</h1>

<p align="center">
  Claude FM in your terminal. Audio-only playback for the official Claude FM YouTube live stream.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claudefm"><img alt="npm" src="https://img.shields.io/npm/v/claudefm?style=for-the-badge&logo=npm&logoColor=white&color=CB3837"></a>
  <a href="https://www.npmjs.com/package/claudefm"><img alt="downloads" src="https://img.shields.io/npm/dm/claudefm?style=for-the-badge&logo=npm&logoColor=white&color=2F855A"></a>
  <a href="https://nodejs.org/"><img alt="node" src="https://img.shields.io/node/v/claudefm?style=for-the-badge&logo=node.js&logoColor=white&color=43853D"></a>
  <a href="https://github.com/GithubAnant/claudefm/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/npm/l/claudefm?style=for-the-badge&color=111827"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/GithubAnant/claudefm/main/assets/demo.png" alt="claudefm terminal dashboard demo" width="900">
</p>

## Install

```bash
npm install -g claudefm
```

Requires Node.js 18 or newer.

macOS quick install:

```bash
curl -fsSL https://raw.githubusercontent.com/GithubAnant/claudefm/main/install.sh | sh
```

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
