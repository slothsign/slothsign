#!/bin/sh

set -ex

xattr -r -d com.apple.quarantine sloth-darwin-arm64
