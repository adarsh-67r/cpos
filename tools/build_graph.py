#!/usr/bin/env python3
"""Build the slim architecture-graph data served at /architecture.

graphify (run separately; not vendored in this repo) emits a rich NetworkX
node-link ``graph.json`` (~5 MB) plus a ``GRAPH_REPORT.md`` audit. The viewer at
``docs/architecture/`` does not need most of that: per-node vis-network styling,
norm labels, confidence scores, and edge context are all either derivable in the
browser or unused. This script transforms graphify's output into one compact,
minified ``graph.json`` (~1 MB, a single line) that is the single source of truth
for both the viewer and any AI tool that wants to query the graph.

Usage:
    python tools/build_graph.py <graphify graph.json> <out dir> [GRAPH_REPORT.md]

Example:
    python tools/build_graph.py graphify-out/graph.json docs/architecture/ \
        graphify-out/GRAPH_REPORT.md
"""
from __future__ import annotations

import colorsys
import json
import re
import sys
from collections import Counter
from pathlib import Path

# graphify's own working files; their content must never reach a published
# artifact. The build fails loudly if any of these strings appear in the output.
PRIVACY_FORBIDDEN = ("CLAUDE.md", ".serena", ".graphify_")


def community_color(i: int) -> str:
    """Deterministic, well-spread categorical color for community ``i``.

    Golden-angle hue rotation keeps adjacent community ids visually distinct
    even across 174 communities; saturation/lightness alternate slightly so
    repeated hues are still tellable apart.
    """
    hue = (i * 137.508) % 360 / 360.0
    sat = 0.58 + 0.12 * (i % 3) / 2.0
    light = 0.62 - 0.10 * (i % 2)
    r, g, b = colorsys.hls_to_rgb(hue, light, sat)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def parse_community_names(report_path: Path | None) -> dict[int, str]:
    """Recover semantic community names from GRAPH_REPORT.md.

    Lines look like:  ### Community 10 - "TUI Event Loop & Key Handling"
    """
    names: dict[int, str] = {}
    if not report_path or not report_path.exists():
        return names
    pat = re.compile(r'^#{2,4}\s+Community\s+(\d+)\s+-\s+"(.+?)"\s*$')
    for line in report_path.read_text(encoding="utf-8").splitlines():
        m = pat.match(line.strip())
        if m:
            names[int(m.group(1))] = m.group(2)
    return names


def build(src_path: Path, out_dir: Path, report_path: Path | None) -> None:
    src = json.loads(src_path.read_text(encoding="utf-8"))
    raw_nodes = src["nodes"]
    raw_links = src["links"]
    built_at = src.get("built_at_commit", "")

    node_ids = {n["id"] for n in raw_nodes}
    names = parse_community_names(report_path)

    # --- nodes: id, label, community (c), source_file (f), file_type (t) ---
    nodes = []
    comm_counts: Counter[int] = Counter()
    for n in raw_nodes:
        c = int(n.get("community", -1))
        comm_counts[c] += 1
        node = {
            "id": n["id"],
            "label": n.get("label", n["id"]),
            "c": c,
            "f": n.get("source_file", ""),
            "t": n.get("file_type", ""),
        }
        nodes.append(node)

    # --- edges: [source, target, relation], endpoints must exist ---
    edges = [
        [l["source"], l["target"], l.get("relation", "")]
        for l in raw_links
        if l["source"] in node_ids and l["target"] in node_ids
    ]

    # --- communities: id, name, color, node count ---
    communities = [
        {
            "id": cid,
            "name": names.get(cid, f"Community {cid}"),
            "color": community_color(cid),
            "n": comm_counts[cid],
        }
        for cid in sorted(comm_counts)
    ]

    out = {
        "meta": {
            "nodes": len(nodes),
            "edges": len(edges),
            "communities": len(communities),
            "built_at_commit": built_at,
            "repo": "Soham109/cpos",
        },
        "communities": communities,
        "nodes": nodes,
        "edges": edges,
    }

    payload = json.dumps(out, separators=(",", ":"), ensure_ascii=False)

    # --- privacy guard ---
    leaked = [s for s in PRIVACY_FORBIDDEN if s in payload]
    if leaked:
        sys.exit(f"ERROR: forbidden content in output: {leaked}")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "graph.json"
    out_file.write_text(payload, encoding="utf-8")

    # --- optionally relocate the human-readable audit as living docs ---
    if report_path and report_path.exists():
        report = report_path.read_text(encoding="utf-8")
        # Obsidian-style [[target|alias]] / [[target]] render as literal text on
        # GitHub; flatten to plain text so the audit reads cleanly.
        report = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", report)
        report = re.sub(r"\[\[([^\]]*)\]\]", r"\1", report)
        (out_dir / "REPORT.md").write_text(report, encoding="utf-8")

    src_bytes = src_path.stat().st_size
    print(
        f"nodes={len(nodes)} edges={len(edges)} communities={len(communities)}\n"
        f"source : {src_bytes:>10,} bytes ({src_bytes/1e6:.1f} MB)\n"
        f"slim   : {len(payload.encode()):>10,} bytes "
        f"({len(payload.encode())/1e6:.2f} MB, 1 line) -> {out_file}"
    )


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    report = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    build(src, out_dir, report)


if __name__ == "__main__":
    main()
