#!/bin/sh
set -eu

os="$(uname -s)"

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "This installer needs root privileges to install system packages."
  echo "Install sudo or rerun as root."
  exit 1
}

install_node() {
  case "$os" in
    Darwin)
      if ! command -v brew >/dev/null 2>&1; then
        echo "Homebrew is required for the macOS installer."
        echo "Install it from https://brew.sh, then rerun this script."
        exit 1
      fi
      brew install node || brew upgrade node
      ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        as_root apt-get update
        as_root apt-get install -y nodejs npm
      elif command -v dnf >/dev/null 2>&1; then
        as_root dnf install -y nodejs npm
      elif command -v pacman >/dev/null 2>&1; then
        as_root pacman -S --needed --noconfirm nodejs npm
      else
        echo "No supported Linux package manager found."
        echo "Install Node.js 18+ and npm, then rerun this script."
        exit 1
      fi
      ;;
    *)
      echo "Unsupported OS: $os"
      echo "Use npm instead: npm install -g claudefm"
      exit 1
      ;;
  esac
}

install_playback_dependencies() {
  case "$os" in
    Darwin)
      if ! command -v brew >/dev/null 2>&1; then
        echo "Homebrew is required for the macOS installer."
        echo "Install it from https://brew.sh, then rerun this script."
        exit 1
      fi
      brew install yt-dlp mpv
      ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        as_root apt-get update
        as_root apt-get install -y yt-dlp mpv
      elif command -v dnf >/dev/null 2>&1; then
        as_root dnf install -y yt-dlp mpv
      elif command -v pacman >/dev/null 2>&1; then
        as_root pacman -S --needed --noconfirm yt-dlp mpv
      else
        echo "No supported Linux package manager found."
        echo "Install yt-dlp and mpv manually, then rerun claudefm doctor."
        exit 1
      fi
      ;;
    *)
      echo "Unsupported OS: $os"
      echo "Install yt-dlp and mpv manually, then run: npm install -g claudefm"
      exit 1
      ;;
  esac
}

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Installing Node.js and npm..."
  install_node
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
if [ "$node_major" -lt 18 ]; then
  echo "Node.js 18 or newer is required. Installing or upgrading Node.js..."
  install_node
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [ "$node_major" -lt 18 ]; then
    echo "Node.js is still older than 18 after package-manager install."
    echo "Install Node.js 18+ from https://nodejs.org, then rerun this script."
    exit 1
  fi
fi

echo "Installing claudefm..."
if ! npm install -g claudefm; then
  echo "Retrying claudefm install with elevated permissions..."
  as_root npm install -g claudefm
fi

echo "Installing playback dependencies..."
install_playback_dependencies

echo "Checking setup..."
claudefm doctor
