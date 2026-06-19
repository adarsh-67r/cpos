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
    /// Per-language template paths shared by every CPOS client.
    #[serde(default)]
    pub template_files: HashMap<String, String>,
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
}

fn default_theme() -> String {
    "purple".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileConfig {
    pub compile: Option<String>,
    pub run: String,
    pub extension: String,
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
        lang("c", Some("gcc -std=c11 -O2 -o {output} {source} -lm"), "./{output}", "c");
        lang("cpp", Some("g++ -std=c++17 -O2 -o {output} {source}"), "./{output}", "cpp");
        lang("python", None, "python3 {source}", "py");
        lang("pypy", None, "pypy3 {source}", "py");
        // Class is `Main` (package-private) so the file can be named e.g. 1A.java.
        lang("java", Some("javac -d {dir} {source}"), "java -cp {dir} Main", "java");
        lang("kotlin", Some("kotlinc {source} -include-runtime -d {output}.jar"), "java -jar {output}.jar", "kt");
        lang("rust", Some("rustc -O -o {output} {source}"), "./{output}", "rs");
        lang("go", None, "go run {source}", "go");
        lang("csharp", Some("mcs -out:{output}.exe {source}"), "mono {output}.exe", "cs");
        lang("javascript", None, "node {source}", "js");
        lang("ruby", None, "ruby {source}", "rb");
        lang("haskell", Some("ghc -O2 -o {output} {source} -outputdir {dir}"), "./{output}", "hs");
        lang("pascal", Some("fpc -O2 -o{output} {source}"), "./{output}", "pas");

        Config {
            handles,
            default_language: "cpp".to_string(),
            theme: default_theme(),
            compile_commands,
            workspace_dir: None,
            template_file: None,
            template_files: HashMap::new(),
            editor: None,
            cses_session: None,
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

    pub fn template_path(&self, lang: &str) -> Option<PathBuf> {
        self.template_files
            .get(lang)
            .map(PathBuf::from)
            .or_else(|| {
                let shared = Self::shared_template_path(lang);
                shared.exists().then_some(shared)
            })
            .or_else(|| {
                if lang == self.default_language && self.template_files.is_empty() {
                    self.template_file.as_ref().map(PathBuf::from)
                } else {
                    None
                }
            })
    }

    pub fn shared_template_path(lang: &str) -> PathBuf {
        Self::config_dir()
            .join("templates")
            .join(format!("template.{}", template_extension(lang)))
    }

    pub fn read_template(&self, lang: &str) -> Option<String> {
        self.template_path(lang)
            .and_then(|path| std::fs::read_to_string(path).ok())
    }

    pub fn write_template(&mut self, lang: &str, content: &str) -> Result<PathBuf> {
        let path = Self::shared_template_path(lang);
        if content.trim().is_empty() {
            if path.exists() {
                std::fs::remove_file(&path)?;
            }
            self.template_files.remove(lang);
            if self.template_file.as_deref() == Some(path.to_string_lossy().as_ref()) {
                self.template_file = None;
            }
            self.save()?;
            return Ok(path);
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, content)?;
        self.template_files
            .insert(lang.to_string(), path.to_string_lossy().to_string());
        if lang == self.default_language {
            self.template_file = Some(path.to_string_lossy().to_string());
        }
        self.save()?;
        Ok(path)
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
                config
                    .compile_commands
                    .entry(lang)
                    .or_insert_with(|| {
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

fn template_extension(lang: &str) -> &str {
    match lang {
        "c" => "c",
        "cpp" => "cpp",
        "python" | "pypy" => "py",
        "java" => "java",
        "kotlin" => "kt",
        "rust" => "rs",
        "go" => "go",
        "csharp" => "cs",
        "javascript" => "js",
        "ruby" => "rb",
        "haskell" => "hs",
        "pascal" => "pas",
        _ => "txt",
    }
}
