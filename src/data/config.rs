use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub handles: HashMap<String, String>,
    pub default_language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    pub compile_commands: HashMap<String, CompileConfig>,
    pub workspace_dir: Option<String>,
    /// Optional path to a solution template file used when scaffolding. When
    /// unset, a built-in per-language template is used.
    #[serde(default)]
    pub template_file: Option<String>,
    /// Optional editor command to open solution files, with `{file}` as a
    /// placeholder. When unset, CPOS auto-detects `cursor`/`code`, then falls
    /// back to the OS default. Example: "nvim {file}" or "code -g {file}".
    #[serde(default)]
    pub editor: Option<String>,
    /// CSES session cookie (PHPSESSID). When set, CPOS reads your solved/attempted
    /// status from your logged-in CSES account. Grab it from your browser's
    /// devtools (Application → Cookies → cses.fi → PHPSESSID).
    #[serde(default)]
    pub cses_session: Option<String>,
    /// Accepted-solution publishing settings shared by the TUI and VS Code extension.
    #[serde(default)]
    pub publish: PublishConfig,
    /// Startup update checks and one-time feature announcements.
    #[serde(default)]
    pub updates: UpdateConfig,
}

fn default_theme() -> String {
    "purple".to_string()
}

fn default_true() -> bool {
    true
}

fn default_publish_repo_dir() -> String {
    "~/cpos-solutions".to_string()
}

fn default_publish_remote() -> String {
    "origin".to_string()
}

fn default_publish_branch() -> String {
    "main".to_string()
}

fn default_ollama_model() -> String {
    "llama3.1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileConfig {
    pub compile: Option<String>,
    pub run: String,
    pub extension: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishConfig {
    /// Off means "not configured". On means accepted solutions publish automatically.
    #[serde(default)]
    pub auto_publish: bool,
    /// Local repository/archive folder. CPOS writes solutions, READMEs, and docs/ here.
    #[serde(default = "default_publish_repo_dir")]
    pub repo_dir: String,
    /// Optional GitHub remote URL, e.g. git@github.com:user/cp-solutions.git.
    #[serde(default)]
    pub remote_url: Option<String>,
    #[serde(default = "default_publish_remote")]
    pub remote: String,
    #[serde(default = "default_publish_branch")]
    pub branch: String,
    /// Generate docs/ for GitHub Pages.
    #[serde(default = "default_true")]
    pub github_pages: bool,
    /// Ask local Ollama for approach/complexity prose. Publishing still works without it.
    #[serde(default)]
    pub ollama_enabled: bool,
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConfig {
    /// Check for terminal app updates when CPOS starts.
    #[serde(default = "default_true")]
    pub check_on_startup: bool,
    /// Prompt before running the update command when an update is found.
    #[serde(default = "default_true")]
    pub prompt_to_install: bool,
    /// Show one-time "what's new" messages in the status bar.
    #[serde(default = "default_true")]
    pub show_announcements: bool,
    #[serde(default)]
    pub seen_publish_intro: bool,
}

impl Default for Config {
    fn default() -> Self {
        let mut handles = HashMap::new();
        handles.insert("codeforces".to_string(), String::new());
        handles.insert("cses".to_string(), String::new());

        let mut compile_commands = HashMap::new();
        let mut lang = |key: &str, compile: Option<&str>, run: &str, ext: &str| {
            compile_commands.insert(
                key.to_string(),
                CompileConfig {
                    compile: compile.map(|s| s.to_string()),
                    run: run.to_string(),
                    extension: ext.to_string(),
                },
            );
        };

        // The broad set of languages competitive-programming judges accept.
        // `{source}` is the absolute path to your file, `{output}` is the
        // compiled binary name, `{dir}` is the build directory.
        lang(
            "c",
            Some("gcc -std=c11 -O2 -o {output} {source} -lm"),
            "./{output}",
            "c",
        );
        lang(
            "cpp",
            Some("g++ -std=c++17 -O2 -o {output} {source}"),
            "./{output}",
            "cpp",
        );
        lang("python", None, "python3 {source}", "py");
        lang("pypy", None, "pypy3 {source}", "py");
        // Class is `Main` (package-private) so the file can be named e.g. 1A.java.
        lang(
            "java",
            Some("javac -d {dir} {source}"),
            "java -cp {dir} Main",
            "java",
        );
        lang(
            "kotlin",
            Some("kotlinc {source} -include-runtime -d {output}.jar"),
            "java -jar {output}.jar",
            "kt",
        );
        lang(
            "rust",
            Some("rustc -O -o {output} {source}"),
            "./{output}",
            "rs",
        );
        lang("go", None, "go run {source}", "go");
        lang(
            "csharp",
            Some("mcs -out:{output}.exe {source}"),
            "mono {output}.exe",
            "cs",
        );
        lang("javascript", None, "node {source}", "js");
        lang("ruby", None, "ruby {source}", "rb");
        lang(
            "haskell",
            Some("ghc -O2 -o {output} {source} -outputdir {dir}"),
            "./{output}",
            "hs",
        );
        lang(
            "pascal",
            Some("fpc -O2 -o{output} {source}"),
            "./{output}",
            "pas",
        );

        Config {
            handles,
            default_language: "cpp".to_string(),
            theme: default_theme(),
            compile_commands,
            workspace_dir: None,
            template_file: None,
            editor: None,
            cses_session: None,
            publish: PublishConfig::default(),
            updates: UpdateConfig::default(),
        }
    }
}

impl Default for PublishConfig {
    fn default() -> Self {
        PublishConfig {
            auto_publish: false,
            repo_dir: default_publish_repo_dir(),
            remote_url: None,
            remote: default_publish_remote(),
            branch: default_publish_branch(),
            github_pages: true,
            ollama_enabled: false,
            ollama_model: default_ollama_model(),
        }
    }
}

impl Default for UpdateConfig {
    fn default() -> Self {
        UpdateConfig {
            check_on_startup: true,
            prompt_to_install: true,
            show_announcements: true,
            seen_publish_intro: false,
        }
    }
}

impl Config {
    pub fn config_dir() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("cpos")
    }

    pub fn config_path() -> PathBuf {
        Self::config_dir().join("config.toml")
    }

    pub fn data_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("cpos")
    }

    pub fn load() -> Result<Self> {
        let path = Self::config_path();
        if path.exists() {
            let contents = std::fs::read_to_string(&path)?;
            let mut config: Config = toml::from_str(&contents)?;
            // Backfill any languages added in newer versions so existing users
            // pick up new compile/run commands without re-doing setup.
            let defaults = Config::default();
            let mut changed = false;
            for (lang, cmd) in defaults.compile_commands {
                config.compile_commands.entry(lang).or_insert_with(|| {
                    changed = true;
                    cmd
                });
            }
            if changed {
                let _ = config.save();
            }
            // Drop stale editor commands that spam "command not found" in the
            // terminal (common when `code` isn't on PATH).
            if config
                .editor
                .as_deref()
                .is_some_and(|e| e.contains("code") || e.contains("cursor"))
            {
                let prog = config
                    .editor
                    .as_deref()
                    .and_then(|e| e.split_whitespace().next())
                    .unwrap_or("");
                if !prog.is_empty() {
                    let ok = std::process::Command::new("sh")
                        .arg("-c")
                        .arg(format!("command -v {prog} >/dev/null 2>&1"))
                        .status()
                        .map(|s| s.success())
                        .unwrap_or(false);
                    if !ok {
                        config.editor = None;
                        let _ = config.save();
                    }
                }
            }
            Ok(config)
        } else {
            let config = Config::default();
            config.save()?;
            Ok(config)
        }
    }

    pub fn save(&self) -> Result<()> {
        let dir = Self::config_dir();
        std::fs::create_dir_all(&dir)?;
        let contents = toml::to_string_pretty(self)?;
        std::fs::write(Self::config_path(), contents)?;
        Ok(())
    }

    pub fn cf_handle(&self) -> Option<&str> {
        self.handles
            .get("codeforces")
            .map(|s| s.as_str())
            .filter(|s| !s.is_empty())
    }

    pub fn cses_handle(&self) -> Option<&str> {
        self.handles
            .get("cses")
            .map(|s| s.as_str())
            .filter(|s| !s.is_empty())
    }
}
