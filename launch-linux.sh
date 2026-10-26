#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f dist/index.html ]]; then
  echo "Application files are missing. Please use the complete package." >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64) ;;
  *)
    echo "This package supports Linux x64 only. Detected: $(uname -m)" >&2
    exit 1
    ;;
esac

if [[ ! -x runtime/node ]]; then
  version='v22.14.0'
  expected='9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2'
  archive="${TMPDIR:-/tmp}/node-${version}-linux-x64.tar.gz"
  url="https://nodejs.org/dist/${version}/node-${version}-linux-x64.tar.gz"

  echo "First launch: downloading the private Node.js runtime..."
  mkdir -p runtime
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --show-error --output "$archive" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget --output-document="$archive" "$url"
  else
    echo "curl or wget is required. Offline setup: place a trusted Linux x64 Node.js binary at runtime/node." >&2
    exit 1
  fi

  actual="$(sha256sum "$archive" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$archive"
    echo "Runtime checksum mismatch. Expected $expected but received $actual." >&2
    exit 1
  fi

  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir" "$archive"' EXIT
  tar -xzf "$archive" -C "$temp_dir"
  cp "$temp_dir/node-${version}-linux-x64/bin/node" runtime/node
  chmod 755 runtime/node
  rm -rf "$temp_dir" "$archive"
  trap - EXIT
fi

exec runtime/node server.mjs