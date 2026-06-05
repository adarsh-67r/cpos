#!/usr/bin/env bash
# Preview marketing site + archive mock. Run from anywhere:
#   bash tools/preview.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 tools/sync_archive_preview.py
echo ""
echo "Starting server at http://127.0.0.1:8765/"
echo "  Marketing:  http://127.0.0.1:8765/"
echo "  Archive:    http://127.0.0.1:8765/archive-preview/"
echo ""
echo "Press Ctrl+C to stop."
cd docs
exec python3 -m http.server 8765
