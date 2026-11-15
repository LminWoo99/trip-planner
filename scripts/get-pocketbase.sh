#!/usr/bin/env bash
# Download the PocketBase binary for this OS/arch into the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."

PB_VERSION="${PB_VERSION:-0.40.6}"
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "unsupported OS" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64) arch=amd64 ;;
  *) echo "unsupported arch" >&2; exit 1 ;;
esac

url="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${os}_${arch}.zip"
tmp="$(mktemp -d)"
curl -fsSL "$url" -o "$tmp/pb.zip"
unzip -o -q "$tmp/pb.zip" pocketbase -d .
rm -rf "$tmp"
chmod +x pocketbase
./pocketbase --version
