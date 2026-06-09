# Changelog

All notable changes to CPOS are documented here. Components are versioned independently:

| Component | Current version | Version file |
| --- | --- | --- |
| Terminal app | 0.1.7 | `Cargo.toml` |
| VS Code extension | 0.3.27 | `extensions/vscode/package.json` |
| Browser companion (Chrome) | 0.6.14 | `extensions/chrome/manifest.json` |
| Browser companion (Firefox) | 0.0.2 | `extensions/firefox/manifest.json` |

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Firefox browser companion source build in `extensions/firefox`, with temporary add-on install instructions and XPI packaging for self-signing or future AMO distribution.

---

## Terminal app — 0.1.7 - 2026-06-09

### Added
- **Goal-based Target tab.** Set a rating goal — cycle Codeforces rank milestones with `[` / `]` or type an exact rating with `t` — and CPOS shows where you stand (effective level, gap to goal, overall readiness %, and problems solved in the goal band). The **Topics to Cover** table labels each prerequisite topic **Ready / Developing / Gap / Untouched**, weakest-first, and a **step-by-step plan** ramps unsolved problems from your level up to the goal (labelled **Base → Build → Push → Target**, weak/uncovered topics front-loaded). Press `enter`/`o` on a step to start it in the normal Problems solve flow. (Thanks @ThatDeparted2061, #11.)

### Changed
- **Recommend is now coverage-aware.** Core prerequisite topics you've never solved are surfaced as coverage gaps ("New topic to cover") instead of being scored as mastered, and topics only ever cleared well below your target band get a small nudge. History-gated, so cold-start output is unchanged.

### Fixed
- Capture-server tests now bind an OS-assigned ephemeral port instead of a hardcoded one, so they no longer collide with a running CPOS instance or with each other.

---

## VS Code extension - 0.3.27 - 2026-06-07

### Fixed
- **Windows Run All stale-buffer fix** - before compiling samples on Windows, CPOS now saves the matching dirty solution document. This prevents Run All from compiling an older saved starter file while the editor contains newer code, which surfaced as every sample showing "no output" even when the current buffer had output or compilation errors. macOS/Linux behavior is unchanged.

---

## Terminal app — 0.1.6 - 2026-06-07

### Fixed
- **Windows: the whole TUI rendered as garbled / Cyrillic ("Russian") text.** The console started in a legacy code page, so the UI's box-drawing characters and symbols (`→ ✓ • … ▸`) — which are UTF-8 — were decoded as mojibake. CPOS now switches the Windows console to UTF-8 (`SetConsoleOutputCP`/`SetConsoleCP` to code page 65001) on startup. macOS/Linux are unaffected (already UTF-8).
- **Windows: pasting a template in setup only captured the first line and could skip the CSES step.** Windows terminals (notably conhost) often don't deliver bracketed-paste events, so a multi-line paste arrived as raw keystrokes — the embedded newline acted as Enter (jumping past the CSES step) and a stray `o` triggered "open CSES login." The setup wizard no longer relies on bracketed paste.

### Added
- **Setup: paste a template with `v` (or Ctrl+V).** The Template step now reads the full clipboard on a keypress via the platform clipboard tool (`Get-Clipboard` on Windows, `pbpaste` on macOS, `xclip`/`xsel` on Linux), so multi-line templates come in intact on every platform.
- **Setup: load a template from a file.** The Template step has a **Paste ⇄ Upload** toggle (`Tab`); in Upload mode you type or paste a file path and press Enter to load it, with a live preview.

> macOS behavior is preserved — the existing `⌘V` bracketed-paste path still works, and the UTF-8 console fix is Windows-only.

---

## Terminal app — 0.1.5 - 2026-06-07

### Fixed
- **Windows: `cpos update` failed for Scoop installs** with `failed to run scoop: program not found`. On Windows `scoop` is a `.cmd`/`.ps1` shim, which `CreateProcess` can't launch directly (it only resolves `.exe`). The updater now runs Scoop through `cmd /C` so the shim resolves via `PATHEXT`, and refreshes buckets (`scoop update`) before upgrading `cpos`.

---

## Terminal app — 0.1.4 - 2026-06-07

### Fixed
- **Windows: opening a problem now works.** Pressing **`o`** (or Enter) in the TUI was a no-op on Windows — the statement never opened in the browser, so the CPOS browser companion never captured the samples (surfacing as "couldn't fetch cases"). The OS-integration layer was hardcoded to the macOS `open` command, which doesn't exist on Windows. Opening a URL/file now uses `cmd /C start` on Windows (`open` on macOS, `xdg-open` on Linux).
- **Windows: the solution file now opens in your editor with your template.** Editor auto-detection ran `command -v` through `sh`, which fails to find VS Code's `code.cmd` shim on Windows, so the templated file was created but never opened. Detection now uses `where` on Windows, and `code`/`cursor` are launched via `cmd /C` (custom editor commands run through `cmd /C` instead of `sh -c`).
- **Windows: "open in browser" (`b`) and the CSES login shortcut (`o`) in setup** now open correctly for the same reason.
- **Clipboard on submit** now uses the platform-native tool (`clip` on Windows, `pbcopy` on macOS, `xclip` on Linux) instead of always shelling out to the macOS-only `pbcopy`.

> macOS behavior is unchanged — every integration point branches by OS and keeps the exact commands it used before.

---

## VS Code extension — 0.3.26 - 2026-06-06

### Added
- **Solution tab** — a new third tab in the panel surfaces video solutions and editorial links for the open problem. Videos are shown as clickable thumbnails (YouTube watch page opens in the system browser). The accordion also provides one-click links to YouTube search, Google, and the Codeforces problem/editorial pages.
- **Anti-cheat gate** — the Solution tab is automatically hidden while a Codeforces contest is still running. The extension fetches CF's `contest.list` API on activation (and refreshes at most once per minute) and suppresses the tab for any problem whose contest phase is not `FINISHED`. Applies only to Codeforces contest problems; CSES and finished contests are unaffected.
- **Sample tests in Statement view** — for Codeforces problems (where the browser companion strips `.sample-tests` during capture) the sample I/O is re-injected into the statement view so it reads like the original problem page. Alternating row striping makes multi-block test cases easy to scan.
- **Windows C++ compilation fix** — the compile command now appends `.exe` to the `-o` output flag and the run path uses the full absolute path, so compiled binaries are found correctly on Windows regardless of PATH lookup behaviour.

### Fixed
- **Blank panel regression** — single-backslash `\n` literals inside the webview template literal were being cooked into raw newlines by the outer template literal at runtime, causing an unterminated-string syntax error that silently killed the entire webview script and left all tabs blank.
- **CF regex in webview** — the Codeforces contest-number regex inside the webview script was also mangled by the outer template literal (`\d` → `d`), breaking the "CF Problem page / Editorial" links. Both are now correctly double-escaped.

### Changed
- YouTube embeds removed from the Solution tab. YouTube's IFrame player rejects the `vscode-webview://` origin (Error 153 on every video regardless of per-video embedding settings); replaced with thumbnail cards that open the real watch page in the system browser.
- Statement tab sample blocks no longer have hover highlight animation; the static odd/even row striping is kept. Tests tab IO hover is unchanged.

---

## VS Code extension — 0.3.25 - 2026-06-06

### Added
- **Sponsor button** in the panel header — links to GitHub Sponsors to help keep CPOS free and local-first.

### Changed
- The header **GitHub** button is now icon-only to make room for the Sponsor button without crowding the toolbar.

## VS Code extension — 0.3.24 - 2026-06-06

### Added
- **Statement view** — the panel now has Tests / Statement tabs. The Statement tab renders the captured problem statement natively with MathJax, styled to read like a Codeforces page using the existing CPOS theme variables (contributed by [@Tanishq216](https://github.com/Tanishq216), #8).

### Fixed
- **Statement HTML is sanitized** before rendering and the webview CSP is tightened (script/style/font limited to the MathJax CDN) (#8).
- **Windows file paths** — sample/problem metadata filenames are normalized (lowercased on Windows) before hashing so they resolve consistently across drives (#8).
- **Single scrollbar** — `html`/`body` no longer scroll; only the statement content area scrolls, removing the clashing double scrollbar.
- Removed the redundant "standard input / standard output" rows from the rendered statement, keeping the time and memory limits.

## Browser companion (Chrome) — 0.6.14 - 2026-06-06

### Added
- **Statement capture** — captures the problem statement HTML from Codeforces (extracting original TeX from MathJax 2 `math/tex` scripts) and CSES (reverting KaTeX spans to raw TeX) and sends it to the VS Code panel (contributed by [@Tanishq216](https://github.com/Tanishq216), #8).

### Fixed
- **Submit tab explosion** — submit polling now reuses the same browser tab via tracked tab IDs and gives up after a bounded number of attempts (acking the queue) instead of spawning duplicate tabs forever (#8).

## Browser companion (Firefox) — 0.0.2 - 2026-06-06

### Added
- **Statement capture** — ports the Codeforces/CSES statement capture to the Firefox companion so the VS Code Statement tab works on Firefox too, stripping the CSES sample I/O and KaTeX loader tags.

### Fixed
- **Submit tab explosion** — submit polling reuses the same tab via tracked tab IDs and stops after a bounded number of attempts, matching the Chrome companion.

---

## VS Code extension — 0.3.23 - 2026-06-06

### Fixed
- **Windows Run All** — stop quoting `{output}` and `{source}` paths unnecessarily; fixes `"Hello".exe` linker errors and Python `can't open file … Invalid argument` (#6).

---

## Terminal app — 0.1.3 - 2026-06-04

### Added
- Startup update check for the terminal app. If a newer TUI release is available, CPOS asks before running `cpos update`; slow/offline checks fall through and open normally.
- CSES progress sync now records newly observed solved/attempted tasks as dated CPOS activity after the first baseline sync.
- Community documentation: `CONTRIBUTING.md`, `SECURITY.md`, `ARCHITECTURE.md`
- GitHub Actions CI (`cargo test`, VS Code extension compile)
- GitHub Release workflow for prebuilt terminal app binaries on macOS, Linux, and Windows
- `install.sh`, `install.ps1`, and [INSTALL.md](INSTALL.md) for binary TUI installs and release publishing
- Generated Homebrew formula and Scoop manifest publishing from release assets
- Issue and pull request templates
- Terminal app: `plain` theme (neutral grayscale palette)
- Terminal app: `light` theme (bright canvas for light terminal / VS Code light-theme users)

### Changed
- Recommendations now use solved/attempted history to prefer stretch problems above the user's level, keep a larger scrollable pool, and avoid recommending CSES tasks already marked solved by progress sync.
- Streaks and the Analytics activity heatmap now count known CPOS activity days on the local calendar, across Codeforces plus newly observed CSES progress, instead of accepted-only UTC days.
- Opening a problem with **`o`** or Enter now prefers your **active project directory** when VS Code has synced a solution path, a recent session points outside the default `~/cpos` tree, or the shell working directory looks like a project.
- **Submit** now relies entirely on the browser companion in Chrome instead of opening the system default browser, so submissions always land in the logged-in Chrome session (matching the VS Code flow).
- `cpos update` now delegates to Homebrew/Scoop when CPOS was installed through a package manager.
- Landing page redesign with higher-resolution WebP screenshots and package-manager-first TUI install commands.
- Full demo video embedded on the [website](https://cpos.sohamaggarwal.com) and linked from README files.
- Added [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for TUI install, Run All, submit, capture, and source-build issues.

---

## VS Code extension — 0.3.22 - 2026-06-04

### Changed
- Compatibility package for the CPOS 0.1.3 / browser companion 0.6.13 release. No VS Code runtime behavior changed.

---

## Browser companion — 0.6.13 - 2026-06-04

### Fixed
- CSES submit no longer double-submits by racing the content-script fallback against the background submitter.
- CSES C++ version selection now chooses the highest visible version from the submit page instead of hardcoding C++17.

---

## Terminal app — 0.1.2

### Fixed
- `cpos update` now detects Homebrew/Scoop installs through package-manager symlinks and shims before falling back to standalone binary updates.

---

## VS Code extension — 0.3.21

### Fixed
- **Run All on macOS and Windows** — cross-platform shell for compile/run (`/bin/sh` or `cmd.exe`), enriched PATH for GUI-launched editors, Windows `.exe` run templates, and `python`/`g++` discovery on Windows

## VS Code extension — 0.3.20

### Fixed
- **Native theme Run All button** — uses VS Code button colors with white label text on light and dark editor themes
- **Extension README screenshot** — panel preview image now loads in the Extensions detail view (GitHub-hosted URL)
- **Build pipeline** — `npm run package` compiles TypeScript before packaging so panel CSS changes ship in the VSIX

## VS Code extension — 0.3.17 – 0.3.19

### Added
- **Search** header button — Google search for editorials/solutions for the linked problem
- **GitHub** header button — quick link to the CPOS repo
- Branded CPOS logo in the panel header (`icon128.png`)

### Changed
- Replaced the capture-server status line in the header with Search / GitHub / theme controls
- Styled header buttons (GitHub black, Search blue tint, theme accent)

---

## Browser companion — 0.6.12

### Fixed
- Codeforces submit language now picks the **newest matching compiler** (e.g. C++23 before C++17) by reading dropdown labels instead of relying on a stale `programTypeId` fallback

## Browser companion — 0.6.11

### Changed
- **Much faster submit:** the service worker is kept warm (keepalive + alarm revive) so a queued submission is picked up almost immediately instead of waiting for the worker to wake
- The open problem page now nudges the worker the moment a submission is queued, so submit stays responsive even after an idle period
- Submit tab opens as soon as the URL commits (no longer waits for the full page load); poll interval tightened to 150 ms

## Browser companion — 0.6.7 – 0.6.10

### Fixed
- Codeforces submit reliability: source textarea set first with Ace kept in sync, correct problem field (`submittedProblemIndex` vs `submittedProblemCode`), and robust submit-button selection
- Brings the Chrome submit tab to the foreground after filling, without blocking the submit flow

### Added
- Codeforces **output block metadata** (`output_block_sizes`) alongside input blocks for accurate input/output highlighting, with a fallback parser for `YES`/`NO`-style outputs

## Browser companion — 0.6.6

### Fixed
- **Codeforces submit:** reliable autofill by setting the source textarea first, then language and problem fields, then activating the submit control—without resetting the Ace editor
- **Language selection:** numeric program type id when available, with ranked fallback on compiler display names when Codeforces updates ids
- **Retries:** up to eight injection attempts while the submit page loads
- **Concurrency:** background worker is the sole submit handler; avoids conflicting fills from the isolated content-script world

## Browser companion — 0.6.3 – 0.6.5

### Added
- Capture of Codeforces **sub-test-case block metadata** (`test-example-line-*`) for aligned input/output highlighting in the VS Code panel

### Fixed
- Codeforces submit uses main-world injection and extended page-load timing
- CSES submit behavior unchanged

## Browser companion — 0.6.2

### Fixed
- Codeforces submit on contest pages (`submittedProblemIndex`) and problemset pages (`submittedProblemCode`)

## Browser companion — 0.6.1

### Added
- Sample capture from Codeforces and CSES problem pages
- Submit form autofill when submitting from CPOS
- CSES solved and attempted progress scraping
- Localhost-only communication (`127.0.0.1:27121` / `27122`)
- Initial Chrome Web Store release

---

## VS Code extension — 0.3.16

### Added
- Panel theme is now saved in extension storage, so your choice persists across reloads, restarts, and reinstalls

### Fixed
- Input/output block highlighting now links whole blocks (including multi-line `YES`/`NO` outputs) using captured output block sizes, with a fallback parser when metadata is absent

## VS Code extension — 0.3.14 – 0.3.15

### Changed
- Submit no longer opens the system default browser; the browser companion opens and fills the submit page in Chrome

## VS Code extension — 0.3.13

### Added
- **Test-case panel:** per-block striping, gutter labels, and linked highlight between input blocks and expected output lines when block metadata is present
- **Resizable columns** between input and expected output; ratio persisted in panel state
- Wider default width for multi-line sample input

### Fixed
- Duplicate text rendering on striped input rows (decoration layer shows stripes only; editable text remains in the textarea)

## VS Code extension — 0.3.10 – 0.3.12

### Added
- Resizable input and output layout in the test panel (0.3.10)

### Fixed
- Visual artifact on striped input rows (0.3.12)

## VS Code extension — 0.3.9

### Fixed
- Submit coordination with the browser companion (localhost queue and submit URL)

## VS Code extension — 0.3.8

### Added
- Panel themes: **CPOS**, **Midnight**, **Amber**, **Paper**, and **Native** (follows the active VS Code theme); selection persisted via the theme control in the panel header

### Changed
- Refreshed panel visual design: improved contrast, card layout, branded header

## VS Code extension — 0.3.7

### Added
- CPOS side panel: run samples, submit, open problem
- Browser capture server on port `27122`
- Automatic file creation in the open workspace folder
- Per-file sample storage and inline pass/fail results
- Configurable language, compile commands, and save location
- Localhost sync with the terminal app

---

## Terminal app — 0.1.0

### Added
- TUI with Dashboard, Problems, Contests, Analytics, and Recommend tabs
- Local problem browser with search, rating filter, and platform filter
- Codeforces sync (problems, submissions, rating, contests)
- CSES progress sync via the browser companion
- Recommendation engine (30 unsolved problems targeting weak topics)
- Localhost capture server on port `27121`
- Local sample test runner; submit via the browser companion

---

When cutting a release, add a dated section, bump the version in the component manifest or `Cargo.toml`, and publish a GitHub release.
