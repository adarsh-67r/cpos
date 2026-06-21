use anyhow::Result;
use reqwest::Client;
use scraper::{Html, Selector};

use super::{pre_text, PlatformClient};
use crate::data::models::*;

const CSES_BASE: &str = "https://cses.fi";

pub struct CsesClient {
    client: Client,
}

impl CsesClient {
    pub fn new() -> Self {
        CsesClient {
            client: Client::builder()
                .user_agent("cpos/0.1")
                .build()
                .unwrap_or_default(),
        }
    }

    /// Read solved/attempted task ids from a logged-in CSES session. CSES marks
    /// each task on the problemset list with a `.task-score` span whose class is
    /// `full` (solved) or `zero` (attempted) once you're authenticated.
    /// Returns `(solved, attempted)`.
    pub async fn fetch_solved(&self, session: &str) -> Result<(Vec<String>, Vec<String>)> {
        let url = format!("{CSES_BASE}/problemset/list/");
        let body = self
            .client
            .get(&url)
            .header("Cookie", format!("PHPSESSID={}", session.trim()))
            .send()
            .await?
            .text()
            .await?;

        let doc = Html::parse_document(&body);
        let task_sel = Selector::parse(".task").unwrap();
        let link_sel = Selector::parse("a").unwrap();
        let score_sel = Selector::parse(".task-score").unwrap();

        let mut solved = Vec::new();
        let mut attempted = Vec::new();

        for task in doc.select(&task_sel) {
            let Some(a) = task.select(&link_sel).next() else {
                continue;
            };
            let task_id = a
                .value()
                .attr("href")
                .unwrap_or("")
                .rsplit('/')
                .next()
                .unwrap_or("")
                .to_string();
            if task_id.is_empty() {
                continue;
            }
            if let Some(score) = task.select(&score_sel).next() {
                let class = score.value().attr("class").unwrap_or("");
                if class.split_whitespace().any(|c| c == "full") {
                    solved.push(task_id);
                } else if class.split_whitespace().any(|c| c == "zero") {
                    attempted.push(task_id);
                }
            }
        }

        if solved.is_empty() && attempted.is_empty() {
            if body.contains("/login") || body.contains(">Login<") || body.contains(">Log in<") {
                anyhow::bail!("PHPSESSID cookie expired — log in at cses.fi and paste a fresh cookie, or visit the problemset list with the CPOS browser companion");
            }
            // Logged in but no scored tasks yet — still a valid sync.
            return Ok((solved, attempted));
        }
        Ok((solved, attempted))
    }

    /// Scrape the example input/output from a CSES task page.
    pub async fn fetch_samples(&self, problem_url: &str) -> Result<Vec<TestCase>> {
        let body = self.client.get(problem_url).send().await?.text().await?;
        let tests = parse_cses_samples(&body);
        if tests.is_empty() {
            anyhow::bail!("no example found on the task page");
        }
        Ok(tests)
    }

    async fn scrape_problem_list(&self) -> Result<Vec<Problem>> {
        let url = format!("{CSES_BASE}/problemset/list");
        let body = self.client.get(&url).send().await?.text().await?;
        let doc = Html::parse_document(&body);

        let h2_sel = Selector::parse("h2").unwrap();
        let task_list_sel = Selector::parse(".task-list").unwrap();
        let task_sel = Selector::parse(".task").unwrap();
        let link_sel = Selector::parse("a").unwrap();
        let score_sel = Selector::parse(".detail").unwrap();

        let mut problems = Vec::new();
        let categories: Vec<_> = doc.select(&h2_sel).collect();
        let task_lists: Vec<_> = doc.select(&task_list_sel).collect();

        for (cat_el, list_el) in categories.iter().zip(task_lists.iter()) {
            let category = cat_el.text().collect::<String>().trim().to_string();

            for task in list_el.select(&task_sel) {
                let name_and_link = task.select(&link_sel).next();
                let (name, task_id, url) = match name_and_link {
                    Some(a) => {
                        let name = a.text().collect::<String>().trim().to_string();
                        let href = a.value().attr("href").unwrap_or("");
                        let task_id = href
                            .rsplit('/')
                            .next()
                            .unwrap_or("")
                            .to_string();
                        let url = format!("{CSES_BASE}{href}");
                        (name, task_id, url)
                    }
                    None => continue,
                };

                let solved_count = task
                    .select(&score_sel)
                    .next()
                    .map(|el| {
                        el.text()
                            .collect::<String>()
                            .trim()
                            .replace(['×', 'x', ' '], "")
                            .parse::<u64>()
                            .ok()
                    })
                    .flatten();

                let difficulty = estimate_cses_difficulty(&category, &task_id);

                problems.push(Problem {
                    platform: Platform::Cses,
                    id: task_id,
                    name,
                    url,
                    rating: difficulty,
                    tags: vec![category.clone()],
                    category: Some(category.clone()),
                    solved_count,
                    status: SolveStatus::Unsolved,
                });
            }
        }

        Ok(problems)
    }
}

/// Pull example tests from a CSES task page. CSES renders each example block
/// as a `<pre>` element inside the content area, ordered input then output.
fn parse_cses_samples(body: &str) -> Vec<TestCase> {
    let doc = Html::parse_document(body);
    let pre_sel = Selector::parse(".content pre, .md pre").unwrap();

    let pres: Vec<String> = doc
        .select(&pre_sel)
        .map(pre_text)
        .filter(|s| !s.trim().is_empty())
        .collect();

    pres.chunks(2)
        .filter(|pair| pair.len() == 2)
        .map(|pair| TestCase {
            input: pair[0].clone(),
            expected_output: pair[1].clone(),
            input_block_sizes: Vec::new(),
            output_block_sizes: Vec::new(),
            input_output_offset: 0,
        })
        .collect()
}

fn estimate_cses_difficulty(category: &str, _task_id: &str) -> Option<u32> {
    match category {
        "Introductory Problems" => Some(800),
        "Sorting and Searching" => Some(1200),
        "Dynamic Programming" => Some(1400),
        "Graph Algorithms" => Some(1500),
        "Range Queries" => Some(1600),
        "Tree Algorithms" => Some(1700),
        "Mathematics" => Some(1600),
        "String Algorithms" => Some(1700),
        "Geometry" => Some(1800),
        "Advanced Techniques" => Some(1900),
        "Additional Problems" => Some(1800),
        _ => None,
    }
}

impl PlatformClient for CsesClient {
    fn platform(&self) -> Platform {
        Platform::Cses
    }

    async fn fetch_problems(&self) -> Result<Vec<Problem>> {
        self.scrape_problem_list().await
    }

    async fn fetch_submissions(&self, _handle: &str) -> Result<Vec<Submission>> {
        Ok(Vec::new())
    }

    async fn fetch_rating_history(&self, _handle: &str) -> Result<Vec<RatingChange>> {
        Ok(Vec::new())
    }

    async fn fetch_contests(&self) -> Result<Vec<Contest>> {
        Ok(Vec::new())
    }
}
