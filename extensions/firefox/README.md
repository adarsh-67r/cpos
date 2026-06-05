# CPOS Companion for Firefox

Firefox build of the CPOS browser companion for Codeforces and CSES. It mirrors the Chrome companion: capture public samples, sync CSES progress, and autofill judge submit pages through the local CPOS endpoints.

**Current version:** 0.0.1 (see [CHANGELOG.md](../../CHANGELOG.md)).

## Install for Development

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `extensions/firefox/manifest.json`.

Firefox 128 or newer is required because CPOS injects submit helpers into the page's main execution world.

## Package

```bash
./package-firefox.sh
```

This produces `cpos-companion.xpi` in this directory.
