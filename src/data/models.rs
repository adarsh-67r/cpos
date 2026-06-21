use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Platform {
    Codeforces,
    Cses,
    AtCoder,
}

impl fmt::Display for Platform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Platform::Codeforces => write!(f, "Codeforces"),
            Platform::Cses => write!(f, "CSES"),
            Platform::AtCoder => write!(f, "AtCoder"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolveStatus {
    Solved,
    Attempted,
    Unsolved,
}

impl fmt::Display for SolveStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SolveStatus::Solved => write!(f, "Solved"),
            SolveStatus::Attempted => write!(f, "Tried"),
            SolveStatus::Unsolved => write!(f, "--"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Verdict {
    Accepted,
    WrongAnswer,
    TimeLimitExceeded,
    MemoryLimitExceeded,
    RuntimeError,
    CompilationError,
    Skipped,
    Other,
}

impl fmt::Display for Verdict {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Verdict::Accepted => write!(f, "AC"),
            Verdict::WrongAnswer => write!(f, "WA"),
            Verdict::TimeLimitExceeded => write!(f, "TLE"),
            Verdict::MemoryLimitExceeded => write!(f, "MLE"),
            Verdict::RuntimeError => write!(f, "RE"),
            Verdict::CompilationError => write!(f, "CE"),
            Verdict::Skipped => write!(f, "SKIP"),
            Verdict::Other => write!(f, "??"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Problem {
    pub platform: Platform,
    pub id: String,
    pub name: String,
    pub url: String,
    pub rating: Option<u32>,
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub solved_count: Option<u64>,
    pub status: SolveStatus,
}

impl Problem {
    pub fn display_id(&self) -> &str {
        &self.id
    }

    pub fn difficulty_label(&self) -> String {
        match self.rating {
            Some(r) => r.to_string(),
            None => "—".to_string(),
        }
    }

    pub fn tags_label(&self) -> String {
        if self.tags.is_empty() {
            "—".to_string()
        } else {
            self.tags.join(", ")
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Submission {
    pub platform: Platform,
    pub id: String,
    pub problem_id: String,
    pub problem_name: String,
    pub verdict: Verdict,
    pub language: String,
    pub time_ms: Option<u64>,
    pub memory_kb: Option<u64>,
    pub submitted_at: DateTime<Utc>,
    pub tags: Vec<String>,
    pub rating: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contest {
    pub platform: Platform,
    pub id: String,
    pub name: String,
    pub url: String,
    pub start_time: DateTime<Utc>,
    pub duration_seconds: u64,
    pub phase: ContestPhase,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContestPhase {
    Before,
    Running,
    Finished,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub platform: Platform,
    pub handle: String,
    pub rating: Option<u32>,
    pub max_rating: Option<u32>,
    pub rank: Option<String>,
    pub solved_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RatingChange {
    pub contest_name: String,
    pub old_rating: u32,
    pub new_rating: u32,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCase {
    pub input: String,
    pub expected_output: String,
    /// Optional Codeforces multi-test grouping captured from the sample markup.
    #[serde(default)]
    pub input_block_sizes: Vec<usize>,
    #[serde(default)]
    pub output_block_sizes: Vec<usize>,
    #[serde(default)]
    pub input_output_offset: usize,
}

#[derive(Debug, Clone)]
pub struct TestResult {
    pub test_index: usize,
    pub passed: bool,
    pub input: String,
    pub expected: String,
    pub actual: String,
    pub time_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TagStats {
    pub tag: String,
    pub solved: u32,
    pub attempted: u32,
    pub total: u32,
    pub avg_rating: Option<f64>,
}

/// Payload sent by the browser companion when the user clicks "capture" on a
/// Codeforces/CSES problem page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedProblem {
    pub platform: String,
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub rating: Option<u32>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub tests: Vec<TestCase>,
    /// Sanitized problem-statement HTML captured by the browser companion.
    #[serde(default, alias = "statementHtml")]
    pub statement_html: Option<String>,
    /// When VS Code captures into the user's open folder, it forwards this path
    /// so the TUI can run/submit against the same file.
    #[serde(default)]
    pub solution_path: Option<String>,
}

impl CapturedProblem {
    pub fn into_problem(self) -> Problem {
        let platform = match self.platform.to_lowercase().as_str() {
            "codeforces" | "cf" => Platform::Codeforces,
            "cses" => Platform::Cses,
            "atcoder" => Platform::AtCoder,
            _ => Platform::Codeforces,
        };
        Problem {
            platform,
            id: self.id,
            name: self.name,
            url: self.url,
            rating: self.rating,
            tags: self.tags,
            category: self.category,
            solved_count: None,
            status: SolveStatus::Unsolved,
        }
    }
}

/// Payload sent by the browser companion from the CSES problemset list page,
/// containing which tasks are solved/attempted for the logged-in user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedCsesProgress {
    pub solved: Vec<String>,
    pub attempted: Vec<String>,
}

/// Queued submission for the browser companion to auto-fill on a platform submit page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingSubmit {
    #[serde(default = "default_true")]
    pub ok: bool,
    pub platform: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<String>,
    pub code: String,
    pub language: String,
    pub file_name: String,
    pub submit_url: String,
    pub expires_at: u64,
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captured_problem_parses_minimal_json() {
        let json = r#"{
            "platform": "codeforces",
            "id": "1095F",
            "name": "Make It Connected",
            "url": "https://codeforces.com/problemset/problem/1095/F",
            "tests": [
                {"input": "3\n1 2 3", "expected_output": "3\n1 2\n2 3"}
            ]
        }"#;
        let cap: CapturedProblem = serde_json::from_str(json).unwrap();
        assert_eq!(cap.platform, "codeforces");
        assert_eq!(cap.id, "1095F");
        assert_eq!(cap.tests.len(), 1);
        assert_eq!(cap.tests[0].input, "3\n1 2 3");

        let problem = cap.into_problem();
        assert_eq!(problem.platform, Platform::Codeforces);
        assert!(problem.rating.is_none());
        assert!(problem.tags.is_empty());
    }

    #[test]
    fn captured_problem_parses_with_optional_fields() {
        let json = r#"{
            "platform": "cses",
            "id": "1068",
            "name": "Weird Algorithm",
            "url": "https://cses.fi/problemset/task/1068",
            "rating": 800,
            "tags": ["math"],
            "category": "Introductory Problems",
            "statementHtml": "<div><p>Compute the sequence.</p></div>",
            "tests": []
        }"#;
        let cap: CapturedProblem = serde_json::from_str(json).unwrap();
        assert_eq!(cap.platform, "cses");
        assert_eq!(cap.rating, Some(800));
        assert_eq!(
            cap.statement_html.as_deref(),
            Some("<div><p>Compute the sequence.</p></div>")
        );
        let problem = cap.into_problem();
        assert_eq!(problem.platform, Platform::Cses);
        assert_eq!(problem.category, Some("Introductory Problems".to_string()));
    }

    #[test]
    fn captured_cses_progress_parses() {
        let json = r#"{"solved":["1068","1083"],"attempted":["1069"]}"#;
        let progress: CapturedCsesProgress = serde_json::from_str(json).unwrap();
        assert_eq!(progress.solved, vec!["1068", "1083"]);
        assert_eq!(progress.attempted, vec!["1069"]);
    }
}
