# Changelog

All notable changes to CPOS are documented here. Components are versioned independently:

| Component | Current version | Version file |
| --- | --- | --- |
| Terminal app | 0.1.3 | `Cargo.toml` |
| VS Code extension | 0.3.23 | `extensions/vscode/package.json` |
| Browser companion (Chrome) | 0.6.13 | `extensions/chrome/manifest.json` |
| Browser companion (Firefox) | 0.0.1 | `extensions/firefox/manifest.json` |

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Firefox browser companion source build in `extensions/firefox`, with temporary add-on install instructions and XPI packaging for self-signing or future AMO distribution.

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
