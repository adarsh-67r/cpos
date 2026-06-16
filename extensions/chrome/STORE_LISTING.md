# Chrome Web Store listing — copy & paste

Use this when uploading `cpos-companion.zip` at  
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## Build the zip

```bash
cd extensions/chrome
./package-store.sh
```

Upload **`cpos-companion.zip`** (root must contain `manifest.json`).

---

## Store fields

| Field | Value |
|-------|-------|
| **Category** | Developer Tools |
| **Language** | English |
| **Privacy policy URL** | `https://github.com/Soham109/cpos/blob/main/extensions/chrome/PRIVACY.md` |
| **Official URL** (optional) | `https://github.com/Soham109/cpos` |
| **Support URL** (optional) | `https://github.com/Soham109/cpos/issues` |

### Title
```
CPOS Companion
```

### Summary (132 chars max)
```
A Codeforces & CSES companion: capture samples to CPOS, an in-browser editor, profile analytics, themes, and practice tools. Local-first.
```

### Description
```
CPOS Companion is a local-first companion for Codeforces and CSES. It connects your browser to CPOS (the VS Code extension and terminal app) and layers optional practice and on-page tooling over the judge sites. No accounts, no servers — everything runs on your machine. Every feature toggles individually from the popup.

CAPTURE & SUBMIT
• Open a Codeforces or CSES problem and it captures the public sample tests for CPOS on your machine
• Submit from CPOS (VS Code or terminal) and it autofills the submit page in your logged-in tab, picking the newest matching compiler
• Optionally syncs CSES solved/attempted status when you choose to sync

ON THE PROBLEM PAGE
• In-browser editor — a LeetCode-style editor: run against the samples with a per-test diff and custom stdin, then submit in place (running compiles on the local CPOS runner; editing works on its own)
• Code & LaTeX styling for statements, editorials and comments
• Problem tools — rating badge, tag-hider/training mode, one-click sample copy, similar problems, and a per-problem timer

PRACTICE & ANALYTICS
• Profile analytics — activity heatmap, streaks, solved-by-rating/index, tags, verdict and language charts (public CF API, read-only)
• Profile compare (VS) — stack handles side by side with a rating-history overlay
• Daily problem & streak, favorites, problemset solve-status, standings tools, and rating predictions
• Contest reminders before upcoming Codeforces rounds

APPEARANCE
• Modernize — a sleek font, calmer spacing and cards for Codeforces & CSES
• One theme palette shared across the popup, the site and every CPOS tool

PRIVACY
• No analytics, no accounts, no cloud servers
• Local communication is to 127.0.0.1 only; the rest is the public Codeforces API and the sites you already use
• See the privacy policy in the repository for full details

Open source: https://github.com/Soham109/cpos
```

### Single purpose
```
A companion for the competitive-programming judges Codeforces and CSES: it captures problem samples to the local CPOS editor and enhances those two sites in place with practice, analytics and editing tools. Every feature operates only on Codeforces, CSES, and the local CPOS endpoint.
```

---

## Permission justifications (Privacy practices tab)

### Host permission: `http://127.0.0.1:27121/*` and `http://127.0.0.1:27122/*`
```
CPOS runs locally on the user's machine. The extension sends captured problem samples and receives pending submissions only via localhost HTTP. No data is sent to external servers.
```

### Host permission: `https://codeforces.com/*`
```
Reads public problem and sample data from Codeforces pages the user opens, and autofills the submit form when the user submits from CPOS while logged into Codeforces in this browser. The optional on-page tools (profile analytics, profile compare, rating predictions, problemset/standings helpers) read only public Codeforces pages and the public Codeforces API; they add charts and styling in place and send nothing to external servers.
```

### Host permission: `https://cses.fi/*`
```
Reads public problem and sample data from CSES pages the user opens, syncs task progress from the problem list when requested, and autofills the submit form when the user submits from CPOS.
```

### Permission: `scripting`
```
Injects autofill logic only on Codeforces and CSES submit pages when CPOS queues a submission from the local editor. Required because submit pages use dynamic editors that cannot be filled from an ordinary content script alone.
```

### Permission: `tabs`
```
Finds an existing Codeforces/CSES tab or opens one when the user submits from CPOS, so the submit form can be autofilled in the correct logged-in session.
```

### Permission: `alarms`
```
Chrome may suspend the extension's background worker when idle. CPOS uses a local alarm every 30 seconds solely to wake that worker and check whether the user queued a submission from CPOS (VS Code or desktop app) on localhost. The alarm does not read browsing data, does not contact external servers, and does not run unless the extension is installed.
```

### Permission: `storage`
```
Stores the user's own settings locally in chrome.storage.local: which features are toggled on, the chosen theme/palette, favorites, problem-timer state, daily-problem streak, and contest-reminder preferences. This data never leaves the device and is not transmitted anywhere.
```

### Permission: `notifications`
```
Used only by the optional Contest reminders feature (off until the user enables it). Shows a local desktop notification before upcoming Codeforces contests, using the contest schedule from the public Codeforces contest.list API. No notification content is sent off-device.
```

---

## Data usage certification

When asked whether you collect or use user data:

- **No**, the extension does not sell or transfer user data to third parties for unrelated purposes.
- **No** remote collection — data stays on the user's device (localhost CPOS only).
- Check **No personal data collected** / equivalent if the form allows, or disclose only: *problem metadata and source code transmitted locally to CPOS on 127.0.0.1 when the user uses the extension*.

---

## Screenshots

Chrome requires at least one screenshot (1280×800 or 640×400). Five ready-to-upload
slides live in [`store/`](store/) (1280×800, not included in the zip):

1. **`screenshot-1.png`** — One hub: the popup with every feature toggle
2. **`screenshot-2.png`** — In-browser editor: code and submit on the problem page
3. **`screenshot-3.png`** — Profile analytics: heatmap, streaks, tags, verdicts
4. **`screenshot-4.png`** — Profile compare (VS): handles side by side with a rating overlay
5. **`screenshot-5.png`** — Modernize: a cleaner Codeforces with solve-status coloring

Regenerate them from the raw product screenshots with
`python tools/make_companion_slides.py` (also writes the website gallery in
`docs/shots/`). The same five files are mirrored in `extensions/firefox/store/`.

---

## One-time fee

Chrome Web Store developer registration: **$5 one-time** at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
