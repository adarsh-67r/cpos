use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use reqwest::Client;
use serde::Deserialize;
use serde::Serialize;

use crate::data::models::Problem;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolutionExplanation {
    pub approach: String,
    pub time_complexity: String,
    pub space_complexity: String,
    pub notes: String,
    pub commit_subject: String,
}

impl SolutionExplanation {
    pub fn fallback(problem: &Problem, language: &str) -> Self {
        SolutionExplanation {
            approach: format!(
                "Accepted {} solution for {}. The implementation is documented from the final accepted code.",
                language, problem.name
            ),
            time_complexity: "See solution".to_string(),
            space_complexity: "See solution".to_string(),
            notes:
                "Generated without Ollama. Enable Ollama in CPOS settings for a richer explanation."
                    .to_string(),
            commit_subject: format!(
                "Solve {} {} - {}",
                problem.platform, problem.id, problem.name
            ),
        }
    }
}

const OLLAMA: &str = "http://127.0.0.1:11434";

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Vec<TagModel>,
}

#[derive(Debug, Deserialize)]
struct TagModel {
    name: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    stream: bool,
    format: &'a str,
}

#[derive(Debug, Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: ChatBody,
}

#[derive(Debug, Deserialize)]
struct ChatBody {
    content: String,
}

#[derive(Debug, Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: String,
    stream: bool,
    format: &'a str,
}

#[derive(Debug, Deserialize)]
struct GenerateResponse {
    response: String,
}

#[derive(Debug, Deserialize)]
struct LooseExplanation {
    approach: Option<String>,
    time_complexity: Option<String>,
    space_complexity: Option<String>,
    notes: Option<String>,
    commit_subject: Option<String>,
}

/// Install/start Ollama and pull the requested model. Runs in the normal terminal (not the TUI).
pub fn setup_interactive(requested: &str) -> Result<String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err(anyhow!("Ollama model name is empty"));
    }
    if !command_exists("ollama") {
        return Err(anyhow!(
            "Ollama is not installed — download from https://ollama.com/download then try again"
        ));
    }
    ensure_server_running()?;
    let models = list_models_sync()?;
    if let Ok(resolved) = pick_model(requested, &models) {
        eprintln!("Ollama ready — using {resolved}");
        return Ok(resolved);
    }
    eprintln!("Pulling {requested} — this can take several minutes…");
    let status = Command::new("ollama")
        .args(["pull", requested])
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("failed to run `ollama pull`")?;
    if !status.success() {
        return Err(anyhow!("`ollama pull {requested}` failed"));
    }
    let resolved = pick_model(requested, &list_models_sync()?)?;
    eprintln!("Ollama ready — using {resolved}");
    Ok(resolved)
}

fn command_exists(name: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {name}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn ensure_server_running() -> Result<()> {
    if server_reachable() {
        return Ok(());
    }
    eprintln!("Starting Ollama server…");
    let _ = Command::new("ollama")
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("failed to start `ollama serve`")?;
    for _ in 0..40 {
        thread::sleep(Duration::from_millis(500));
        if server_reachable() {
            return Ok(());
        }
    }
    Err(anyhow!(
        "Ollama server did not start — open the Ollama app, then press O in Config to retry"
    ))
}

fn server_reachable() -> bool {
    Command::new("ollama")
        .arg("list")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn list_models_sync() -> Result<Vec<String>> {
    let output = Command::new("ollama")
        .arg("list")
        .output()
        .context("failed to run `ollama list`")?;
    if !output.status.success() {
        return Err(anyhow!("`ollama list` failed — is the Ollama app running?"));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let models = text
        .lines()
        .skip(1)
        .filter_map(|line| line.split_whitespace().next())
        .map(str::to_string)
        .collect();
    Ok(models)
}

fn pick_model(requested: &str, models: &[String]) -> Result<String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err(anyhow!("Ollama model name is empty"));
    }
    if models.is_empty() {
        return Err(anyhow!("no Ollama models installed yet"));
    }
    if models.iter().any(|m| m == requested) {
        return Ok(requested.to_string());
    }
    let with_tag = format!("{requested}:latest");
    if models.iter().any(|m| m == &with_tag) {
        return Ok(with_tag);
    }
    if let Some(found) = models
        .iter()
        .find(|m| m.starts_with(&format!("{requested}:")) || m.starts_with(requested))
    {
        return Ok(found.clone());
    }
    Err(anyhow!(
        "model `{requested}` not found — installed: {}",
        models.join(", ")
    ))
}

pub async fn explain_solution(
    model: &str,
    problem: &Problem,
    language: &str,
    code: &str,
) -> Result<SolutionExplanation> {
    let client = http_client()?;
    ensure_running(&client).await?;
    let model = resolve_model(&client, model).await?;
    let prompt = prompt(problem, language, code);

    let chat_err = match chat_json(&client, &model, &prompt).await {
        Ok(exp) => return Ok(clean(exp, problem, language)),
        Err(e) => e,
    };
    match generate_json(&client, &model, &prompt).await {
        Ok(exp) => Ok(clean(exp, problem, language)),
        Err(generate_err) => Err(anyhow!(
            "Ollama failed (is `{model}` pulled? try `ollama pull {model}`): chat: {chat_err}; generate: {generate_err}"
        )),
    }
}

fn http_client() -> Result<Client> {
    Ok(Client::builder()
        .timeout(Duration::from_secs(90))
        .build()?)
}

async fn ensure_running(client: &Client) -> Result<()> {
    client
        .get(format!("{OLLAMA}/api/tags"))
        .send()
        .await
        .context("cannot reach Ollama at http://127.0.0.1:11434 — start the Ollama app or run `ollama serve`")?
        .error_for_status()
        .context("Ollama returned an error — check that the app is running")?;
    Ok(())
}

async fn list_models(client: &Client) -> Result<Vec<String>> {
    let tags = client
        .get(format!("{OLLAMA}/api/tags"))
        .send()
        .await?
        .error_for_status()?
        .json::<TagsResponse>()
        .await?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

async fn resolve_model(client: &Client, requested: &str) -> Result<String> {
    let models = list_models(client).await?;
    pick_model(requested, &models)
}

async fn chat_json(client: &Client, model: &str, prompt: &str) -> Result<SolutionExplanation> {
    let body = ChatRequest {
        model,
        messages: vec![ChatMessage {
            role: "user",
            content: prompt.to_string(),
        }],
        stream: false,
        format: "json",
    };
    let response = client
        .post(format!("{OLLAMA}/api/chat"))
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<ChatResponse>()
        .await?;
    parse_explanation_json(&response.message.content)
}

async fn generate_json(client: &Client, model: &str, prompt: &str) -> Result<SolutionExplanation> {
    let body = GenerateRequest {
        model,
        prompt: prompt.to_string(),
        stream: false,
        format: "json",
    };
    let response = client
        .post(format!("{OLLAMA}/api/generate"))
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<GenerateResponse>()
        .await?;
    parse_explanation_json(&response.response)
}

fn parse_explanation_json(text: &str) -> Result<SolutionExplanation> {
    let trimmed = strip_json_fences(text.trim());
    if let Ok(exp) = serde_json::from_str::<SolutionExplanation>(&trimmed) {
        return Ok(exp);
    }
    let loose: LooseExplanation = serde_json::from_str(&trimmed)
        .map_err(|e| anyhow!("Ollama returned invalid JSON: {e}"))?;
    Ok(SolutionExplanation {
        approach: loose.approach.unwrap_or_default(),
        time_complexity: loose.time_complexity.unwrap_or_default(),
        space_complexity: loose.space_complexity.unwrap_or_default(),
        notes: loose.notes.unwrap_or_default(),
        commit_subject: loose.commit_subject.unwrap_or_default(),
    })
}

fn strip_json_fences(text: &str) -> String {
    let mut s = text.trim();
    if let Some(rest) = s.strip_prefix("```json") {
        s = rest.trim_start();
    } else if let Some(rest) = s.strip_prefix("```") {
        s = rest.trim_start();
    }
    if let Some(rest) = s.strip_suffix("```") {
        s = rest.trim_end();
    }
    s.trim().to_string()
}

fn clean(
    mut explanation: SolutionExplanation,
    problem: &Problem,
    language: &str,
) -> SolutionExplanation {
    let fallback = SolutionExplanation::fallback(problem, language);
    if explanation.approach.trim().is_empty() {
        explanation.approach = fallback.approach;
    }
    if explanation.time_complexity.trim().is_empty() {
        explanation.time_complexity = fallback.time_complexity;
    }
    if explanation.space_complexity.trim().is_empty() {
        explanation.space_complexity = fallback.space_complexity;
    }
    if explanation.commit_subject.trim().is_empty() {
        explanation.commit_subject = fallback.commit_subject;
    }
    explanation
}

fn prompt(problem: &Problem, language: &str, code: &str) -> String {
    format!(
        r#"You are helping build a polished competitive-programming solutions archive.

Return only valid JSON with exactly these string keys:
approach, time_complexity, space_complexity, notes, commit_subject.

Keep it concise, accurate, and in the author's voice. Do not invent proof details
that are not supported by the code. The commit_subject must be under 72 characters.

Platform: {platform}
Problem id: {id}
Problem name: {name}
Problem link: {url}
Rating: {rating}
Tags: {tags}
Language: {language}

Accepted code:
```{language}
{code}
```"#,
        platform = problem.platform,
        id = problem.id,
        name = problem.name,
        url = problem.url,
        rating = problem
            .rating
            .map(|r| r.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        tags = if problem.tags.is_empty() {
            "none".to_string()
        } else {
            problem.tags.join(", ")
        },
        code = code,
    )
}
