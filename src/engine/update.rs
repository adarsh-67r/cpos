use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use reqwest::Client;

use crate::data::config::Config;

const REPO: &str = "https://github.com/Soham109/cpos";
const INSTALL_SH: &str = "https://raw.githubusercontent.com/Soham109/cpos/main/install.sh";
const RAW_CARGO_TOML: &str = "https://raw.githubusercontent.com/Soham109/cpos/main/Cargo.toml";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateCheck {
    pub updates: Vec<ComponentUpdate>,
}

impl UpdateCheck {
    pub fn is_empty(&self) -> bool {
        self.updates.is_empty()
    }

    pub fn terminal_update_available(&self) -> bool {
        self.updates.iter().any(|u| u.can_update_from_cli)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComponentUpdate {
    pub name: &'static str,
    pub current: String,
    pub latest: String,
    pub hint: &'static str,
    pub can_update_from_cli: bool,
}

pub fn startup_check_enabled(config: &Config) -> bool {
    if env_flag("CPOS_NO_UPDATE_CHECK") {
        return false;
    }
    if env_flag("CPOS_UPDATE_CHECK") {
        return true;
    }
    config.updates.check_on_startup && dev_tree_from_exe().is_none()
}

pub async fn check_latest() -> Result<UpdateCheck> {
    let client = Client::builder()
        .user_agent(format!("cpos/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_millis(700))
        .build()?;

    let cpos_override = std::env::var("CPOS_LATEST_CPOS_VERSION").ok();

    let fetch_cpos = cpos_override.is_none();
    let cargo = async {
        if fetch_cpos {
            fetch_text(&client, RAW_CARGO_TOML).await
        } else {
            None
        }
    };
    let cargo = cargo.await;

    let mut updates = Vec::new();
    if let Some(latest) = cpos_override.or_else(|| cargo.and_then(|text| cargo_version(&text))) {
        push_if_newer(
            &mut updates,
            "CPOS terminal app",
            env!("CARGO_PKG_VERSION"),
            &latest,
            "CPOS can update this now, or you can run `cpos update` later.",
            true,
        );
    }

    Ok(UpdateCheck { updates })
}

async fn fetch_text(client: &Client, url: &str) -> Option<String> {
    client.get(url).send().await.ok()?.text().await.ok()
}

fn push_if_newer(
    updates: &mut Vec<ComponentUpdate>,
    name: &'static str,
    current: &str,
    latest: &str,
    hint: &'static str,
    can_update_from_cli: bool,
) {
    if version_cmp(latest, current) == Ordering::Greater {
        updates.push(ComponentUpdate {
            name,
            current: current.to_string(),
            latest: latest.to_string(),
            hint,
            can_update_from_cli,
        });
    }
}

fn cargo_version(text: &str) -> Option<String> {
    let value: toml::Value = text.parse().ok()?;
    value
        .get("package")?
        .get("version")?
        .as_str()
        .map(ToString::to_string)
}

fn env_flag(name: &str) -> bool {
    std::env::var(name)
        .map(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on" | "always"
            )
        })
        .unwrap_or(false)
}

fn version_cmp(a: &str, b: &str) -> Ordering {
    let a_parts = version_parts(a);
    let b_parts = version_parts(b);
    let len = a_parts.len().max(b_parts.len());
    for i in 0..len {
        let av = a_parts.get(i).copied().unwrap_or(0);
        let bv = b_parts.get(i).copied().unwrap_or(0);
        match av.cmp(&bv) {
            Ordering::Equal => {}
            other => return other,
        }
    }
    Ordering::Equal
}

fn version_parts(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches('v')
        .split(|c: char| !(c.is_ascii_digit()))
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<u64>().ok())
        .collect()
}

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
        .any(|p| path_text(p).contains("/cellar/cpos/"))
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
    path.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
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

    #[test]
    fn compares_semver_like_versions() {
        assert_eq!(version_cmp("0.1.3", "0.1.2"), Ordering::Greater);
        assert_eq!(version_cmp("v0.3.21", "0.3.21"), Ordering::Equal);
        assert_eq!(version_cmp("0.6.12", "0.6.13"), Ordering::Less);
    }

    #[test]
    fn parses_cargo_manifest_version() {
        assert_eq!(
            cargo_version("[package]\nversion = \"1.2.3\"\n").as_deref(),
            Some("1.2.3")
        );
    }
}
