# CPOS Companion — Privacy Policy

**Last updated:** June 20, 2026
**Contact:** [github.com/Soham109/cpos/issues](https://github.com/Soham109/cpos/issues)

CPOS Companion is a browser extension for competitive programming. It works together with the [CPOS VS Code extension](https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode) and/or the CPOS desktop app on your computer.

## Summary

- **No accounts.** The extension does not create user accounts.
- **No analytics.** The extension does not use Google Analytics or any third-party tracking.
- **One remote relay for Compete.** Most extension data stays on your machine. To receive races by Codeforces handle, the companion polls a handle-derived topic on the free, no-account [ntfy.sh](https://ntfy.sh) relay. Creating/accepting races and public matching also use that relay. See [Compete delivery](#compete-delivery).
- **Local programming workflow.** Problem samples, editor run requests, templates, and queued submissions are sent only to `127.0.0.1` on your machine (ports `27121` and `27122`) when CPOS is running.
- **Local settings.** Preferences, editor drafts, timers, favorites, reminders, notes/highlights, challenges, and small public-data caches are stored only in Chrome's local extension storage.

## Data the extension accesses

When you open a supported problem page on **Codeforces** or **CSES**, the extension may read from that page:

- Problem identifier and title
- Public sample test inputs and expected outputs shown on the page
- Public statement text and math, so the local CPOS apps can show a Statement view
- Public Codeforces page structure needed for optional page tools, such as problem tags, standings rows, problemset rows, and profile content
- On CSES problem list pages: which tasks appear solved or attempted (read from the page DOM only)

When optional Codeforces tools are enabled, the extension may also request public Codeforces API endpoints, such as problemset, profile, submissions, ratings, standings, and contest-list data. These requests go to Codeforces, not to the developer.

When you use the in-browser editor, the extension may:

- Store your per-problem draft code locally in Chrome extension storage
- Send code and sample tests to the local CPOS runner on `127.0.0.1` when you click Run
- Queue code locally for the existing submit autofill flow when you click Submit

When you submit a solution from CPOS in VS Code or the CPOS app, the extension may:

- Receive your source code from the local CPOS app via localhost
- Fill the submit form on Codeforces or CSES in your already-logged-in browser tab
- Click Submit on your behalf (same as you would manually)

The extension **does not** read passwords, cookies, or browsing history outside the matched Codeforces/CSES pages.

## Where data goes

| Data | Destination |
|------|-------------|
| Captured samples & problem metadata | `http://127.0.0.1:27122` (CPOS VS Code) and/or `http://127.0.0.1:27121` (CPOS desktop app) |
| In-browser editor Run requests | `http://127.0.0.1:27122` and/or `http://127.0.0.1:27121` |
| Pending submission source code | From localhost CPOS → browser submit page only |
| Public Codeforces API lookups | Codeforces public API only |
| Compete invites, replies, and public matching | [ntfy.sh](https://ntfy.sh) public relay |
| Local preferences, drafts, timers, favorites, reminders, notes/highlights, challenges, and caches | Chrome local extension storage only |
| Anything else | **Nowhere** — not sent to the developer or a CPOS cloud service |

If CPOS is not running locally, captures fail gracefully and nothing is stored by the extension.

## Compete delivery

CPOS includes **Compete** — 1v1 problem races where Codeforces itself is the referee (the winner is determined from public Codeforces submissions, not by us).

Compete uses [ntfy.sh](https://ntfy.sh) — a free, open-source, no-account publish/subscribe service — to deliver races by handle, publish open races, discover public matches, and carry accept/decline replies. Codeforces' public submissions remain the referee.

After your Codeforces handle is detected or entered, the companion periodically reads its handle-derived ntfy.sh topic (e.g. `cpos-chal-v1-<handle>`) so direct race invitations can arrive. Creating or replying to a race publishes small messages to those topics; enabling public matching also reads the shared lobby topic. Messages contain only:

- The challenger's and opponent's Codeforces handles
- The problem identifier, title, URL, and rating
- A challenge id, creation time, and duration
- Whether the challenge was accepted or declined

No passwords, cookies, or source code are sent to ntfy.sh. **ntfy.sh topics are public** — anyone who knows or guesses a topic name could read or post to it — so Compete is intended for friendly use, not confidential data. ntfy.sh is operated by a third party under [its own privacy policy](https://ntfy.sh/docs/privacy/). No race message is published until you create or reply to a race.

## Local data storage

The extension uses `chrome.storage.local` for user-owned local state, including:

- Feature toggles, chosen theme, and custom accent color
- In-browser editor drafts, language/theme/font/wrap settings, and panel width
- Problem timer elapsed time, running state, and position
- Favorites, daily problem/streak state, contest reminder choices, and reminder lead time
- Problem tool preferences, including tag/rating reveal state and problem focus mode
- Marker highlights and notes, when the marker feature is enabled
- User-maintained standings friends list and profile-compare handles
- In-browser editor templates and pending offline template-sync state
- Short-lived caches of public Codeforces data, such as problem metadata, solved status, standings languages, contest list, and profile compare data

This data stays in Chrome's local extension storage on your device. It is not sent to the developer or any CPOS-operated server. You can remove it by clearing the extension's site/storage data or uninstalling the extension.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `scripting` | Autofill submit forms on Codeforces/CSES when you submit from CPOS |
| `tabs` | Find or open the correct browser tab for submission autofill |
| `alarms` | Wake the background worker for queued submissions, contest reminders, and current Compete invitations/results |
| `storage` | Save local-only settings, editor drafts, timers, favorites, reminders, notes/highlights, and public-data caches |
| `notifications` | Show optional local notifications — contest reminders and challenge results |
| `127.0.0.1:27121/27122` | Talk to CPOS running on your computer |
| `codeforces.com`, `cses.fi` | Read problem pages you visit and interact with submit pages |
| `ntfy.sh` | Used by Compete to relay race invites/replies and discover public races |

## Children

This extension is not directed at children under 13 and does not knowingly collect information from children.

## Changes

Material changes to this policy will be reflected in the extension repository. Continued use after an update constitutes acceptance of the revised policy.

## Open source

Source code: [github.com/Soham109/cpos/tree/main/extensions/chrome](https://github.com/Soham109/cpos/tree/main/extensions/chrome)
