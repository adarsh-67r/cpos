use anyhow::{Result, bail};
use chrono::{DateTime, Utc};
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Deserialize;

use super::{pre_text, PlatformClient};
use crate::data::models::*;

const CF_API: &str = "https://codeforces.com/api";

/// A browser-like user agent improves the odds of getting past the basic
/// anti-bot checks when scraping the HTML problem page for samples.
const BROWSER_UA: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

pub struct CodeforcesClient {
    client: Client,
}

#[derive(Debug, Deserialize)]
struct CfResponse<T> {
    status: String,
    result: Option<T>,
    comment: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CfProblem {
    #[serde(rename = "contestId")]
    contest_id: Option<u64>,
    index: String,
    name: String,
    rating: Option<u32>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(rename = "solvedCount")]
    #[allow(dead_code)]
    solved_count: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct CfProblemStats {
    #[serde(rename = "contestId")]
    contest_id: Option<u64>,
    index: String,
    #[serde(rename = "solvedCount")]
    solved_count: u64,
}

#[derive(Debug, Deserialize)]
struct CfProblemsResult {
    problems: Vec<CfProblem>,
    #[serde(rename = "problemStatistics")]
    problem_statistics: Vec<CfProblemStats>,
}

#[derive(Debug, Deserialize)]
struct CfSubmission {
    id: u64,
    problem: CfProblem,
    verdict: Option<String>,
    #[serde(rename = "programmingLanguage")]
    programming_language: String,
    #[serde(rename = "timeConsumedMillis")]
    time_consumed_millis: Option<u64>,
    #[serde(rename = "memoryConsumedBytes")]
    memory_consumed_bytes: Option<u64>,
    #[serde(rename = "creationTimeSeconds")]
    creation_time_seconds: i64,
}

#[derive(Debug, Deserialize)]
struct CfContest {
    id: u64,
    name: String,
    phase: String,
    #[serde(rename = "startTimeSeconds")]
    start_time_seconds: Option<i64>,
    #[serde(rename = "durationSeconds")]
    duration_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct CfRatingChange {
    #[serde(rename = "contestName")]
    contest_name: String,
    #[serde(rename = "oldRating")]
    old_rating: u32,
    #[serde(rename = "newRating")]
    new_rating: u32,
    #[serde(rename = "ratingUpdateTimeSeconds")]
    rating_update_time_seconds: i64,
}

impl CodeforcesClient {
    pub fn new() -> Self {
        CodeforcesClient {
            client: Client::builder()
                .user_agent("cpos/0.1")
                .build()
                .unwrap_or_default(),
        }
    }

    /// Scrape the sample tests (input/expected output pairs) from a problem's
    /// HTML page. Returns an error if the page can't be fetched (e.g. blocked).
    pub async fn fetch_samples(&self, problem_url: &str) -> Result<Vec<TestCase>> {
        let body = self
            .client
            .get(problem_url)
            .header("User-Agent", BROWSER_UA)
            .header("Accept-Language", "en")
            .send()
            .await?
            .text()
            .await?;

        let tests = parse_cf_samples(&body);
        if tests.is_empty() {
            bail!("no samples found on the problem page");
        }
        Ok(tests)
    }
}

fn parse_cf_samples(body: &str) -> Vec<TestCase> {
    let doc = Html::parse_document(body);
    let input_sel = Selector::parse(".sample-test .input pre").unwrap();
    let output_sel = Selector::parse(".sample-test .output pre").unwrap();

    let inputs: Vec<String> = doc.select(&input_sel).map(pre_text).collect();
    let outputs: Vec<String> = doc.select(&output_sel).map(pre_text).collect();

    inputs
        .into_iter()
        .zip(outputs)
        .map(|(input, expected_output)| TestCase {
            input,
            expected_output,
            input_block_sizes: Vec::new(),
            output_block_sizes: Vec::new(),
            input_output_offset: 0,
        })
        .collect()
}

fn parse_verdict(v: &str) -> Verdict {
    match v {
        "OK" => Verdict::Accepted,
        "WRONG_ANSWER" => Verdict::WrongAnswer,
        "TIME_LIMIT_EXCEEDED" => Verdict::TimeLimitExceeded,
        "MEMORY_LIMIT_EXCEEDED" => Verdict::MemoryLimitExceeded,
        "RUNTIME_ERROR" => Verdict::RuntimeError,
        "COMPILATION_ERROR" => Verdict::CompilationError,
        "SKIPPED" => Verdict::Skipped,
        _ => Verdict::Other,
    }
}

fn ts_to_datetime(ts: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(ts, 0).unwrap_or_else(|| Utc::now())
}

impl PlatformClient for CodeforcesClient {
    fn platform(&self) -> Platform {
        Platform::Codeforces
    }

    async fn fetch_problems(&self) -> Result<Vec<Problem>> {
        let url = format!("{CF_API}/problemset.problems");
        let resp: CfResponse<CfProblemsResult> = self.client.get(&url).send().await?.json().await?;

        if resp.status != "OK" {
            bail!(
                "Codeforces API error: {}",
                resp.comment.unwrap_or_default()
            );
        }

        let result = resp.result.unwrap();
        let mut solved_map = std::collections::HashMap::new();
        for stat in &result.problem_statistics {
            if let Some(cid) = stat.contest_id {
                solved_map.insert(format!("{}{}", cid, stat.index), stat.solved_count);
            }
        }

        let problems = result
            .problems
            .into_iter()
            .filter_map(|p| {
                let cid = p.contest_id?;
                let id = format!("{}{}", cid, p.index);
                let url = format!("https://codeforces.com/problemset/problem/{}/{}", cid, p.index);
                let solved_count = solved_map.get(&id).copied();
                Some(Problem {
                    platform: Platform::Codeforces,
                    id,
                    name: p.name,
                    url,
                    rating: p.rating,
                    tags: p.tags,
                    category: None,
                    solved_count,
                    status: SolveStatus::Unsolved,
                })
            })
            .collect();

        Ok(problems)
    }

    async fn fetch_submissions(&self, handle: &str) -> Result<Vec<Submission>> {
        let url = format!("{CF_API}/user.status?handle={handle}&from=1&count=10000");
        let resp: CfResponse<Vec<CfSubmission>> = self.client.get(&url).send().await?.json().await?;

        if resp.status != "OK" {
            bail!(
                "Codeforces API error: {}",
                resp.comment.unwrap_or_default()
            );
        }

        let subs = resp
            .result
            .unwrap_or_default()
            .into_iter()
            .filter_map(|s| {
                let cid = s.problem.contest_id?;
                let verdict_str = s.verdict.as_deref()?;
                Some(Submission {
                    platform: Platform::Codeforces,
                    id: s.id.to_string(),
                    problem_id: format!("{}{}", cid, s.problem.index),
                    problem_name: s.problem.name.clone(),
                    verdict: parse_verdict(verdict_str),
                    language: s.programming_language,
                    time_ms: s.time_consumed_millis,
                    memory_kb: s.memory_consumed_bytes.map(|b| b / 1024),
                    submitted_at: ts_to_datetime(s.creation_time_seconds),
                    tags: s.problem.tags,
                    rating: s.problem.rating,
                })
            })
            .collect();

        Ok(subs)
    }

    async fn fetch_rating_history(&self, handle: &str) -> Result<Vec<RatingChange>> {
        let url = format!("{CF_API}/user.rating?handle={handle}");
        let resp: CfResponse<Vec<CfRatingChange>> =
            self.client.get(&url).send().await?.json().await?;

        if resp.status != "OK" {
            bail!(
                "Codeforces API error: {}",
                resp.comment.unwrap_or_default()
            );
        }

        let changes = resp
            .result
            .unwrap_or_default()
            .into_iter()
            .map(|c| RatingChange {
                contest_name: c.contest_name,
                old_rating: c.old_rating,
                new_rating: c.new_rating,
                timestamp: ts_to_datetime(c.rating_update_time_seconds),
            })
            .collect();

        Ok(changes)
    }

    async fn fetch_contests(&self) -> Result<Vec<Contest>> {
        let url = format!("{CF_API}/contest.list?gym=false");
        let resp: CfResponse<Vec<CfContest>> = self.client.get(&url).send().await?.json().await?;

        if resp.status != "OK" {
            bail!(
                "Codeforces API error: {}",
                resp.comment.unwrap_or_default()
            );
        }

        let contests = resp
            .result
            .unwrap_or_default()
            .into_iter()
            .map(|c| {
                let phase = match c.phase.as_str() {
                    "BEFORE" => ContestPhase::Before,
                    "CODING" | "PENDING_SYSTEM_TEST" | "SYSTEM_TEST" => ContestPhase::Running,
                    _ => ContestPhase::Finished,
                };
                Contest {
                    platform: Platform::Codeforces,
                    id: c.id.to_string(),
                    name: c.name,
                    url: format!("https://codeforces.com/contest/{}", c.id),
                    start_time: ts_to_datetime(c.start_time_seconds.unwrap_or(0)),
                    duration_seconds: c.duration_seconds.unwrap_or(0),
                    phase,
                }
            })
            .collect();

        Ok(contests)
    }
}
