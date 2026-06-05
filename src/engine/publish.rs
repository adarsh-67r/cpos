use std::collections::BTreeMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result, anyhow, bail};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::data::config::{Config, PublishConfig};
use crate::data::models::{Platform, Problem, Submission};
use crate::engine::ollama::{self, SolutionExplanation};
use crate::engine::workspace;

#[derive(Debug, Clone)]
pub struct PublishRequest {
    pub config: Config,
    pub problem: Problem,
    pub solution_path: PathBuf,
    pub language: String,
    pub submission: Option<Submission>,
}

#[derive(Debug, Clone)]
pub struct PublishOutcome {
    pub committed: bool,
    pub pushed: bool,
    pub repo_dir: PathBuf,
    pub site_url: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishedRecord {
    pub platform: Platform,
    pub id: String,
    pub name: String,
    pub url: String,
    pub rating: Option<u32>,
    pub tags: Vec<String>,
    pub language: String,
    pub solution_file: String,
    pub readme_file: String,
    pub slug: String,
    pub approach: String,
    pub time_complexity: String,
    pub space_complexity: String,
    pub notes: String,
    pub code_hash: String,
    pub accepted_at: Option<String>,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PublishedIndex {
    records: BTreeMap<String, PublishedRecord>,
}

pub fn repo_dir(config: &PublishConfig) -> PathBuf {
    workspace::expand_tilde(&config.repo_dir)
}

pub fn is_configured(config: &PublishConfig) -> bool {
    config.auto_publish
}

pub fn code_hash(code: &str) -> String {
    let mut hasher = Fnv64::default();
    code.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn published_state_path() -> PathBuf {
    Config::data_dir().join("published_solutions.json")
}

pub fn needs_publish(config: &Config, problem: &Problem, solution_path: &Path) -> bool {
    if !is_configured(&config.publish) || !solution_path.exists() {
        return false;
    }
    let Ok(code) = std::fs::read_to_string(solution_path) else {
        return false;
    };
    if code.trim().is_empty() {
        return false;
    }
    let hash = code_hash(&code);
    let index = load_index();
    match index.records.get(&record_key(problem)) {
        Some(record) => record.code_hash != hash || record.readme_file.is_empty(),
        None => true,
    }
}

pub fn setup_repository(config: &PublishConfig) -> Result<PublishOutcome> {
    let repo = repo_dir(config);
    std::fs::create_dir_all(&repo)?;
    let warnings = ensure_git_repo(&repo, config)?;
    Ok(PublishOutcome {
        committed: false,
        pushed: false,
        site_url: github_site_url(config, Some(&repo)),
        repo_dir: repo,
        warnings,
    })
}

pub fn setup_repository_interactive(config: &PublishConfig) -> Result<PublishOutcome> {
    let repo = repo_dir(config);
    std::fs::create_dir_all(&repo)?;
    let warnings = ensure_git_repo_interactive(&repo, config)?;
    Ok(PublishOutcome {
        committed: false,
        pushed: false,
        site_url: github_site_url(config, Some(&repo)),
        repo_dir: repo,
        warnings,
    })
}

pub fn connection_label(config: &PublishConfig) -> String {
    let repo = repo_dir(config);
    if remote_exists(&repo, &config.remote)
        || config
            .remote_url
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty())
    {
        "connected".to_string()
    } else {
        "not connected".to_string()
    }
}

pub fn repo_slug_label(config: &PublishConfig) -> String {
    let repo = repo_dir(config);
    resolved_github_slug(config, &repo)
        .map(|(owner, name)| format!("{owner}/{name}"))
        .unwrap_or_default()
}

pub fn archive_site_label(config: &PublishConfig) -> String {
    archive_site_url(config).unwrap_or_else(|| "press G to connect".to_string())
}

pub fn archive_site_url(config: &PublishConfig) -> Option<String> {
    github_site_url(config, Some(&repo_dir(config)))
}

pub async fn publish_solution(request: PublishRequest) -> Result<PublishOutcome> {
    if !is_configured(&request.config.publish) {
        bail!("GitHub publishing is not configured");
    }

    let publish_config = &request.config.publish;
    let repo = repo_dir(publish_config);
    std::fs::create_dir_all(&repo)?;
    let mut warnings = ensure_git_repo(&repo, publish_config)?;
    if let Err(e) = sync_github_remote_from_gh(&repo, publish_config) {
        warnings.push(format!("Could not refresh GitHub remote after rename: {e}"));
    }

    let code = std::fs::read_to_string(&request.solution_path)
        .with_context(|| format!("could not read {}", request.solution_path.display()))?;
    if code.trim().is_empty() {
        bail!("solution file is empty");
    }

    let explanation = if publish_config.ollama_enabled {
        match ollama::explain_solution(
            &publish_config.ollama_model,
            &request.problem,
            &request.language,
            &code,
        )
        .await
        {
            Ok(exp) => exp,
            Err(e) => {
                warnings.push(format!(
                    "Ollama unavailable ({e}) — README used a basic template instead"
                ));
                SolutionExplanation::fallback(&request.problem, &request.language)
            }
        }
    } else {
        SolutionExplanation::fallback(&request.problem, &request.language)
    };

    let record = write_problem_files(&repo, &request, &code, explanation)?;
    let mut index = load_index();
    index
        .records
        .insert(record_key(&request.problem), record.clone());
    save_index(&index)?;
    rebuild_root_readme(&repo, &index)?;
    rebuild_site(&repo, &index, publish_config)?;

    let committed = commit_changes(&repo, publish_config, &record)
        .map_err(|e| anyhow!("published files, but git commit failed: {e}"))?;
    let mut pushed = false;
    if committed {
        match push_changes(&repo, publish_config) {
            Ok(true) => pushed = true,
            Ok(false) => warnings
                .push("No GitHub remote configured yet; files are committed locally.".to_string()),
            Err(e) => warnings.push(format!("GitHub push skipped: {e}")),
        }
    }

    if pushed && publish_config.github_pages {
        if let Err(e) = enable_pages_best_effort(publish_config, &repo) {
            warnings.push(format!("GitHub Pages setup skipped: {e}"));
        }
    }

    let site_url = github_site_url(publish_config, Some(&repo));
    Ok(PublishOutcome {
        committed,
        pushed,
        repo_dir: repo,
        site_url,
        warnings,
    })
}

fn ensure_git_repo(repo: &Path, config: &PublishConfig) -> Result<Vec<String>> {
    let mut warnings = Vec::new();
    if !repo.join(".git").is_dir() {
        run_git(repo, &["init"])?;
        run_git(repo, &["checkout", "-B", &config.branch])?;
    }
    if let Some(remote_url) = config
        .remote_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        let remote_url = normalize_github_remote(remote_url);
        if remote_exists(repo, &config.remote) {
            run_git(repo, &["remote", "set-url", &config.remote, &remote_url])?;
        } else {
            run_git(repo, &["remote", "add", &config.remote, &remote_url])?;
        }
    } else if !remote_exists(repo, &config.remote) {
        if let Some(warning) = create_or_connect_github_repo(repo, config, false)? {
            warnings.push(warning);
        }
    }
    Ok(warnings)
}

fn ensure_git_repo_interactive(repo: &Path, config: &PublishConfig) -> Result<Vec<String>> {
    let mut warnings = Vec::new();
    if !repo.join(".git").is_dir() {
        run_git(repo, &["init"])?;
        run_git(repo, &["checkout", "-B", &config.branch])?;
    }
    if let Some(remote_url) = config
        .remote_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        let remote_url = normalize_github_remote(remote_url);
        if remote_exists(repo, &config.remote) {
            run_git(repo, &["remote", "set-url", &config.remote, &remote_url])?;
        } else {
            run_git(repo, &["remote", "add", &config.remote, &remote_url])?;
        }
        return Ok(warnings);
    }
    if remote_exists(repo, &config.remote) {
        return Ok(warnings);
    }

    if !command_ok("gh", &["--version"]) {
        warnings.push(
            "GitHub CLI is not installed. Install `gh`, run `gh auth login`, then press G again."
                .to_string(),
        );
        return Ok(warnings);
    }
    if !command_ok("gh", &["auth", "status"]) {
        eprintln!("CPOS will open GitHub authentication using GitHub CLI.");
        let status = Command::new("gh")
            .args([
                "auth",
                "login",
                "--web",
                "--git-protocol",
                "ssh",
                "--hostname",
                "github.com",
            ])
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .context("failed to run gh auth login")?;
        if !status.success() {
            warnings
                .push("GitHub authentication did not finish. Press G later to retry.".to_string());
            return Ok(warnings);
        }
    }

    if let Some(warning) = create_or_connect_github_repo(repo, config, true)? {
        warnings.push(warning);
    }
    Ok(warnings)
}

fn create_or_connect_github_repo(
    repo: &Path,
    config: &PublishConfig,
    inherit_stdio: bool,
) -> Result<Option<String>> {
    if !command_ok("gh", &["--version"]) {
        return Ok(Some(
            "GitHub is not connected yet. Install GitHub CLI and run `gh auth login`, or set GitHub Repo to owner/repo.".to_string(),
        ));
    }
    if !command_ok("gh", &["auth", "status"]) {
        return Ok(Some(
            "GitHub CLI is installed but not authenticated. Run `gh auth login`, then press G again.".to_string(),
        ));
    }

    let repo_name = repo
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("cpos-solutions");
    let mut cmd = Command::new("gh");
    cmd.args(["repo", "create", repo_name, "--public", "--source"])
        .arg(repo)
        .args([
            "--remote",
            &config.remote,
            "--description",
            "Accepted competitive programming solutions published by CPOS",
        ]);
    if inherit_stdio {
        cmd.stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
    } else {
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
    }
    let status = cmd.status().context("failed to run gh repo create")?;
    if status.success() {
        Ok(None)
    } else if let Some(url) = gh_repo_ssh_url(repo_name) {
        if remote_exists(repo, &config.remote) {
            run_git(repo, &["remote", "set-url", &config.remote, &url])?;
        } else {
            run_git(repo, &["remote", "add", &config.remote, &url])?;
        }
        Ok(None)
    } else {
        Ok(Some(
            "Could not create or find the GitHub repo. Create it on GitHub, then press G again."
                .to_string(),
        ))
    }
}

fn gh_repo_ssh_url(repo_name: &str) -> Option<String> {
    let output = Command::new("gh")
        .args([
            "repo", "view", repo_name, "--json", "sshUrl", "--jq", ".sshUrl",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!url.is_empty()).then_some(url)
}

fn command_ok(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn remote_exists(repo: &Path, remote: &str) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["remote", "get-url", remote])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn run_git(repo: &Path, args: &[&str]) -> Result<()> {
    let status = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .with_context(|| format!("failed to run git {}", args.join(" ")))?;
    if !status.success() {
        bail!("git {} failed", args.join(" "));
    }
    Ok(())
}

fn commit_changes(repo: &Path, config: &PublishConfig, record: &PublishedRecord) -> Result<bool> {
    run_git(
        repo,
        &["add", "README.md", "solutions", "docs", ".nojekyll"],
    )?;
    let changed = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["diff", "--cached", "--quiet"])
        .status()
        .map(|s| !s.success())
        .unwrap_or(true);
    if !changed {
        return Ok(false);
    }

    let subject = commit_subject(record);
    let body = format!(
        "Problem: {}\nLink: {}\n\nApproach:\n{}\n\nComplexity:\nTime: {}\nSpace: {}",
        record.name, record.url, record.approach, record.time_complexity, record.space_complexity
    );
    let status = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["commit", "-m", &subject, "-m", &body])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .context("failed to run git commit")?;
    if !status.success() {
        bail!("git commit failed");
    }

    if config.branch.trim().is_empty() {
        return Ok(true);
    }
    Ok(true)
}

fn push_changes(repo: &Path, config: &PublishConfig) -> Result<bool> {
    if !remote_exists(repo, &config.remote) {
        return Ok(false);
    }
    let status = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["push", "-u", &config.remote, &config.branch])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .context("failed to run git push")?;
    if !status.success() {
        bail!("git push failed");
    }
    Ok(true)
}

fn write_problem_files(
    repo: &Path,
    request: &PublishRequest,
    code: &str,
    explanation: SolutionExplanation,
) -> Result<PublishedRecord> {
    let slug = problem_slug(&request.problem);
    let ext = request
        .solution_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("txt");
    let platform = platform_slug(request.problem.platform);
    let dir = repo.join("solutions").join(platform).join(&slug);
    std::fs::create_dir_all(&dir)?;
    let solution_name = format!("solution.{ext}");
    std::fs::write(dir.join(&solution_name), code)?;

    let accepted_at = request
        .submission
        .as_ref()
        .map(|s| s.submitted_at.to_rfc3339());
    let published_at = Utc::now().to_rfc3339();
    let record = PublishedRecord {
        platform: request.problem.platform,
        id: request.problem.id.clone(),
        name: request.problem.name.clone(),
        url: request.problem.url.clone(),
        rating: request.problem.rating,
        tags: request.problem.tags.clone(),
        language: request.language.clone(),
        solution_file: format!("solutions/{platform}/{slug}/{solution_name}"),
        readme_file: format!("solutions/{platform}/{slug}/README.md"),
        slug,
        approach: explanation.approach,
        time_complexity: explanation.time_complexity,
        space_complexity: explanation.space_complexity,
        notes: explanation.notes,
        code_hash: code_hash(code),
        accepted_at,
        published_at,
    };

    std::fs::write(dir.join("README.md"), problem_readme(&record))?;
    std::fs::write(
        dir.join("cpos.json"),
        serde_json::to_string_pretty(&record)?,
    )?;
    Ok(record)
}

fn problem_readme(record: &PublishedRecord) -> String {
    let tags = if record.tags.is_empty() {
        "none".to_string()
    } else {
        record.tags.join(", ")
    };
    format!(
        "# {} {} - {}\n\n\
         **Problem:** [{}]({})\n\n\
         **Language:** {}\n\n\
         **Rating:** {}\n\n\
         **Tags:** {}\n\n\
         ## Approach\n\n{}\n\n\
         ## Complexity\n\n\
         - Time: {}\n\
         - Space: {}\n\n\
         ## Notes\n\n{}\n\n\
         ## Solution\n\nSee [`{}`]({}).\n",
        record.platform,
        record.id,
        record.name,
        record.name,
        record.url,
        record.language,
        record
            .rating
            .map(|r| r.to_string())
            .unwrap_or_else(|| "unrated".to_string()),
        tags,
        record.approach,
        record.time_complexity,
        record.space_complexity,
        if record.notes.trim().is_empty() {
            "No extra notes.".to_string()
        } else {
            record.notes.clone()
        },
        record
            .solution_file
            .rsplit('/')
            .next()
            .unwrap_or("solution"),
        record
            .solution_file
            .rsplit('/')
            .next()
            .unwrap_or("solution"),
    )
}

fn rebuild_root_readme(repo: &Path, index: &PublishedIndex) -> Result<()> {
    let total = index.records.len();
    let mut by_platform: BTreeMap<String, usize> = BTreeMap::new();
    for record in index.records.values() {
        *by_platform.entry(record.platform.to_string()).or_default() += 1;
    }
    let mut lines = vec![
        "# Competitive Programming Solutions".to_string(),
        String::new(),
        "Accepted solutions published by CPOS.".to_string(),
        String::new(),
        format!("Total accepted solutions: **{total}**"),
        String::new(),
        "## Platforms".to_string(),
        String::new(),
    ];
    for (platform, count) in by_platform {
        lines.push(format!("- {platform}: {count}"));
    }
    lines.extend([String::new(), "## Solutions".to_string(), String::new()]);
    for record in index.records.values() {
        lines.push(format!(
            "- [{} {} - {}]({}) - [{}]({})",
            record.platform, record.id, record.name, record.readme_file, "problem", record.url
        ));
    }
    lines.extend([
        String::new(),
        "## Website".to_string(),
        String::new(),
        "The static site lives in `docs/`. In GitHub, enable Pages from the `main` branch and `/docs` folder.".to_string(),
        String::new(),
    ]);
    std::fs::write(repo.join("README.md"), lines.join("\n"))?;
    Ok(())
}

fn rebuild_site(repo: &Path, index: &PublishedIndex, config: &PublishConfig) -> Result<()> {
    let docs = repo.join("docs");
    std::fs::create_dir_all(&docs)?;
    std::fs::write(repo.join(".nojekyll"), "")?;
    let mut records: Vec<&PublishedRecord> = index.records.values().collect();
    records.sort_by(|a, b| b.published_at.cmp(&a.published_at));
    std::fs::write(
        docs.join("data.json"),
        serde_json::to_string_pretty(&records)?,
    )?;

    let github = resolved_github_slug(config, repo).map(|(owner, name)| format!("{owner}/{name}"));

    let meta = serde_json::json!({
        "github": github,
        "branch": config.branch,
    });
    std::fs::write(docs.join("meta.json"), serde_json::to_string_pretty(&meta)?)?;

    std::fs::write(docs.join("style.css"), site_css())?;
    std::fs::write(docs.join("index.html"), site_html())?;
    Ok(())
}

const SITE_HTML: &str = include_str!("../../assets/publish-site/index.html");
const SITE_CSS: &str = include_str!("../../assets/publish-site/style.css");

fn site_html() -> String {
    SITE_HTML.to_string()
}

fn site_css() -> String {
    SITE_CSS.to_string()
}

fn load_index() -> PublishedIndex {
    std::fs::read_to_string(published_state_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_index(index: &PublishedIndex) -> Result<()> {
    std::fs::create_dir_all(Config::data_dir())?;
    std::fs::write(published_state_path(), serde_json::to_string_pretty(index)?)?;
    Ok(())
}

fn record_key(problem: &Problem) -> String {
    format!("{}:{}", platform_slug(problem.platform), problem.id)
}

fn commit_subject(record: &PublishedRecord) -> String {
    let subject = format!("Solve {} {} - {}", record.platform, record.id, record.name);
    if subject.chars().count() <= 72 {
        subject
    } else {
        format!("Solve {} {}", record.platform, record.id)
    }
}

pub fn problem_slug(problem: &Problem) -> String {
    let mut base = format!("{}-{}", problem.id, problem.name);
    base.make_ascii_lowercase();
    let mut out = String::new();
    let mut last_dash = false;
    for c in base.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn platform_slug(platform: Platform) -> &'static str {
    match platform {
        Platform::Codeforces => "codeforces",
        Platform::Cses => "cses",
        Platform::AtCoder => "atcoder",
    }
}

fn github_site_url(config: &PublishConfig, repo_dir: Option<&Path>) -> Option<String> {
    let repo = repo_dir?;
    let (owner, name) = resolved_github_slug(config, repo)?;
    Some(format!("https://{owner}.github.io/{name}/"))
}

/// Canonical GitHub owner/repo for display, Pages URLs, and archive links.
/// Prefers `gh repo view` (survives renames), then local git remote, then saved config.
fn resolved_github_slug(config: &PublishConfig, repo: &Path) -> Option<(String, String)> {
    gh_repo_slug(repo)
        .or_else(|| {
            git_remote_url(repo, &config.remote).and_then(|remote| parse_github_remote(&remote))
        })
        .or_else(|| {
            config
                .remote_url
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .and_then(|remote| parse_github_remote(&normalize_github_remote(remote)))
        })
}

fn gh_repo_slug(repo: &Path) -> Option<(String, String)> {
    if !repo.join(".git").is_dir() {
        return None;
    }
    let output = Command::new("gh")
        .current_dir(repo)
        .args(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let slug = String::from_utf8_lossy(&output.stdout).trim().to_string();
    parse_github_remote(&slug)
}

fn sync_github_remote_from_gh(repo: &Path, config: &PublishConfig) -> Result<()> {
    let Some((owner, name)) = gh_repo_slug(repo) else {
        return Ok(());
    };
    let url = format!("git@github.com:{owner}/{name}.git");
    if remote_exists(repo, &config.remote) {
        let current = git_remote_url(repo, &config.remote).unwrap_or_default();
        if parse_github_remote(&current) != Some((owner.clone(), name.clone())) {
            run_git(repo, &["remote", "set-url", &config.remote, &url])?;
        }
    }
    Ok(())
}

fn parse_github_remote(remote: &str) -> Option<(String, String)> {
    let remote = remote.trim().trim_end_matches(".git");
    let path = if let Some(rest) = remote.strip_prefix("git@github.com:") {
        rest
    } else if let Some(rest) = remote.strip_prefix("https://github.com/") {
        rest
    } else if remote.matches('/').count() == 1 && !remote.contains(':') {
        remote
    } else {
        return None;
    };
    let mut parts = path.split('/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.to_string();
    if owner.is_empty() || repo.is_empty() {
        None
    } else {
        Some((owner, repo))
    }
}

fn normalize_github_remote(remote: &str) -> String {
    let trimmed = remote.trim();
    if let Some((owner, repo)) = parse_github_remote(trimmed) {
        if trimmed.matches('/').count() == 1 && !trimmed.contains(':') {
            return format!("git@github.com:{owner}/{repo}.git");
        }
    }
    trimmed.to_string()
}

fn git_remote_url(repo: &Path, remote: &str) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["remote", "get-url", remote])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!url.is_empty()).then_some(url)
}

fn enable_pages_best_effort(config: &PublishConfig, repo_dir: &Path) -> Result<()> {
    let Some((owner, repo)) = resolved_github_slug(config, repo_dir) else {
        return Ok(());
    };
    let gh_ok = Command::new("gh")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !gh_ok {
        bail!("install and authenticate GitHub CLI (`gh auth login`) to auto-enable Pages");
    }
    let repo_arg = format!("repos/{owner}/{repo}/pages");
    let source_branch = format!("source[branch]={}", config.branch);
    let status = Command::new("gh")
        .args([
            "api",
            &repo_arg,
            "-X",
            "POST",
            "-f",
            &source_branch,
            "-f",
            "source[path]=/docs",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .context("failed to run gh api")?;
    if !status.success() {
        bail!("Pages may already be enabled, or GitHub CLI is not authenticated");
    }
    Ok(())
}

#[derive(Default)]
struct Fnv64(u64);

impl Hasher for Fnv64 {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        if self.0 == 0 {
            self.0 = 0xcbf29ce484222325;
        }
        for b in bytes {
            self.0 ^= u64::from(*b);
            self.0 = self.0.wrapping_mul(0x100000001b3);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_github_remotes() {
        assert_eq!(
            parse_github_remote("git@github.com:me/cp.git"),
            Some(("me".to_string(), "cp".to_string()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/me/cp"),
            Some(("me".to_string(), "cp".to_string()))
        );
        assert_eq!(
            parse_github_remote("me/cp"),
            Some(("me".to_string(), "cp".to_string()))
        );
        assert_eq!(normalize_github_remote("me/cp"), "git@github.com:me/cp.git");
    }

    #[test]
    fn slugs_problem_names() {
        let p = Problem {
            platform: Platform::Codeforces,
            id: "1A".to_string(),
            name: "Theatre Square".to_string(),
            url: String::new(),
            rating: Some(800),
            tags: vec![],
            category: None,
            solved_count: None,
            status: crate::data::models::SolveStatus::Solved,
        };
        assert_eq!(problem_slug(&p), "1a-theatre-square");
    }
}
