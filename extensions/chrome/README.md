# CPOS Companion

Browser extension for Codeforces and CSES. Captures public sample tests and relays them to CPOS on your machine. Autofills judge submit pages when you submit from VS Code or the terminal app.

**Current version:** 0.7.0 (see [CHANGELOG.md](../../CHANGELOG.md)).

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

## Interface & features (0.7.0+)

Click the toolbar icon for the **popup hub** — flat, themeable, with a live CPOS connection indicator and switches for each feature:

- **Profile analytics** — augments `codeforces.com/profile/<handle>` in place with a rating chart, solved-by-rating, top tags, verdicts, and languages (public CF API, read-only).
- **Rating predictions** — a predicted-Δ column on contest standings using the official Codeforces rating formula (exact deltas once a contest is rated).
- **Site theming** — restyle Codeforces / CSES with any CPOS palette.
- **Code & LaTeX styling** — self-contained syntax highlighting for statement/editorial code blocks (no remote scripts).
- **In-browser editor** — a slide-in editor on problem pages; write and submit without leaving the browser. Submission reuses the existing background submit injector, so the capture/submit flow is unchanged.

All UI is gradient-free and shares one theme palette (`themes.js`). Feature toggles live in `chrome.storage.local`; content scripts react live.

### Optional: vendor Monaco for the editor

The in-browser editor ships with a fast textarea by default. Manifest V3 forbids loading scripts from a CDN, so to use the full Monaco (VS Code) editor you vendor it locally once:

```bash
cd extensions/chrome
npm i monaco-editor
mkdir -p vendor/monaco
cp -r node_modules/monaco-editor/min/vs vendor/monaco/vs
```

Then add `vendor/monaco/vs/**` to `web_accessible_resources` in `manifest.json`. `ide.js` will use Monaco automatically when `vendor/monaco/vs/loader.js` is present, falling back to the textarea otherwise.

## Troubleshooting

See [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md) (submit language, capture, Chrome login).

## Development

See [CONTRIBUTING.md](../../CONTRIBUTING.md) and [STORE_LISTING.md](STORE_LISTING.md).

```bash
./package-store.sh   # produces cpos-companion.zip for the Web Store
```
