# Changelog

All notable changes to CPOS are documented here. Components are versioned independently:

| Component | Current version | Version file |
| --- | --- | --- |
| Terminal app | 0.1.0 | `Cargo.toml` |
| VS Code extension | **0.3.13** | `extensions/vscode/package.json` |
| Browser companion | **0.6.6** | `extensions/chrome/manifest.json` |

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Terminal app
- Pressing **`o`** / Enter to open a problem now creates the solution file in your **active project folder** when VS Code has synced a path, a recent session points outside `~/cpos`, or your shell cwd looks like a project — instead of always using `~/cpos/codeforces/…`

### Added
- Community docs: `CONTRIBUTING.md`, `SECURITY.md`, `ARCHITECTURE.md`
- GitHub Actions CI (`cargo test`, VS Code extension compile)
- Issue and pull request templates
- Terminal app: `plain` theme — neutral grayscale palette for a low-color interface

### Changed
- Landing page redesign with optimized WebP screenshots and ecosystem section

---

## Browser companion — 0.6.6

### Fixed
- **Codeforces submit** now follows the same flow as [cph-submit](https://github.com/agrawal-d/cph-submit): paste into `sourceCodeTextarea`, set `programTypeId`, set problem field, click `.submit` — without touching Ace or firing `change` events (which wiped the editor)
- Language selection: try the numeric id first, then ranked text matching (e.g. G++17 before G++14) when Codeforces changes ids
- Retry injection up to 8 times while the submit page loads; removed a guard that blocked retries after a failed attempt
- Single owner for CF submit in the background worker (content script no longer races to fill the form in an isolated world without Ace access)

## Browser companion — 0.6.3 – 0.6.5

### Added
- Capture **Codeforces sub-test-case block metadata** from `test-example-line-N` classes so the VS Code panel can highlight input blocks that match each expected output line

### Fixed
- Codeforces submit: quiet form fill, MAIN-world injection only, longer tab-load wait
- CSES submit unchanged (still working)

## Browser companion — 0.6.2

### Fixed
- Codeforces submit on **contest** and **problemset** pages (`submittedProblemIndex` vs `submittedProblemCode`)

## Browser companion — 0.6.1

### Added
- Sample capture from Codeforces and CSES problem pages
- Submit form autofill when submitting from CPOS
- CSES solved/attempted progress scraping
- Localhost-only communication (`127.0.0.1:27121` / `27122`)
- Published on Chrome Web Store

---

## VS Code extension — 0.3.13

### Added
- **Test-case block hover** in the panel: zebra stripes per sub-test-case, gutter numbers, and highlight that links input blocks to expected output lines (uses block metadata from the browser companion when available)
- **Draggable split** between Input and Expected columns; ratio saved in panel state
- Wider default column for input (expected output is often one line per case)

### Fixed
- Removed double-render “ghost” text on input lines (background layer is stripes only; text comes from the textarea)

## VS Code extension — 0.3.10 – 0.3.12

### Added
- Resizable input/output layout and improved test-case panel layout (0.3.10)

### Fixed
- Text rendering ghosting on striped input rows (0.3.12)

## VS Code extension — 0.3.9

### Fixed
- Codeforces submit pipeline coordination with the browser companion (queue + open submit URL)

## VS Code extension — 0.3.8

### Added
- Panel themes: pick from **CPOS**, **Midnight**, **Amber**, **Paper**, and **Native** (matches your VS Code color theme) via the `◑ theme` button in the panel header — choice is remembered

### Changed
- Refreshed panel UI: higher text contrast, lifted surfaces, rounded cards, and a branded header — less generic, more in line with the CPOS look

## VS Code extension — 0.3.7

### Added
- CPOS side panel: run samples, submit, open problem
- Browser capture server on port `27122`
- Auto file creation in open workspace folder
- Per-file sample storage and inline pass/fail results
- Configurable language, compile commands, and save location
- Sync with TUI over localhost

---

## Terminal app — 0.1.0

### Added
- TUI with Dashboard, Problems, Contests, Analytics, and Recommend tabs
- Local problem browser with search, rating filter, and platform switch
- Codeforces sync (problems, submissions, rating, contests)
- CSES progress sync via browser companion
- Recommendation engine (30 unsolved problems targeting weak tags)
- Localhost capture server on port `27121`
- Sample test runner and browser submit autofill (via Chrome companion)

---

When cutting a release, add a dated section, bump the version in the component’s manifest/`Cargo.toml`, and link the GitHub Release tag.
