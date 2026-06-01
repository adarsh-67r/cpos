<h1 align="center">CPOS</h1>

<p align="center"><b>Competitive Programming Operating System</b></p>

<p align="center">
Open a problem in your browser. CPOS creates the file, loads the samples, and lets you run and submit — without copy-pasting anything.
</p>

<p align="center">
  <i>Terminal to browse & plan · VS Code to code · Browser to capture & submit — one ecosystem, synced over localhost.</i>
</p>

<p align="center">
  <a href="https://cpos.sohamaggarwal.com"><img alt="Website" src="https://img.shields.io/badge/website-cpos-8b5cf6"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode"><img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode&logoColor=white"></a>
  <a href="https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm"><img alt="Chrome" src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white"></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="rust" src="https://img.shields.io/badge/built%20with-Rust-orange.svg">
</p>

---

## The ecosystem

CPOS is **three pieces that plug into each other** — not three separate tools you choose between.

| Piece | What it does |
| --- | --- |
| **[Browser companion](https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm)** | Reads samples from Codeforces/CSES pages, autofills submit |
| **[Terminal app](#terminal--command-center)** | Browse the catalog, sync rating, contests, recommendations, analytics |
| **[VS Code extension](#vs-code--code--tests)** | Write solutions, run samples, submit from a side panel |

Install all three. They share the same files and stay in sync over `127.0.0.1` — no cloud, no account.

**A typical session:**

1. **`r`** in the terminal — sync your solves and rating from Codeforces/CSES
2. Pick a problem from **Recommend** or search the catalog — without opening Codeforces in a tab
3. **`o`** to open it — CPOS creates `1971D.cpp`, loads samples, opens your editor
4. Or open the statement in your browser — the companion captures samples the same way
5. Code in **VS Code**, run samples with **Run All** or **`T`**
6. **Submit** from the panel or **`s`** in the terminal — the browser companion fills the judge form

No copy-pasting samples. No manually creating files. No re-entering problem metadata.

<p align="center">
  <img src="docs/dashboard.png" alt="CPOS terminal dashboard — rating, streak, recommendations, and progress" width="820">
</p>

---

## Terminal — command center

The terminal is the **hub** of CPOS: where you browse problems, track progress, and decide what to grind next — without leaving the keyboard.

<p align="center">
  <img src="docs/dashboard.png" alt="CPOS terminal dashboard — rating, streak, recommendations, and progress" width="820">
</p>

```bash
cargo install --git https://github.com/Soham109/cpos
cpos
```

| Key | What it does |
| --- | --- |
| `o` / `Enter` | Open a problem — creates the file, loads samples, opens your editor |
| `T` | Run against samples |
| `s` | Submit |
| `b` | Open problem in browser |
| `U` | Open by URL |
| `/` · `f` · `p` | Search · filter by rating · switch platform |
| `Tab` | Switch between Dashboard, Problems, Contests, Analytics, Recommend |
| `r` | Sync with Codeforces and CSES |

Dashboard, problem browser, contests, analytics, and recommendations all live here. Keep it running alongside VS Code — captures and submits work through either one.

<p align="center">
  <img src="docs/problems.png" alt="CPOS problem browser" width="410">
  <img src="docs/analytics.png" alt="CPOS analytics" width="410">
  <img src="docs/contests.png" alt="CPOS contests" width="410">
  <img src="docs/recommend.png" alt="CPOS recommendations" width="410">
</p>

---

## VS Code — code & tests

Write in the editor you already use. The CPOS panel handles samples, compile/run, and submit — synced with the terminal in the background.

<p align="center">
  <img src="docs/img/vscode-panel-ui.png" alt="CPOS VS Code panel with test cases, Run All, Submit, and a Codeforces solution open" width="900">
</p>

<p align="center"><sub>Panel layout inspired by <a href="https://marketplace.visualstudio.com/items?itemName=DivyanshuRaj.competitive-programming-helper">CPH</a> (Competitive Programming Helper).</sub></p>

Install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode). Open the folder you want files in, capture a problem from the browser, then use the **CPOS panel**:

- **Run All** — compile and test every sample
- **Submit** — autofill the judge submit page
- **Problem** — jump back to the statement
- **◑ theme** — switch the panel look (5 themes, see [Settings](#settings))

---

## Your folder, your files

You choose where files go:

- **VS Code:** open any project folder before you capture. CPOS creates `1971D.cpp` (or whatever the problem is) right inside it. No forced workspace, no extra setup.
- **Terminal app:** defaults to `~/cpos/`, or point it at any directory you like.

Change the save location anytime in **Settings → Extensions → CPOS** (`cpos.saveLocation`, `cpos.fixedDir`).

---

## Install

Install the full stack — all three pieces are meant to run together.

| What | Where |
| --- | --- |
| Terminal app | `cargo install --git https://github.com/Soham109/cpos` then run `cpos` |
| Browser companion | [Chrome Web Store](https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm) (Chrome, Edge, Brave) |
| VS Code extension | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode) |

The browser companion is required for capture and submit. The terminal and VS Code extension sync with each other automatically when both are running.

## Updating

The terminal app does **not** auto-update. Run:

```bash
cpos update
```

That pulls the latest version and reinstalls — whether you originally used `cargo install --git` or installed from a local clone. Your config and problem data are kept.

**VS Code extension** — updates automatically from the Marketplace if **Extensions: Auto Update** is on. Otherwise open **Extensions → CPOS → Update**.

**Browser companion** — updates automatically from the Chrome Web Store.

---

## Features

- **Auto file creation** — open a problem, get a ready-to-edit solution file in your folder
- **Sample capture** — public tests pulled from the problem page automatically
- **Run & submit** — from the VS Code panel or terminal keys; submit autofills your browser
- **13 languages** — C, C++, Python, PyPy, Java, Kotlin, Rust, Go, C#, JS, Ruby, Haskell, Pascal
- **Progress & analytics** — rating history, topic breakdown, activity heatmap
- **Recommendations** — up to 30 personalized problems aimed at your weak topics (see below)
- **Contests** — upcoming and running Codeforces contests with countdowns
- **Private** — everything stays on your machine (`127.0.0.1`, no external servers)

---

## Recommendations

After you sync (`r` in the terminal), CPOS builds a list of **30 unsolved problems** to practice next. Find them on the **Recommend** tab or the **Recommended Next** panel on the Dashboard.

### How problems are picked

CPOS only considers **unsolved** problems with a Codeforces rating in a band around your level (roughly −250 to +350 from your current rating, targeting about +100 above you).

Each candidate gets a score from:

| Signal | What it means |
| --- | --- |
| **Weak topics** | Tags where your solve rate is low get the most weight — a topic you fail 100% of the time counts more than one you're half-comfortable with |
| **Multiple weak tags** | Problems that combine several weak areas get a small bonus |
| **Unfinished attempts** | Problems you tried but didn't solve are boosted so you can finish what you started |
| **Rating fit** | Problems near your target practice rating score higher |
| **Popularity** | Well-known problems (many solves on Codeforces) are preferred — they're usually better written |

The top scorers are then **diversified**: CPOS caps how many problems share the same primary tag or exact rating so the list isn't fifteen identical DP problems.

### Cold start (no solves yet)

If you haven't accepted anything yet, CPOS can't infer weak topics. It falls back to **popular problems around 1200**, spread across tags and ratings, until your submission history fills in.

Press **`r`** after solving more problems to refresh recommendations.

---

## Settings

**VS Code** — `Settings → Extensions → CPOS`:

| Setting | Default | What it does |
| --- | --- | --- |
| `cpos.saveLocation` | `workspaceFolder` | Save files in your open folder |
| `cpos.fixedDir` | `~/cpos` | Folder when save location is `fixed` |
| `cpos.defaultLanguage` | `cpp` | Language for new files |
| `cpos.runTimeoutMs` | `5000` | Per-test timeout |

**Panel themes** — click **◑ theme** in the CPOS panel header to switch the look. Your choice is remembered.

| Theme | Look |
| --- | --- |
| `CPOS` | Signature purple — the default |
| `Midnight` | Calm slate-blue |
| `Amber` | Warm terminal / sepia |
| `Paper` | High-contrast grayscale, minimal color |
| `Native` | Inherits your active VS Code color theme — no custom background |

**Terminal app** — `~/.config/cpos/config.toml` (Linux) or `~/Library/Application Support/cpos/config.toml` (macOS):

```toml
default_language = "cpp"
theme = "purple"   # purple | cyan | green | amber | mono | plain
editor = "code {file}"

[handles]
codeforces = "your_handle"
```

> `plain` is a neutral grayscale theme for a low-color terminal interface; `mono` is the single-accent minimal one.

> **macOS C++:** run `brew install gcc` if you need `bits/stdc++.h` — CPOS auto-detects Homebrew's g++.

---

## Roadmap

- AtCoder & CodeChef support
- Contest mode with per-problem timers
- Read submission verdicts back into CPOS

---

## License

MIT — see [LICENSE](LICENSE).

---

## Open source

CPOS is fully open source. You're free to use it, fork it, and build on it.

Contributions are welcome and appreciated — whether that's a bug report, a doc fix, a new platform, or a polish pass on the TUI. Start with **[CONTRIBUTING.md](CONTRIBUTING.md)** for dev setup and PR guidelines.

| Doc | Purpose |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the components connect |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [SECURITY.md](SECURITY.md) | Report vulnerabilities |

Questions or ideas: [GitHub Issues](https://github.com/Soham109/cpos/issues).
