//! Local workspace management: where solution files live on disk, plus
//! scaffolding new solutions from a per-language template.
//!
//! The workspace stays clean — just one flat source file per problem:
//!
//! ```text
//! cpos/
//!   codeforces/
//!     1095F.cpp
//!     1A.cpp
//!   cses/
//!     1068.cpp
//!     WeirdAlgorithm.cpp
//!   templates/
//!     template.cpp
//! ```
//!
//! Sample tests and compiler build artifacts are kept out of the workspace,
//! in the app's data directory, so they never clutter the user's folders.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::data::config::Config;
use crate::data::models::{Platform, Problem, SolveStatus, TestCase};

/// Expand a leading `~/` to the user's home directory.
pub fn expand_tilde(s: &str) -> PathBuf {
    if let Some(rest) = s.strip_prefix("~/") {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(rest)
    } else {
        PathBuf::from(s)
    }
}

/// Root directory that holds all per-problem workspaces.
pub fn root(config: &Config) -> PathBuf {
    config
        .workspace_dir
        .as_ref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| expand_tilde(s))
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("cpos")
        })
}

fn platform_slug(platform: Platform) -> &'static str {
    match platform {
        Platform::Codeforces => "codeforces",
        Platform::Cses => "cses",
        Platform::AtCoder => "atcoder",
    }
}

/// Directory that holds a platform's flat list of solution files.
pub fn platform_dir(config: &Config, platform: Platform) -> PathBuf {
    root(config).join(platform_slug(platform))
}

/// A filesystem-safe version of a problem id (CF/CSES ids are already safe,
/// but AtCoder and pasted ids can contain slashes/colons).
fn safe_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Readable PascalCase slug from a problem title — used for CSES filenames.
fn slug_from_name(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|word| {
            let clean: String = word.chars().filter(|c| c.is_alphanumeric()).collect();
            if clean.is_empty() {
                return None;
            }
            let mut chars = clean.chars();
            let first = chars.next()?.to_uppercase().collect::<String>();
            Some(format!("{}{}", first, chars.as_str().to_lowercase()))
        })
        .collect()
}

fn solution_basename(problem: &Problem) -> String {
    match problem.platform {
        Platform::Cses => {
            let slug = slug_from_name(&problem.name);
            if slug.is_empty() {
                safe_id(&problem.id)
            } else {
                slug
            }
        }
        _ => safe_id(&problem.id),
    }
}

/// Path to the solution source file for a problem in the given language —
/// a single flat file like `codeforces/1095F.cpp` or `cses/WeirdAlgorithm.cpp`.
pub fn solution_path(config: &Config, problem: &Problem, ext: &str) -> PathBuf {
    platform_dir(config, problem.platform).join(format!("{}.{}", solution_basename(problem), ext))
}

/// Flat solution file inside a user-chosen directory (matches VS Code workspace layout).
pub fn solution_path_in_dir(dir: &Path, problem: &Problem, ext: &str) -> PathBuf {
    dir.join(format!("{}.{}", solution_basename(problem), ext))
}

/// Search workspace locations for an existing solution file for a problem id.
pub fn discover_solution_path(
    config: &Config,
    platform: Platform,
    problem_id: &str,
    ext: &str,
    solution_paths: &HashMap<String, PathBuf>,
) -> Option<PathBuf> {
    let stub = Problem {
        platform,
        id: problem_id.to_string(),
        name: problem_id.to_string(),
        url: String::new(),
        rating: None,
        tags: Vec::new(),
        category: None,
        solved_count: None,
        status: SolveStatus::Unsolved,
    };

    let key = format!("{platform:?}:{problem_id}");
    if let Some(path) = solution_paths.get(&key) {
        if path.exists() {
            return Some(path.clone());
        }
    }

    let direct = solution_path(config, &stub, ext);
    if direct.exists() {
        return Some(direct);
    }

    if let Some(dir) = active_user_save_dir(config, solution_paths) {
        let flat = dir.join(format!("{problem_id}.{ext}"));
        if flat.exists() {
            return Some(flat);
        }
        let named = solution_path_in_dir(&dir, &stub, ext);
        if named.exists() {
            return Some(named);
        }
    }

    let id_lower = problem_id.to_ascii_lowercase();
    for dir in search_dirs(config, solution_paths) {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if stem.eq_ignore_ascii_case(problem_id) || stem.to_ascii_lowercase().starts_with(&id_lower)
            {
                if path
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case(ext))
                {
                    return Some(path);
                }
            }
        }
    }

    None
}

fn search_dirs(config: &Config, solution_paths: &HashMap<String, PathBuf>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for platform in [Platform::Codeforces, Platform::Cses, Platform::AtCoder] {
        dirs.push(platform_dir(config, platform));
    }
    if let Some(dir) = active_user_save_dir(config, solution_paths) {
        dirs.push(dir);
    }
    for path in solution_paths.values() {
        if let Some(parent) = path.parent() {
            dirs.push(parent.to_path_buf());
        }
    }
    dirs.sort();
    dirs.dedup();
    dirs
}

/// Whether `path` is under CPOS's default `~/cpos` tree (not the user's open project).
pub fn is_default_cpos_tree(path: &Path, config: &Config) -> bool {
    let root = root(config);
    path.starts_with(&root)
}

pub fn has_explicit_workspace_dir(config: &Config) -> bool {
    config
        .workspace_dir
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
}

fn project_like_cwd(config: &Config) -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    if is_default_cpos_tree(&cwd, config) {
        return None;
    }

    let looks_like_project = cwd.join(".git").is_dir()
        || cwd.read_dir().ok().is_some_and(|entries| {
            entries.filter_map(Result::ok).any(|e| {
                matches!(
                    e.path().extension().and_then(|s| s.to_str()),
                    Some("cpp" | "c" | "py" | "java" | "rs")
                )
            })
        });
    looks_like_project.then_some(cwd)
}

/// Prefer the folder the user is actually working in: VS Code capture path,
/// current project directory, or last session — not the configured fallback tree.
pub fn active_user_save_dir(
    config: &Config,
    solution_paths: &HashMap<String, PathBuf>,
) -> Option<PathBuf> {
    for path in solution_paths.values() {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() && !is_default_cpos_tree(path, config) {
                return Some(parent.to_path_buf());
            }
        }
    }

    if let Some(cwd) = project_like_cwd(config) {
        return Some(cwd);
    }

    if has_explicit_workspace_dir(config) {
        return None;
    }

    if let Some((_, Some(path), _)) = load_latest_session() {
        if !is_default_cpos_tree(&path, config) {
            return path.parent().map(|p| p.to_path_buf());
        }
    }

    None
}

/// Path to the JSON file that caches sample tests — kept in the data dir,
/// outside the user's workspace.
pub fn tests_path(config: &Config, problem: &Problem) -> PathBuf {
    let _ = config;
    Config::data_dir()
        .join("tests")
        .join(platform_slug(problem.platform))
        .join(format!("{}.json", safe_id(&problem.id)))
}

/// Create the platform directory and a solution file from the template if one
/// doesn't already exist. Never overwrites existing user code.
pub fn scaffold(config: &Config, problem: &Problem, ext: &str, template: &str) -> Result<PathBuf> {
    let dir = platform_dir(config, problem.platform);
    std::fs::create_dir_all(&dir)?;
    let path = solution_path(config, problem, ext);
    if !path.exists() {
        std::fs::write(&path, template)?;
    }
    Ok(path)
}

/// Persist sample tests to disk so the runner can use them offline.
pub fn save_tests(config: &Config, problem: &Problem, tests: &[TestCase]) -> Result<()> {
    let path = tests_path(config, problem);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(tests)?;
    std::fs::write(path, json)?;
    Ok(())
}

/// Load previously-saved sample tests, or an empty list if none exist.
pub fn load_tests(config: &Config, problem: &Problem) -> Vec<TestCase> {
    std::fs::read_to_string(tests_path(config, problem))
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<TestCase>>(&s).ok())
        .unwrap_or_default()
}

/// Sort key for the Problems list — newer Codeforces contests first, then A→Z
/// within a contest (matches the problemset ordering users expect).
pub fn compare_problems(a: &Problem, b: &Problem) -> std::cmp::Ordering {
    problem_sort_key(a).cmp(&problem_sort_key(b))
}

fn problem_sort_key(p: &Problem) -> (i64, i64, String) {
    match p.platform {
        Platform::Codeforces => {
            let (contest, idx) = split_cf_id(&p.id);
            (-(contest as i64), cf_index_order(&idx), p.id.clone())
        }
        Platform::Cses => {
            let n = p.id.parse::<i64>().unwrap_or(0);
            (-n, 0, p.id.clone())
        }
        Platform::AtCoder => (0, 0, p.id.clone()),
    }
}

fn split_cf_id(id: &str) -> (u32, String) {
    let split = id
        .char_indices()
        .find(|(_, c)| !c.is_ascii_digit())
        .map(|(i, _)| i)
        .unwrap_or(id.len());
    if split == 0 {
        return (0, id.to_string());
    }
    let contest = id[..split].parse().unwrap_or(0);
    (contest, id[split..].to_string())
}

fn cf_index_order(idx: &str) -> i64 {
    // A before B before C; handles A1, B2, etc. lexicographically.
    idx.chars().next().map(|c| c as i64).unwrap_or(999)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct StoredSession {
    platform: String,
    id: String,
    name: String,
    url: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "solutionPath"
    )]
    solution_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "capturedAt")]
    captured_at: Option<String>,
}

impl StoredSession {
    fn from_problem(problem: &Problem, solution_path: Option<&std::path::Path>) -> Self {
        StoredSession {
            platform: platform_slug(problem.platform).to_string(),
            id: problem.id.clone(),
            name: problem.name.clone(),
            url: problem.url.clone(),
            solution_path: solution_path.map(|p| p.to_string_lossy().into_owned()),
            captured_at: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    fn into_problem(&self) -> Problem {
        let platform = match self.platform.to_lowercase().as_str() {
            "codeforces" | "cf" => Platform::Codeforces,
            "cses" => Platform::Cses,
            "atcoder" => Platform::AtCoder,
            _ => Platform::Codeforces,
        };
        Problem {
            platform,
            id: self.id.clone(),
            name: self.name.clone(),
            url: self.url.clone(),
            rating: None,
            tags: vec![],
            category: None,
            solved_count: None,
            status: SolveStatus::Unsolved,
        }
    }

    fn timestamp_key(&self) -> String {
        self.captured_at.clone().unwrap_or_default()
    }
}

fn session_path() -> PathBuf {
    Config::data_dir().join("last-session.json")
}

pub fn vscode_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".cpos-vscode")
}

/// Persist the active problem so the next TUI launch can restore it.
pub fn save_session(problem: &Problem, solution_path: Option<&std::path::Path>) -> Result<()> {
    let _ = std::fs::create_dir_all(Config::data_dir());
    let session = StoredSession::from_problem(problem, solution_path);
    let json = serde_json::to_string_pretty(&session)?;
    std::fs::write(session_path(), json)?;
    Ok(())
}

fn read_session_file(path: &std::path::Path) -> Option<StoredSession> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
}

/// Most recently captured/opened problem from the TUI or VS Code extension.
pub fn load_latest_session() -> Option<(Problem, Option<PathBuf>, String)> {
    let mut candidates: Vec<(Problem, Option<PathBuf>, String)> = Vec::new();

    if let Some(s) = read_session_file(&session_path()) {
        candidates.push(session_tuple(s));
    }

    let vscode_last = vscode_dir().join("last-problem.json");
    if let Some(s) = read_session_file(&vscode_last) {
        candidates.push(session_tuple(s));
    }

    candidates.into_iter().max_by_key(|(_, _, ts)| ts.clone())
}

fn session_tuple(s: StoredSession) -> (Problem, Option<PathBuf>, String) {
    let ts = s.timestamp_key();
    let path = s.solution_path.as_deref().map(PathBuf::from);
    (s.into_problem(), path, ts)
}

/// Resolve the template to scaffold with: the user's configured template file
/// if set and readable, otherwise the built-in per-language template.
pub fn template_content(config: &Config, lang: &str) -> String {
    if let Some(path) = config
        .template_file
        .as_ref()
        .filter(|s| !s.trim().is_empty())
    {
        if let Ok(content) = std::fs::read_to_string(expand_tilde(path)) {
            return content;
        }
    }
    template_for(lang)
}

/// A minimal starter template for the given language key.
pub fn template_for(lang: &str) -> String {
    match lang {
        "c" => "#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n".to_string(),
        "cpp" => "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n"
            .to_string(),
        "python" | "pypy" => "import sys\ninput = sys.stdin.readline\n\n\ndef main():\n    pass\n\n\nif __name__ == \"__main__\":\n    main()\n"
            .to_string(),
        // The class is package-private (no `public`), so the file can be named
        // anything (problem ids start with digits, which Java forbids for the
        // file name only when the class is public).
        "java" => "import java.util.*;\nimport java.io.*;\n\nclass Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n\n    }\n}\n"
            .to_string(),
        "rust" => "use std::io::{self, Read, Write};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    let mut it = input.split_whitespace();\n\n}\n"
            .to_string(),
        "go" => "package main\n\nimport (\n\t\"bufio\"\n\t\"fmt\"\n\t\"os\"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\twriter := bufio.NewWriter(os.Stdout)\n\tdefer writer.Flush()\n\t_ = reader\n\t_ = fmt.Fprintln\n}\n"
            .to_string(),
        "kotlin" => "import java.io.BufferedReader\nimport java.io.InputStreamReader\n\nfun main() {\n    val br = BufferedReader(InputStreamReader(System.`in`))\n\n}\n"
            .to_string(),
        "csharp" => "using System;\nusing System.IO;\n\nclass Main {\n    static void Main() {\n        var input = Console.In;\n\n    }\n}\n"
            .to_string(),
        "javascript" => "const data = require('fs').readFileSync(0, 'utf8');\nconst lines = data.split('\\n');\nlet idx = 0;\nconst next = () => lines[idx++];\n\n"
            .to_string(),
        "ruby" => "# read input with gets / STDIN.read\n\n".to_string(),
        "haskell" => "import Data.List\n\nmain :: IO ()\nmain = do\n    contents <- getContents\n    let ws = words contents\n    return ()\n"
            .to_string(),
        "pascal" => "program solution;\nbegin\n\nend.\n".to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::models::{Platform, SolveStatus};

    fn cses_problem(id: &str, name: &str) -> Problem {
        Problem {
            platform: Platform::Cses,
            id: id.to_string(),
            name: name.to_string(),
            url: format!("https://cses.fi/problemset/task/{id}"),
            rating: None,
            tags: vec![],
            category: None,
            solved_count: None,
            status: SolveStatus::Unsolved,
        }
    }

    #[test]
    fn cses_slug_from_name() {
        assert_eq!(slug_from_name("Weird Algorithm"), "WeirdAlgorithm");
        assert_eq!(slug_from_name("Coin Combinations I"), "CoinCombinationsI");
        assert_eq!(slug_from_name("Sum of Two Values"), "SumOfTwoValues");
    }

    #[test]
    fn cses_solution_uses_slug() {
        let p = cses_problem("1068", "Weird Algorithm");
        let path = solution_path(&Config::default(), &p, "cpp");
        assert!(path.to_string_lossy().ends_with("cses/WeirdAlgorithm.cpp"));
    }

    #[test]
    fn codeforces_solution_uses_id() {
        let p = Problem {
            platform: Platform::Codeforces,
            id: "2232F".to_string(),
            name: "Magical Tiered Cake".to_string(),
            url: "https://codeforces.com/contest/2232/problem/F".to_string(),
            rating: None,
            tags: vec![],
            category: None,
            solved_count: None,
            status: SolveStatus::Unsolved,
        };
        let path = solution_path(&Config::default(), &p, "cpp");
        assert!(path.to_string_lossy().ends_with("codeforces/2232F.cpp"));
    }

    #[test]
    fn explicit_workspace_keeps_current_project_context() {
        let config = Config {
            workspace_dir: Some("/tmp/cpos preferred".to_string()),
            ..Config::default()
        };

        assert_eq!(
            active_user_save_dir(&config, &HashMap::new()),
            project_like_cwd(&config)
        );
    }

    #[test]
    fn live_solution_path_can_still_choose_external_dir() {
        let config = Config {
            workspace_dir: Some("/tmp/cpos preferred".to_string()),
            ..Config::default()
        };
        let mut solution_paths = HashMap::new();
        solution_paths.insert(
            "Codeforces:2232F".to_string(),
            PathBuf::from("/tmp/contest folder/2232F.cpp"),
        );

        assert_eq!(
            active_user_save_dir(&config, &solution_paths),
            Some(PathBuf::from("/tmp/contest folder"))
        );
    }

    #[test]
    fn codeforces_sort_newer_contests_first() {
        let older = Problem {
            platform: Platform::Codeforces,
            id: "1000A".to_string(),
            name: "old".to_string(),
            url: String::new(),
            rating: Some(800),
            tags: vec![],
            category: None,
            solved_count: None,
            status: SolveStatus::Unsolved,
        };
        let newer = Problem {
            platform: Platform::Codeforces,
            id: "2232A".to_string(),
            name: "new".to_string(),
            url: String::new(),
            rating: Some(800),
            tags: vec![],
            category: None,
            solved_count: None,
            status: SolveStatus::Unsolved,
        };
        assert_eq!(
            compare_problems(&older, &newer),
            std::cmp::Ordering::Greater
        );
        assert_eq!(compare_problems(&newer, &older), std::cmp::Ordering::Less);
    }

    #[test]
    fn session_roundtrip() {
        let p = cses_problem("1068", "Weird Algorithm");
        let path = PathBuf::from("/tmp/WeirdAlgorithm.cpp");
        save_session(&p, Some(&path)).unwrap();
        let (restored, restored_path, _) = load_latest_session().unwrap();
        assert_eq!(restored.id, "1068");
        assert_eq!(restored_path, Some(path));
        let _ = std::fs::remove_file(session_path());
    }
}
