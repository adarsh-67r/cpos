#!/usr/bin/env sh
set -eu

repo="${CPOS_REPO:-Soham109/cpos}"
version="${CPOS_VERSION:-latest}"
bin_dir="${CPOS_INSTALL_DIR:-$HOME/.local/bin}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' is required to install CPOS" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd tar

os="$(uname -s)"
arch="$(uname -m)"

case "$os:$arch" in
  Darwin:arm64|Darwin:aarch64)
    target="aarch64-apple-darwin"
    ;;
  Darwin:x86_64)
    target="x86_64-apple-darwin"
    ;;
  Linux:x86_64|Linux:amd64)
    target="x86_64-unknown-linux-gnu"
    ;;
  *)
    echo "error: unsupported platform: $os $arch" >&2
    echo "Try the source install instead: cargo install --git https://github.com/$repo" >&2
    exit 1
    ;;
esac

asset="cpos-$target.tar.gz"

extract_urls() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -r '.[].assets[].browser_download_url' 2>/dev/null
  else
    printf '%s' "$1" \
      | grep -o '"browser_download_url":"[^"]*"' \
      | sed 's/"browser_download_url":"//;s/"$//'
  fi
}

if [ "$version" = "latest" ]; then
  api_url="https://api.github.com/repos/$repo/releases?per_page=100"

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    releases_json="$(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" "$api_url")"
  else
    releases_json="$(curl -fsSL "$api_url")"
  fi

  if printf '%s' "$releases_json" | grep -q '"API rate limit exceeded"'; then
    echo "error: GitHub API rate limit exceeded." >&2
    echo "Set GITHUB_TOKEN env var or wait a minute and try again." >&2
    exit 1
  fi

  url="$(extract_urls "$releases_json" | grep "/$asset$" | head -n1)"

  if [ -z "$url" ]; then
    echo "Falling back to v0.1.8..." >&2
    url="https://github.com/$repo/releases/download/v0.1.8/$asset"
  fi
else
  case "$version" in
    v*) tag="$version" ;;
    *) tag="v$version" ;;
  esac
  url="https://github.com/$repo/releases/download/$tag/$asset"
fi

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t cpos)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT INT TERM

echo "Installing CPOS TUI for $target"
echo "Downloading $url"

if ! curl -fsSL "$url" -o "$tmp/$asset"; then
  echo "error: download failed." >&2
  echo "Check your internet connection and try again." >&2
  exit 1
fi

tag_from_url="$(printf '%s' "$url" | sed 's|.*/download/\([^/]*\)/.*|\1|')"
sums_url="https://github.com/$repo/releases/download/$tag_from_url/SHA256SUMS"

if curl -fsSL "$sums_url" -o "$tmp/SHA256SUMS" 2>/dev/null; then
  if command -v sha256sum >/dev/null 2>&1; then
    expected="$(grep "$asset" "$tmp/SHA256SUMS" | awk '{print $1}')"
    actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
    if [ -z "$expected" ]; then
      :
    elif [ "$expected" != "$actual" ]; then
      echo "error: checksum mismatch - download may be corrupted." >&2
      echo "  expected: $expected" >&2
      echo "  got:      $actual" >&2
      exit 1
    else
      echo "Checksum verified."
    fi
  elif command -v shasum >/dev/null 2>&1; then
    expected="$(grep "$asset" "$tmp/SHA256SUMS" | awk '{print $1}')"
    actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
    if [ -n "$expected" ] && [ "$expected" != "$actual" ]; then
      echo "error: checksum mismatch - download may be corrupted." >&2
      echo "  expected: $expected" >&2
      echo "  got:      $actual" >&2
      exit 1
    elif [ -n "$expected" ]; then
      echo "Checksum verified."
    fi
  fi
fi

tar -xzf "$tmp/$asset" -C "$tmp"

if [ ! -f "$tmp/cpos" ]; then
  echo "error: binary not found in the release archive." >&2
  exit 1
fi

mkdir -p "$bin_dir"
cp "$tmp/cpos" "$bin_dir/cpos"
chmod 755 "$bin_dir/cpos"

echo "Installed CPOS to $bin_dir/cpos"

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *)
    echo
    echo "NOTE: $bin_dir is not in your PATH."
    echo "Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo "  export PATH=\"$bin_dir:\$PATH\""
    echo "Then reload your shell or run: source ~/.bashrc"
    ;;
esac

echo
echo "Done! Run: cpos"
