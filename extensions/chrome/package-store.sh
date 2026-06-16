#!/usr/bin/env bash
# Build the Chrome Web Store upload zip (extension runtime files only).
#
# Packages every file the manifest and popup load — all content scripts, the
# background worker, popup, feature scripts/styles and icons. Dev-only assets
# (store screenshots, READMEs, this script, old zips) are intentionally left out.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f icons/icon128.png ]]; then
  echo "Generating icons..."
  npx --yes @resvg/resvg-js-cli --fit-width 128 icons/icon.svg icons/icon128.png
  npx --yes @resvg/resvg-js-cli --fit-width 48 icons/icon.svg icons/icon48.png
  npx --yes @resvg/resvg-js-cli --fit-width 16 icons/icon.svg icons/icon16.png
fi

rm -f cpos-companion.zip

# All runtime assets: manifest, every js/css/html, and the PNG icons.
zip -q cpos-companion.zip \
  manifest.json \
  ./*.js ./*.css ./*.html \
  icons/icon16.png icons/icon48.png icons/icon128.png

# Optional: vendored Monaco editor, if it has been installed locally.
if [[ -d vendor ]]; then
  zip -qr cpos-companion.zip vendor
fi

echo "Created cpos-companion.zip ($(du -h cpos-companion.zip | cut -f1))"
echo "Files: $(unzip -l cpos-companion.zip | tail -1 | awk '{print $2}')"
