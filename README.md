<p align="center">
  <img src="https://raw.githubusercontent.com/GithubAnant/claudefm/main/assets/claudefm.png" alt="Claude FM" width="494">
</p>

# claudefm

Claude FM in your terminal.

## Install

```bash
npm install -g claudefm
```

## Quick Start

```bash
claudefm
```

`claudefm` now opens an OpenAudio-style terminal player first, then launches Claude FM automatically.

If terminal playback is ready, audio starts immediately and the TUI stays live with progress, status, and transport controls.

If dependencies are missing, it falls back to opening the YouTube stream in your browser and still keeps the terminal UI up so the launch feels intentional instead of broken.

Inside the dashboard:

- `space` pause/resume
- `left` / `right` seek
- `+` / `-` volume
- `o` open YouTube in the browser
- `q` quit

## Commands

```bash
claudefm
claudefm play
claudefm doctor
claudefm setup
claudefm setup --yes
claudefm open
claudefm --help
claudefm --no-ui
```

## Requirements

- `yt-dlp`
- `mpv` or `ffplay`

## Setup Help

Use:

```bash
claudefm doctor
claudefm setup
```

On macOS with Homebrew installed, `claudefm setup` prints:

```bash
brew install yt-dlp mpv
```

The CLI defaults to the official Claude FM YouTube live stream and plays audio only.
