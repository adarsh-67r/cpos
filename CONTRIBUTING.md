# Contributing to CPOS

Thanks for taking the time to contribute. CPOS is open source (MIT) — bug reports, ideas, docs fixes, and code are all welcome.

## Ways to help

- **Report bugs** — [open an issue](https://github.com/Soham109/cpos/issues) with steps to reproduce, your OS, and which part you use (terminal / VS Code / browser).
- **Suggest features** — issues are fine; explain the problem you're trying to solve, not just the feature name.
- **Fix bugs or improve docs** — pull requests are the fastest path.
- **Share feedback** — if something in the README or website is wrong, fix it or tell us.

You don't need permission to open an issue or start a small PR.

## Project layout

| Path | What it is |
| --- | --- |
| `src/` | Terminal app (Rust + ratatui) |
| `extensions/vscode/` | VS Code extension |
| `extensions/chrome/` | Browser companion |
| `docs/` | Landing site (`cpos.sohamaggarwal.com`) |
| `tools/` | Screenshot render/optimize scripts |

The three user-facing pieces talk over localhost (`27121` TUI, `27122` VS Code). Keep that contract in mind when changing capture or submit behavior.

## Development setup

### Terminal app

```bash
cargo build
cargo run
cargo test
```

On macOS you may need a real GNU toolchain for C++ (`brew install gcc`) if you're testing C++ captures.

### VS Code extension

```bash
cd extensions/vscode
npm install
npm run compile
```

Open the `extensions/vscode` folder in VS Code/Cursor and press **F5** to launch an Extension Development Host. See [`extensions/vscode/README.md`](extensions/vscode/README.md).

### Browser companion

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `extensions/chrome`

See [`extensions/chrome/README.md`](extensions/chrome/README.md) for store packaging.

### Landing page

Static files in `docs/`. Preview locally:

```bash
cd docs && python3 -m http.server 8080
```

Regenerate TUI screenshots: `cargo run --example gen_screenshots`, then `python3 tools/render_screens.py` (needs Pillow).

## Pull requests

1. **Fork** and branch from `main` (`fix/…`, `feat/…`, or `docs/…`).
2. **Keep PRs focused** — one logical change is easier to review than a bundle.
3. **Describe what and why** in the PR body, not just what files changed.
4. **Test what you touch** — at minimum `cargo test` for Rust changes; manually smoke-test extensions if you change capture/submit/UI.
5. **Match existing style** — naming, formatting, and patterns already in the file you're editing.

Don't worry about perfect commit history; clear PR descriptions matter more.

## Code guidelines

- Prefer small, readable changes over large refactors unless discussed first.
- Don't break the local-only model — no sending user code or problem data to external servers.
- Extension and TUI config should stay in sync where they share settings (language, compile commands, templates).
- Comments only when the logic isn't obvious from the code.

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) as the project.
