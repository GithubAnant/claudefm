#!/bin/sh
set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  echo "claudefm install.sh is macOS only."
  echo "Use npm instead: npm install -g claudefm"
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required for the macOS installer."
  echo "Install it from https://brew.sh, then rerun this script."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Installing Node.js with Homebrew..."
  brew install node
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
if [ "$node_major" -lt 18 ]; then
  echo "Node.js 18 or newer is required. Upgrading Node.js with Homebrew..."
  brew install node || brew upgrade node
fi

echo "Installing claudefm..."
npm install -g claudefm

echo "Installing playback dependencies..."
brew install yt-dlp mpv

echo "Checking setup..."
claudefm doctor
