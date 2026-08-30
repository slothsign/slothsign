#!/bin/sh
set -e

# Project-specific values — edit these when reusing the script for another project.
REPO="slothsign/slothsign"
BINARY="sloth"
DEST="$HOME/.local/bin/sloth"

# If GITHUB_TOKEN is set, use it for authenticated requests (private repo support).
if [ -n "$GITHUB_TOKEN" ]; then
  _curl() { curl -fSL -H "Authorization: Bearer $GITHUB_TOKEN" "$@"; }
else
  _curl() { curl -fSL "$@"; }
fi

# Detect the platform and architecture from the running system.
OS="$(uname -s)"
MARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="darwin" ;;
  Linux)  PLATFORM="linux" ;;
  *) echo "unsupported OS: $OS" >&2; exit 1 ;;
esac

case "$MARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *) echo "unsupported arch: $MARCH" >&2; exit 1 ;;
esac

# Download the latest release archive.
ASSET="${BINARY}-${PLATFORM}-${ARCH}.gz"
BASE_URL="https://github.com/${REPO}/releases/latest/download"
TMP="/tmp/${ASSET}"

mkdir -p "$(dirname "$DEST")"
echo "Downloading ${ASSET} from ${REPO}…"
_curl "${BASE_URL}/${ASSET}" -o "$TMP"

# Verify the downloaded file's sha256 against version.txt when a hasher is available.
if command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1; then
  if _curl "${BASE_URL}/version.txt" -o /tmp/sloth-version.txt 2>/dev/null; then
    EXPECTED="$(grep "^${ASSET} " /tmp/sloth-version.txt | awk '{print $2}')"
    if [ -n "$EXPECTED" ]; then
      if command -v sha256sum >/dev/null 2>&1; then
        ACTUAL="$(sha256sum "$TMP" | awk '{print $1}')"
      else
        ACTUAL="$(shasum -a 256 "$TMP" | awk '{print $1}')"
      fi
      if [ "$ACTUAL" != "$EXPECTED" ]; then
        echo "checksum mismatch: expected $EXPECTED, got $ACTUAL" >&2
        rm -f "$TMP"
        exit 1
      fi
      echo "Checksum verified."
    fi
  fi
fi

# Decompress and install the binary with executable permissions.
if ! command -v gzip >/dev/null 2>&1; then
  echo "gzip is required to decompress ${ASSET}" >&2
  exit 1
fi
gzip -d "$TMP"
TMP="/tmp/${ASSET%.gz}"
mv "$TMP" "$DEST"
chmod +x "$DEST"

# Remove the macOS quarantine attribute so the binary runs without a Gatekeeper warning.
if [ "$PLATFORM" = "darwin" ]; then
  xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true
fi

# Report success and print the installed version.
echo "Installed sloth to $DEST"
"$DEST" --version || true
