#!/usr/bin/env python3
"""Copy the publish-repo GitHub Pages template into docs/archive-preview/ for local mock viewing."""

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "publish-site"
OUT = ROOT / "docs" / "archive-preview"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "style.css"):
        shutil.copy2(SRC / name, OUT / name)
    sample = SRC / "data.sample.json"
    data = json.loads(sample.read_text(encoding="utf-8"))
    (OUT / "data.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    meta = json.loads((SRC / "meta.sample.json").read_text(encoding="utf-8"))
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote archive preview to {OUT}")
    print("Preview: cd docs && python3 -m http.server 8765")
    print("Open:    http://127.0.0.1:8765/archive-preview/")


if __name__ == "__main__":
    main()
