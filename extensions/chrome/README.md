# CPOS Companion

Browser extension for Codeforces and CSES. Captures sample tests and relays them to CPOS on your machine.

## Install

**[Chrome Web Store](https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm)** — works in Chrome, Edge, and Brave.

Also install the **[CPOS VS Code extension](https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode)** from the Marketplace (and/or the [CPOS terminal app](https://github.com/Soham109/cpos)).

## What it does

- Captures public samples when you open a Codeforces or CSES problem
- Sends data only to `127.0.0.1:27122` (VS Code) or `127.0.0.1:27121` (TUI)
- Autofills submit pages when you submit from CPOS

## Contributors

Local development and store packaging: see [CONTRIBUTING.md](../../CONTRIBUTING.md) and [`STORE_LISTING.md`](STORE_LISTING.md).

```bash
./package-store.sh   # build cpos-companion.zip for the Web Store
```
