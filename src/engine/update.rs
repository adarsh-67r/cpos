use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{bail, Context, Result};

const REPO: &str = "https://github.com/Soham109/cpos";
const INSTALL_SH: &str = "https://raw.githubusercontent.com/Soham109/cpos/main/install.sh";

pub fn run() -> Result<()> {
    eprintln!("CPOS v{}", env!("CARGO_PKG_VERSION"));
    eprintln!("Updating terminal app…\n");

    match detect_method()? {
        UpdateMethod::Homebrew => homebrew_update()?,
        UpdateMethod::Scoop => scoop_update()?,
        UpdateMethod::StandaloneBinary(path) => binary_update(&path)?,
        UpdateMethod::Git => git_install()?,
        UpdateMethod::LocalPath(path) => path_install(&path)?,
        UpdateMethod::DevTree(path) => dev_build(&path)?,
    }

    eprintln!("\nDone. Run `cpos` to start.");
    eprintln!("VS Code extension and browser companion update via their stores.");
    Ok(())
}

enum UpdateMethod {
    Homebrew,
    Scoop,
    StandaloneBinary(PathBuf),
    Git,
    LocalPath(PathBuf),
    DevTree(PathBuf),
}

fn ensure_cargo() -> Result<()> {
    let ok = Command::new("cargo")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        return Ok(());
    }
    bail!(
        "Rust/cargo not found on PATH.\n\
         Install Rust from https://rustup.rs, then run `cpos update` again."
    );
}

fn detect_method() -> Result<UpdateMethod> {
    if installed_by_homebrew() {
        return Ok(UpdateMethod::Homebrew);
    }
    if installed_by_scoop() {
        return Ok(UpdateMethod::Scoop);
    }
    if let Some(path) = cargo_install_path() {
        return Ok(UpdateMethod::LocalPath(path));
    }
    if let Some(path) = dev_tree_from_exe() {
        return Ok(UpdateMethod::DevTree(path));
    }
    if installed_by_cargo_bin() {
        return Ok(UpdateMethod::Git);
    }
    if let Ok(exe) = std::env::current_exe() {
        return Ok(UpdateMethod::StandaloneBinary(exe));
    }
    Ok(UpdateMethod::Git)
}

fn installed_by_homebrew() -> bool {
    current_exe_paths()
        .iter()
        .any(|p| path_text(p).contains("/Cellar/cpos/"))
}

fn installed_by_scoop() -> bool {
    current_exe_paths()
        .iter()
        .any(|p| path_text(p).contains("/scoop/apps/cpos/"))
}

fn current_exe_paths() -> Vec<PathBuf> {
    let Ok(exe) = std::env::current_exe() else {
        return Vec::new();
    };
    let mut paths = vec![exe.clone()];
    if let Ok(real) = std::fs::canonicalize(&exe) {
        if real != exe {
            paths.push(real);
        }
    }
    paths
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").to_ascii_lowercase()
}

fn installed_by_cargo_bin() -> bool {
    let Some(home) = dirs::home_dir() else {
        return false;
    };
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    exe.parent()
        .map(|p| p == home.join(".cargo/bin"))
        .unwrap_or(false)
}

fn cargo_install_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let text = std::fs::read_to_string(home.join(".cargo/.crates2.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let packages = json.get("packages")?.as_object()?;

    let mut best: Option<PathBuf> = None;
    for key in packages.keys() {
        if let Some(path) = parse_path_from_crate_key(key) {
            if path.join("Cargo.toml").is_file() {
                best = Some(path);
            }
        }
    }
    best
}

fn parse_path_from_crate_key(key: &str) -> Option<PathBuf> {
    if !key.starts_with("cpos ") {
        return None;
    }
    let start = key.find("(path+file://")? + "(path+file://".len();
    let rest = &key[start..];
    let end = rest.find('#').unwrap_or(rest.len());
    let encoded = &rest[..end];
    Some(percent_decode_path(encoded))
}

fn percent_decode_path(encoded: &str) -> PathBuf {
    let mut out = String::new();
    let bytes = encoded.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&encoded[i + 1..i + 3], 16) {
                out.push(v as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    PathBuf::from(out)
}

fn dev_tree_from_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let lossy = exe.to_string_lossy();
    if !lossy.contains("/target/") && !lossy.contains("\\target\\") {
        return None;
    }
    let dir = exe.parent()?.parent()?.parent()?.to_path_buf();
    let manifest = dir.join("Cargo.toml");
    if !manifest.is_file() {
        return None;
    }
    let text = std::fs::read_to_string(manifest).ok()?;
    if text.contains("name = \"cpos\"") {
        Some(dir)
    } else {
        None
    }
}

fn git_install() -> Result<()> {
    ensure_cargo()?;
    run_cargo(&["install", "--git", REPO, "--force"])
        .context("failed to update from GitHub — check your network and try again")
}

fn path_install(root: &Path) -> Result<()> {
    ensure_cargo()?;
    eprintln!("Detected local install at {}", root.display());
    git_pull(root)?;
    run_cargo(&["install", "--path", &root.display().to_string(), "--force"])
        .context("failed to rebuild from local clone")
}

fn dev_build(root: &Path) -> Result<()> {
    ensure_cargo()?;
    eprintln!("Detected dev build in {}", root.display());
    git_pull(root)?;
    run_cargo(&["build", "--release"]).context("failed to rebuild dev binary")?;
    eprintln!("Built {}", root.join("target/release/cpos").display());
    Ok(())
}

fn git_pull(root: &Path) -> Result<()> {
    if !root.join(".git").is_dir() {
        return Ok(());
    }
    eprintln!("Pulling latest changes…");
    let status = Command::new("git")
        .args(["-C"])
        .arg(root)
        .args(["pull", "--ff-only"])
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("failed to run git pull")?;
    if !status.success() {
        bail!("git pull failed");
    }
    Ok(())
}

fn homebrew_update() -> Result<()> {
    eprintln!("Detected Homebrew install.");
    run_command("brew", &["update"]).context("failed to update Homebrew taps")?;
    run_command("brew", &["upgrade", "cpos"]).context("failed to upgrade CPOS with Homebrew")
}

fn scoop_update() -> Result<()> {
    eprintln!("Detected Scoop install.");
    run_command("scoop", &["update", "cpos"]).context("failed to update CPOS with Scoop")
}

fn binary_update(exe: &Path) -> Result<()> {
    if cfg!(windows) {
        bail!(
            "Standalone Windows binary updates cannot replace a running cpos.exe.\n\
             Recommended install:\n\
             scoop bucket add cpos https://github.com/Soham109/cpos\n\
             scoop install cpos\n\
             Then `cpos update` will use Scoop."
        );
    }

    let bin_dir = exe
        .parent()
        .map(|p| p.to_path_buf())
        .context("could not find current binary directory")?;
    eprintln!("Detected standalone binary at {}", exe.display());
    eprintln!("Installing latest release into {}", bin_dir.display());

    let cmd = format!(
        "curl -fsSL {INSTALL_SH} | CPOS_INSTALL_DIR=\"{}\" sh",
        bin_dir.display()
    );
    run_shell(&cmd).context("failed to update from GitHub Releases")
}

fn run_cargo(args: &[&str]) -> Result<()> {
    run_command("cargo", args)
}

fn run_command(program: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(program)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("failed to run {program}"))?;
    if !status.success() {
        bail!(
            "{} {} failed",
            program,
            args.first().copied().unwrap_or("command")
        );
    }
    Ok(())
}

fn run_shell(cmd: &str) -> Result<()> {
    let status = Command::new("sh")
        .arg("-c")
        .arg(cmd)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("failed to run shell")?;
    if !status.success() {
        bail!("update command failed");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_path_install_key() {
        let key = "cpos 0.1.0 (path+file:///Users/dev/cpos#0.1.0)";
        let path = parse_path_from_crate_key(key);
        assert_eq!(path, Some(PathBuf::from("/Users/dev/cpos")));
    }

    #[test]
    fn ignores_git_install_key() {
        let key = "cpos 0.1.0 (git+https://github.com/Soham109/cpos#abc123)";
        assert!(parse_path_from_crate_key(key).is_none());
    }

    #[test]
    fn normalizes_install_paths_for_detection() {
        let path = PathBuf::from(r"C:\Users\dev\scoop\apps\cpos\current\cpos.exe");
        assert!(path_text(&path).contains("/scoop/apps/cpos/"));
    }
}
