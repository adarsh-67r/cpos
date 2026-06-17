# CPOS Companion

Browser extension for Codeforces and CSES. Captures public sample tests and relays them to CPOS on your machine. Autofills judge submit pages when you submit from VS Code or the terminal app.

**Current version:** 0.10.2 (see [CHANGELOG.md](../../CHANGELOG.md)).

## Install

**[Chrome Web Store](https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm)** — Chrome, Edge, Brave.

Also install the **[CPOS VS Code extension](https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode)** and/or the [terminal app](https://github.com/Soham109/cpos).

## What it does

- Reads public samples from Codeforces and CSES problem pages and sends them to `127.0.0.1:27122` (VS Code) and/or `127.0.0.1:27121` (terminal)
- Captures the problem statement (Codeforces and CSES) so the VS Code panel can render it natively in a Statement tab
- On Codeforces, captures sub-test-case block structure when the statement provides it
- Polls for queued submissions and autofills the judge submit form in your logged-in browser session (picks the newest matching compiler on Codeforces, e.g. C++23 over C++17)
- Scrapes CSES solved and attempted status on the problem list when requested

Data is not sent to third-party servers—only to CPOS on localhost.

## Interface & features (0.10.2)

Click the toolbar icon for the **popup hub** — flat, themeable, with a live CPOS connection indicator and switches for each feature:

- **Profile analytics** — augments `codeforces.com/profile/<handle>` in place with charts CF doesn't already show: a submission activity heatmap, solved-by-rating and solved-by-index histograms, verdict and language donuts, top tags, and acceptance rate / rank progress (public CF API, read-only).
- **Rating predictions** — a predicted-Δ column on contest standings using the official Codeforces rating formula (exact deltas once a contest is rated).
- **Modernize** — a sleek restyle for Codeforces / CSES: modern system font, roomier spacing, rounded cards, cleaner tables/buttons/code. Typographic/structural only, so it composes with the colour theme.
- **Recolor the site** — apply any CPOS palette to Codeforces / CSES.
- **Code & LaTeX styling** — self-contained syntax highlighting for statement/editorial code blocks (no remote scripts).
- **In-browser editor** — a CodeMirror-powered, line-numbered editor with syntax highlighting, completion basics, per-test diff, custom stdin, find & replace, and starter templates; write, run, and submit without leaving the browser. On by default. _Running_ compiles on the local CPOS runner (VS Code extension or terminal app) since browsers can't execute C++/Java; editing and submit don't need it. Submission reuses the existing background submit injector, so the capture/submit flow is unchanged.
- **Profile compare (VS)** — add other handles on a profile and compare stats side-by-side with a rating-history overlay.
- **Contest reminders** — desktop notifications before upcoming Codeforces contests, with a configurable lead time (public `contest.list`).
- **Daily problem & streak**, **Favorites**, and a draggable per-problem **timer**.
- **Problem focus** — a small always-available control on Codeforces problem pages that hides the right rail and expands the statement for split-screen solving.
- **Problem tools** (rating badge, tag-hider/training mode, copy sample input, similar problems), **problemset tools** (solve-status coloring, hide-solved, solve counts), **standings tools** (colorize by language, friends filter), and **marker & notes**.

All UI is gradient-free and shares **one theme palette** across the popup, the site, and every CPOS tool (`themes.js`). Feature toggles live in `chrome.storage.local`; content scripts react live.

### Rebuilding the editor bundle

The in-browser editor ships with a bundled CodeMirror build (`codemirror-bundle.js`), so the Web Store package does not load editor code from a CDN.

```bash
cd extensions/chrome
npm install
npm run build:editor
```

## Troubleshooting

See [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md) (submit language, capture, Chrome login).

## Development

See [CONTRIBUTING.md](../../CONTRIBUTING.md) and [STORE_LISTING.md](STORE_LISTING.md).

```bash
./package-store.sh   # produces cpos-companion.zip for the Web Store
```
