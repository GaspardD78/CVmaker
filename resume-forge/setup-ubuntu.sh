#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Updating package lists..."
sudo apt-get update

echo "Installing required dependencies for Tauri on Ubuntu 24.04..."
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

echo "Dependencies installed successfully."
echo "To set up the frontend environment, install Node.js and npm or Bun."
echo "If using Bun, run: curl -fsSL https://bun.sh/install | bash"
echo "Then, from the resume-forge directory, run: bun install"
