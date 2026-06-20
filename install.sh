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

release_asset_urls() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.[].assets[]?.browser_download_url // empty'
  else
    grep -Eo '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]+"' \
      | sed -E 's/^.*"browser_download_url"[[:space:]]*:[[:space:]]*"([^"]+)"$/\1/'
  fi
}

if [ "$version" = "latest" ]; then
  api_url="https://api.github.com/repos/$repo/releases?per_page=100"
  auth_header=""
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    auth_header="Authorization: Bearer $GITHUB_TOKEN"
  fi
  if [ -n "$auth_header" ]; then
    if ! releases_json="$(curl -fsSL -H "$auth_header" "$api_url")"; then
      echo "error: could not query GitHub releases" >&2
      exit 1
    fi
  elif ! releases_json="$(curl -fsSL "$api_url")"; then
    echo "error: could not query GitHub releases" >&2
    echo "Set CPOS_VERSION to install a specific release while GitHub is unavailable." >&2
    exit 1
  fi
  url="$(printf '%s' "$releases_json" | release_asset_urls | grep "/$asset$" | head -n 1)"
  if [ -z "$url" ]; then
    echo "error: no recent CPOS TUI release contains '$asset'" >&2
    echo "Set CPOS_VERSION to a known TUI release or use the source install." >&2
    exit 1
  fi
else
  case "$version" in
    v*) tag="$version" ;;
    *) tag="v$version" ;;
  esac
  url="https://github.com/$repo/releases/download/$tag/$asset"
fi

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t cpos)"
cleanup() {
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

echo "Installing CPOS TUI for $target"
echo "Downloading $url"

if ! curl -fsSL "$url" -o "$tmp/$asset"; then
  echo "error: could not download CPOS release asset" >&2
  echo "Make sure a GitHub release exists with asset '$asset'." >&2
  exit 1
fi

tag="$(printf '%s' "$url" | sed -n 's|.*/download/\([^/]*\)/.*|\1|p')"
if [ -n "$tag" ] && curl -fsSL "https://github.com/$repo/releases/download/$tag/SHA256SUMS" -o "$tmp/SHA256SUMS" 2>/dev/null; then
  expected="$(awk -v asset="$asset" '$2 == asset || $2 == "*" asset { print $1; exit }' "$tmp/SHA256SUMS")"
  if [ -n "$expected" ]; then
    actual=""
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
      actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
    fi
    if [ -n "$actual" ] && [ "$actual" != "$expected" ]; then
      echo "error: checksum mismatch for '$asset'" >&2
      exit 1
    fi
  fi
fi

tar -xzf "$tmp/$asset" -C "$tmp"

if [ ! -f "$tmp/cpos" ]; then
  echo "error: release archive did not contain the cpos binary" >&2
  exit 1
fi

mkdir -p "$bin_dir"
rm -f "$bin_dir/cpos"
mv "$tmp/cpos" "$bin_dir/cpos"
chmod 755 "$bin_dir/cpos"

echo "Installed CPOS to $bin_dir/cpos"

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *)
    echo "Add this to your shell profile if 'cpos' is not found:"
    echo "  export PATH=\"$bin_dir:\$PATH\""
    ;;
esac

echo "Run: cpos"
