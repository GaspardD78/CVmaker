#!/bin/bash
# Setup script for ResumeForge on Ubuntu/Debian
# Run this once before your first `bun run tauri dev`

set -e

echo "==> Installing system dependencies for Tauri 2..."
sudo apt-get update
sudo apt-get install -y \
  libglib2.0-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

echo "==> Installing Node.js dependencies..."
bun install

echo ""
echo "Setup complete. You can now run: bun run tauri dev"
