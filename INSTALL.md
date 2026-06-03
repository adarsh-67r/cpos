# CPOS TUI install and release guide

This guide covers the terminal app only. The VS Code extension and browser companion still ship through their stores.

## Install the TUI

### macOS and Linux with Homebrew

```bash
brew tap Soham109/cpos https://github.com/Soham109/cpos
brew install cpos
cpos
```

After the tap is added once, updates are just:

```bash
cpos update
```

`cpos update` delegates to Homebrew for Homebrew installs.

### Windows with Scoop

```powershell
scoop bucket add cpos https://github.com/Soham109/cpos
scoop install cpos
cpos
```

After the bucket is added once, updates are just:

```powershell
cpos update
```

`cpos update` delegates to Scoop for Scoop installs.

## Installer fallback

Use these when Homebrew or Scoop is not available.

### macOS and Linux

```bash
curl -fsSL https://raw.githubusercontent.com/Soham109/cpos/main/install.sh | sh
cpos
```

The script downloads the latest prebuilt TUI binary from GitHub Releases and installs it to `~/.local/bin/cpos`.

If `cpos` is not found after install, add this to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/Soham109/cpos/main/install.ps1 | iex
cpos
```

The script downloads the latest Windows x64 binary from GitHub Releases, installs it under `%LOCALAPPDATA%\Programs\CPOS\bin`, and adds that folder to your user PATH.

Restart the terminal if `cpos` is not found immediately.

## Install a specific version

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Soham109/cpos/main/install.sh | CPOS_VERSION=0.1.1 sh
```

Windows PowerShell:

```powershell
$env:CPOS_VERSION = "0.1.1"
irm https://raw.githubusercontent.com/Soham109/cpos/main/install.ps1 | iex
```

## Update

For package-manager installs:

```bash
cpos update
```

For standalone installer installs, `cpos update` refreshes the Unix binary in place. On Windows, prefer Scoop so the updater can replace the binary cleanly.

Source installs can still use:

```bash
cpos update
```

## Manual download

Download the matching asset from the latest GitHub Release:

| OS | Asset |
| --- | --- |
| macOS Apple Silicon | `cpos-aarch64-apple-darwin.tar.gz` |
| macOS Intel | `cpos-x86_64-apple-darwin.tar.gz` |
| Linux x64 | `cpos-x86_64-unknown-linux-gnu.tar.gz` |
| Windows x64 | `cpos-x86_64-pc-windows-msvc.zip` |

Put `cpos` or `cpos.exe` somewhere on your PATH.

## Source install

Use this only if you want to build CPOS yourself:

```bash
cargo install --git https://github.com/Soham109/cpos
```

This requires Rust, Cargo, and the platform linker/toolchain. Most users should use the prebuilt installer instead.

## Publishing a TUI release

The repository includes `.github/workflows/release.yml`. It builds and uploads TUI binaries for macOS, Linux, and Windows whenever you push a tag that starts with `v`.

The release workflow also:

- uploads `SHA256SUMS`
- generates a Homebrew formula at `Formula/cpos.rb`
- generates a Scoop manifest at `bucket/cpos.json`
- commits those package-manager files back to `main`

Release flow:

1. Update `Cargo.toml` version.
2. Add a dated entry to `CHANGELOG.md`.
3. Commit the release changes.
4. Create and push a tag:

   ```bash
   git tag v0.1.1
   git push origin main
   git push origin v0.1.1
   ```

5. GitHub Actions builds the assets and publishes a GitHub Release.
6. GitHub Actions updates `Formula/cpos.rb` and `bucket/cpos.json` with the new version and hashes.
7. Homebrew/Scoop users can install or update with the commands above.

## Other package channels

GitHub Releases are the binary source of truth. Homebrew and Scoop are the user-friendly front doors.

Other useful channels later:

| Channel | Good for | Tradeoff |
| --- | --- | --- |
| Homebrew core | `brew install cpos` without a tap | Requires Homebrew acceptance/review |
| winget | `winget install CPOS` | Requires publishing manifests to microsoft/winget-pkgs |
| crates.io | `cargo install cpos` | Still requires Rust and a working linker |

This repo is ready for GitHub Releases, Homebrew tap installs, and Scoop bucket installs. Homebrew core and winget can come later once you want the extra review flow.
