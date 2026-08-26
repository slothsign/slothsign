#!/bin/sh
set -e

REPO="${SLOTH_INSTALL_REPO:-slothsign/slothsign}"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="darwin" ;;
  Linux)  PLATFORM="linux" ;;
  *) echo "unsupported OS: $OS" >&2; exit 1 ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

ASSET="sloth-${PLATFORM}-${ARCH}"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
DEST="${SLOTH_INSTALL_DIR:-/usr/local/bin}/sloth"

echo "Downloading ${ASSET} from ${REPO}…"
curl -fSL "$URL" -o "$DEST"
chmod +x "$DEST"

if [ "$PLATFORM" = "darwin" ]; then
  xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true
fi

echo "Installed sloth to $DEST"
"$DEST" --version
