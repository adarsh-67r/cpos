use std::collections::{HashMap, HashSet};

use crate::data::models::*;
use crate::engine::weakness::compute_tag_stats;

pub const DEFAULT_COUNT: usize = 30;

pub struct Recommendation {
    pub problem: Problem,
    pub reason: String,
}

/// Recommend unsolved problems to practice next.
///
/// Two regimes:
/// - **Cold start** (no accepted submissions): surface popular, well-known problems
///   around a sensible default level, spread across topics and ratings.
/// - **Warm** (history present): target weak topics at a rating just above the user's
///   current level, boost unfinished attempts, and keep the list diverse.
pub fn recommend_problems(
    submissions: &[Submission],
    all_problems: &[Problem],
    user_rating: Option<u32>,
    count: usize,
) -> Vec<Recommendation> {
    let count = count.max(1);

    let solved_ids: HashSet<String> = submissions
        .iter()
        .filter(|s| s.verdict == Verdict::Accepted)
        .map(|s| format!("{:?}:{}", s.platform, s.problem_id))
        .collect();

    let attempted_ids: HashSet<String> = submissions
        .iter()
        .map(|s| format!("{:?}:{}", s.platform, s.problem_id))
        .collect();

    let has_history = !solved_ids.is_empty();

    let tag_stats = compute_tag_stats(submissions, all_problems);
    // Tag → weakness weight in [0, 1]: 1.0 means 0% solve rate, 0.0 means mastered.
    let weak_weights: HashMap<String, f64> = tag_stats
        .iter()
        .filter(|t| t.solved + t.attempted >= 2)
        .take(10)
        .map(|t| {
            let total = (t.solved + t.attempted) as f64;
            let rate = t.solved as f64 / total;
            (t.tag.to_lowercase(), (1.0 - rate).clamp(0.0, 1.0))
        })
        .collect();

    let center = user_rating.unwrap_or(1200);
    // Practice slightly above current level; widen the band a little for more candidates.
    let target = center + 100;
    let lo = center.saturating_sub(250);
    let hi = center + 350;

    let mut scored: Vec<Scored> = Vec::new();
    for problem in all_problems {
        let key = format!("{:?}:{}", problem.platform, problem.id);
        if solved_ids.contains(&key) {
            continue;
        }
        let Some(rating) = problem.rating else {
            continue;
        };
        if rating < lo || rating > hi {
            continue;
        }

        let tags_lower: Vec<String> = problem.tags.iter().map(|t| t.to_lowercase()).collect();
        let weak_hits: Vec<(String, f64)> = tags_lower
            .iter()
            .filter_map(|t| weak_weights.get(t).map(|&w| (t.clone(), w)))
            .collect();

        let mut score = 0.0_f64;

        // Popularity — log-scaled so mega-popular problems don't dominate.
        let pop = (problem.solved_count.unwrap_or(0) as f64 + 1.0).ln();
        score += pop;

        // Closeness to the practice target rating.
        let dist = (rating as f64 - target as f64).abs();
        score += (5.0 - dist / 120.0).max(0.0);

        // Weighted weak-topic emphasis: a 0%-rate tag counts more than a 50%-rate tag.
        let weak_score: f64 = weak_hits.iter().map(|(_, w)| w * 5.0).sum();
        score += weak_score;

        // Extra nudge when a problem hits multiple weak areas at once.
        if weak_hits.len() >= 2 {
            score += 2.0;
        }

        // Unfinished problems you've already started.
        if attempted_ids.contains(&key) && !solved_ids.contains(&key) {
            score += 3.0;
        }

        // Cold start: prefer mid-tier popular problems over extreme highs/lows.
        if !has_history {
            let mid = 1200.0;
            score += (3.0 - (rating as f64 - mid).abs() / 400.0).max(0.0);
        }

        let reason = build_reason(&weak_hits, attempted_ids.contains(&key), has_history, rating);

        let primary_tag = tags_lower
            .first()
            .cloned()
            .unwrap_or_else(|| "misc".to_string());

        scored.push(Scored {
            problem: problem.clone(),
            reason,
            score,
            primary_tag,
            rating,
        });
    }

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    diversify(scored, count, has_history)
}

fn build_reason(
    weak_hits: &[(String, f64)],
    attempted: bool,
    has_history: bool,
    rating: u32,
) -> String {
    if !weak_hits.is_empty() {
        let mut hits = weak_hits.to_vec();
        hits.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let tags = hits
            .iter()
            .take(2)
            .map(|(t, _)| t.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        format!("Weak topic: {tags}")
    } else if attempted {
        "Unfinished — give it another go".to_string()
    } else if has_history {
        format!("Just above your level · {rating}")
    } else {
        format!("Popular {rating} problem")
    }
}

struct Scored {
    problem: Problem,
    reason: String,
    score: f64,
    primary_tag: String,
    rating: u32,
}

/// Greedily pick high-scoring problems while capping duplicate tags/ratings so
/// the list stays varied. Top up from the remainder if caps are too strict.
fn diversify(scored: Vec<Scored>, count: usize, has_history: bool) -> Vec<Recommendation> {
    if count == 0 || scored.is_empty() {
        return Vec::new();
    }

    let tag_cap = (count / 3).max(4);
    let rating_cap = if has_history {
        (count / 5).max(3)
    } else {
        (count / 4).max(4)
    };

    let mut tag_count: HashMap<String, usize> = HashMap::new();
    let mut rating_count: HashMap<u32, usize> = HashMap::new();
    let mut chosen: Vec<bool> = vec![false; scored.len()];
    let mut out: Vec<Recommendation> = Vec::new();

    for (i, s) in scored.iter().enumerate() {
        if out.len() >= count {
            break;
        }
        let t = tag_count.get(&s.primary_tag).copied().unwrap_or(0);
        let r = rating_count.get(&s.rating).copied().unwrap_or(0);
        if t >= tag_cap || r >= rating_cap {
            continue;
        }
        *tag_count.entry(s.primary_tag.clone()).or_insert(0) += 1;
        *rating_count.entry(s.rating).or_insert(0) += 1;
        chosen[i] = true;
        out.push(Recommendation {
            problem: s.problem.clone(),
            reason: s.reason.clone(),
        });
    }

    if out.len() < count {
        for (i, s) in scored.iter().enumerate() {
            if out.len() >= count {
                break;
            }
            if !chosen[i] {
                out.push(Recommendation {
                    problem: s.problem.clone(),
                    reason: s.reason.clone(),
                });
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn prob(id: &str, rating: u32, tags: &[&str]) -> Problem {
        Problem {
            platform: Platform::Codeforces,
            id: id.to_string(),
            name: id.to_string(),
            url: format!("https://codeforces.com/problemset/problem/{id}"),
            rating: Some(rating),
            tags: tags.iter().map(|t| t.to_string()).collect(),
            category: None,
            solved_count: Some(10_000),
            status: SolveStatus::Unsolved,
        }
    }

    #[test]
    fn prefers_weak_topic_problems() {
        let problems = vec![
            prob("1A", 800, &["math"]),
            prob("2B", 1200, &["dp"]),
            prob("3C", 1210, &["greedy"]),
        ];
        let subs = vec![Submission {
            platform: Platform::Codeforces,
            id: "1".into(),
            problem_id: "9D".into(),
            problem_name: "x".into(),
            verdict: Verdict::WrongAnswer,
            language: "cpp".into(),
            time_ms: None,
            memory_kb: None,
            submitted_at: Utc::now(),
            tags: vec!["dp".into()],
            rating: Some(1200),
        }];
        let recs = recommend_problems(&subs, &problems, Some(1100), 2);
        assert!(!recs.is_empty());
        assert!(recs.iter().any(|r| r.problem.id == "2B"));
    }

    #[test]
    fn fills_thirty_when_pool_is_large() {
        let problems: Vec<Problem> = (700u32..1300)
            .flat_map(|r| {
                (0..3).map(move |i| {
                    prob(
                        &format!("{r}{i}"),
                        r,
                        &[match i {
                            0 => "dp",
                            1 => "greedy",
                            _ => "math",
                        }],
                    )
                })
            })
            .collect();
        let recs = recommend_problems(&[], &problems, Some(924), DEFAULT_COUNT);
        assert_eq!(recs.len(), DEFAULT_COUNT);
    }

    #[test]
    fn fills_thirty_from_local_cache_if_present() {
        let cache = match crate::data::cache::Cache::open() {
            Ok(c) => c,
            Err(_) => return,
        };
        let mut problems = cache.get_problems(Platform::Codeforces).unwrap_or_default();
        problems.extend(cache.get_problems(Platform::Cses).unwrap_or_default());
        if problems.len() < 100 {
            return;
        }
        let submissions = cache.get_all_submissions().unwrap_or_default();
        let rating = cache
            .get_rating_history(Platform::Codeforces)
            .ok()
            .and_then(|h| h.last().map(|r| r.new_rating));
        let recs = recommend_problems(&submissions, &problems, rating, DEFAULT_COUNT);
        assert!(
            recs.len() >= 20,
            "expected at least 20 recommendations from real cache, got {}",
            recs.len()
        );
    }

    #[test]
    fn skips_solved_problems() {
        let problems = vec![prob("1A", 1000, &["math"])];
        let subs = vec![Submission {
            platform: Platform::Codeforces,
            id: "1".into(),
            problem_id: "1A".into(),
            problem_name: "x".into(),
            verdict: Verdict::Accepted,
            language: "cpp".into(),
            time_ms: None,
            memory_kb: None,
            submitted_at: Utc::now(),
            tags: vec![],
            rating: Some(1000),
        }];
        let recs = recommend_problems(&subs, &problems, Some(1000), 5);
        assert!(recs.is_empty());
    }
}
