<h1 align="center">CPOS</h1>

<p align="center"><b>Competitive Programming Operating System</b></p>

<p align="center">
Open a problem in your browser. CPOS creates the file, loads the samples, and lets you run and submit — without copy-pasting anything.
</p>

<p align="center">
  <a href="https://cpos.sohamaggarwal.com"><img alt="Website" src="https://img.shields.io/badge/website-cpos-8b5cf6"></a>
  <a href="https://youtu.be/5HTatBfpK5A"><img alt="Demo" src="https://img.shields.io/badge/demo-YouTube-red?logo=youtube&logoColor=white"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode"><img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode&logoColor=white"></a>
  <a href="https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm"><img alt="Chrome" src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white"></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="rust" src="https://img.shields.io/badge/built%20with-Rust-orange.svg">
</p>

## Demo

<p align="center">
  <a href="https://youtu.be/5HTatBfpK5A">
    <img src="https://img.shields.io/badge/▶_Full_walkthrough-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch the CPOS full demo on YouTube">
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/5HTatBfpK5A">
    <img src="https://img.youtube.com/vi/5HTatBfpK5A/maxresdefault.jpg" alt="Click to play the CPOS demo on YouTube" width="820">
  </a>
</p>

<p align="center"><sub>Capture a problem · auto-create your file · run samples · submit from VS Code</sub></p>

---

## How it works

CPOS has three parts — a **browser companion**, a **terminal app**, and a **VS Code extension**. Install all three; they share the same files and stay in sync over localhost.

**The flow:**

1. **Pick your folder** — open any folder in VS Code, or let the terminal app use `~/cpos`.
2. **Open a problem in your browser** — any Codeforces or CSES problem page.
3. **CPOS captures it** — the browser companion reads samples and sends them to CPOS on your machine.
4. **A file appears** — e.g. `1971D.cpp`, with sample tests attached.
5. **Write your solution** — in VS Code.
6. **Run samples** — from the panel or with `T` in the terminal.
7. **Submit** — CPOS autofills the judge form in your browser (log in to Codeforces/CSES first).

No copying samples. No manually creating files.

---

## VS Code

Write code in the editor. The CPOS panel runs samples and submits.

<p align="center">
  <img src="docs/img/vscode-panel-ui.png" alt="CPOS VS Code panel with test cases, Run All, Submit, and a Codeforces solution open" width="900">
</p>

Install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode). Open your folder, capture a problem from the browser, then use the **CPOS panel**:

- **Run All** — compile and test every sample
- **Submit** — autofill the judge submit page in your logged-in browser
- **Problem** — open the statement again
- **Search** — Google search for editorials and solutions for the linked problem
- **GitHub** — open the CPOS repository
- **Test cases** — edit samples; multi-case inputs show linked input/output blocks when captured from Codeforces
- **Theme** — five panel themes (see [Settings](#settings))

---

## Terminal

Browse the catalog, sync rating, track contests, and get recommendations — without opening Codeforces in a tab.

```bash
cargo install --git https://github.com/Soham109/cpos
cpos
```

| Key | What it does |
| --- | --- |
| `o` / `Enter` | Open a problem — creates the file in your project folder when VS Code has synced a path, otherwise in `~/cpos` or your configured workspace |
| `T` | Run against samples |
| `s` | Submit |
| `b` | Open problem in browser |
| `U` | Open by URL |
| `/` · `f` · `p` | Search · filter by rating · switch platform |
| `Tab` | Switch between Dashboard, Problems, Contests, Analytics, Recommend |
| `r` | Sync with Codeforces and CSES |

Keep the terminal running while you code in VS Code — same captures, same submits, same progress.

---

## Your folder, your files

You choose where solution files live:

- **VS Code:** open a project folder before you capture. CPOS creates files such as `1982C.cpp` in that folder.
- **Terminal:** defaults to `~/cpos/`, or uses the same project folder as VS Code when captures have been synced.

Configure the VS Code save location under **Settings → Extensions → CPOS** (`cpos.saveLocation`, `cpos.fixedDir`). Configure the terminal workspace in `config.toml` (`workspace_dir`).

---

## Install

| What | Where |
| --- | --- |
| Browser companion | [Chrome Web Store](https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm) (Chrome, Edge, Brave) |
| VS Code extension | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode) |
| Terminal app | `cargo install --git https://github.com/Soham109/cpos` |

Install all three for the full experience. The browser companion is required for capture and submit.

## Updating

The terminal app does **not** auto-update. Run:

```bash
cpos update
```

That pulls the latest version and reinstalls. Your config and problem data are kept.

**VS Code extension** — updates from the Marketplace automatically (or **Extensions → CPOS → Update**).

**Browser companion** — updates automatically from the Chrome Web Store.

<p align="center">
  <img src="docs/problems.png" alt="Problems" width="410">
  <img src="docs/analytics.png" alt="Analytics" width="410">
  <img src="docs/contests.png" alt="Contests" width="410">
  <img src="docs/recommend.png" alt="Recommendations" width="410">
</p>

---

## Features

- **Auto file creation** — open a problem, get a ready-to-edit solution file in your folder
- **Sample capture** — public tests pulled from the problem page, with multi-case grouping on Codeforces when available
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

**Panel themes** — use the theme control in the CPOS panel header. Your choice is remembered.

| Theme | Look |
| --- | --- |
| `CPOS` | Signature purple — the default |
| `Midnight` | Calm slate-blue |
| `Amber` | Warm terminal / sepia |
| `Paper` | High-contrast grayscale, minimal color |
| `Native` | Inherits your active VS Code color theme — Run All matches VS Code button styling |

**Terminal app** — `~/.config/cpos/config.toml` (Linux) or `~/Library/Application Support/cpos/config.toml` (macOS):

```toml
default_language = "cpp"
theme = "purple"   # purple | cyan | green | amber | mono | plain | light
editor = "code {file}"

[handles]
codeforces = "your_handle"
```

> `plain` is a neutral grayscale theme for a low-color terminal interface; `mono` is the single-accent minimal one; `light` is a bright canvas for light terminal / VS Code light-theme users.

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
