#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if [ "$(uname -s)" != Darwin ]; then
    echo "The native video plane is macOS only; skipping." >&2
    exit 0
fi
if ! command -v swiftc >/dev/null 2>&1; then
    echo "swiftc not found (install the Xcode command line tools); video falls back to the browser engine." >&2
    exit 0
fi
mkdir -p "$here/build"
swiftc -O -swift-version 5 -suppress-warnings -o "$here/build/tvemu-video-plane" "$here/main.swift"
echo "$here/build/tvemu-video-plane"
