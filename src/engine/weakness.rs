use std::collections::HashMap;

use crate::data::models::*;

pub fn compute_tag_stats(submissions: &[Submission], problems: &[Problem]) -> Vec<TagStats> {
    let mut tag_solved: HashMap<String, Vec<u32>> = HashMap::new();
    let mut tag_attempted: HashMap<String, u32> = HashMap::new();

    let mut solved_problems: HashMap<String, bool> = HashMap::new();
    let mut attempted_problems: HashMap<String, bool> = HashMap::new();

    for sub in submissions {
        let key = format!("{:?}:{}", sub.platform, sub.problem_id);
        if sub.verdict == Verdict::Accepted {
            solved_problems.insert(key.clone(), true);
        }
        attempted_problems.insert(key, true);
    }

    for sub in submissions {
        let key = format!("{:?}:{}", sub.platform, sub.problem_id);
        let is_solved = solved_problems.contains_key(&key);

        for tag in &sub.tags {
            let tag_lower = tag.to_lowercase();
            if is_solved {
                if let Some(rating) = sub.rating {
                    tag_solved
                        .entry(tag_lower.clone())
                        .or_default()
                        .push(rating);
                } else {
                    tag_solved.entry(tag_lower.clone()).or_default();
                }
            }
            if attempted_problems.contains_key(&key) {
                *tag_attempted.entry(tag_lower).or_insert(0) += 0;
            }
        }
    }

    let mut all_tags: HashMap<String, (u32, u32, u32, Vec<u32>)> = HashMap::new();

    for prob in problems {
        for tag in &prob.tags {
            let tag_lower = tag.to_lowercase();
            let entry = all_tags.entry(tag_lower).or_insert((0, 0, 0, Vec::new()));
            entry.2 += 1;
        }
    }

    for sub in submissions {
        let key = format!("{:?}:{}", sub.platform, sub.problem_id);
        for tag in &sub.tags {
            let tag_lower = tag.to_lowercase();
            let entry = all_tags.entry(tag_lower).or_insert((0, 0, 0, Vec::new()));
            if solved_problems.contains_key(&key) {
                entry.0 = entry.0.max(1);
                if let Some(r) = sub.rating {
                    entry.3.push(r);
                }
            } else if attempted_problems.contains_key(&key) {
                entry.1 += 1;
            }
        }
    }

    let mut solved_per_tag: HashMap<String, std::collections::HashSet<String>> = HashMap::new();
    let mut attempted_per_tag: HashMap<String, std::collections::HashSet<String>> = HashMap::new();

    for sub in submissions {
        let key = format!("{:?}:{}", sub.platform, sub.problem_id);
        for tag in &sub.tags {
            let tag_lower = tag.to_lowercase();
            if solved_problems.contains_key(&key) {
                solved_per_tag
                    .entry(tag_lower.clone())
                    .or_default()
                    .insert(key.clone());
            }
            attempted_per_tag
                .entry(tag_lower)
                .or_default()
                .insert(key.clone());
        }
    }

    let mut stats: Vec<TagStats> = Vec::new();
    let mut all_tag_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    for prob in problems {
        for tag in &prob.tags {
            all_tag_names.insert(tag.to_lowercase());
        }
    }
    for sub in submissions {
        for tag in &sub.tags {
            all_tag_names.insert(tag.to_lowercase());
        }
    }

    for tag in all_tag_names {
        let solved = solved_per_tag
            .get(&tag)
            .map(|s| s.len() as u32)
            .unwrap_or(0);
        let attempted_set = attempted_per_tag.get(&tag);
        let attempted = attempted_set
            .map(|s| s.len() as u32)
            .unwrap_or(0)
            .saturating_sub(solved);
        let total = all_tags
            .get(&tag)
            .map(|e| e.2)
            .unwrap_or(0)
            .max(solved + attempted);

        let ratings: Vec<u32> = if let Some(entry) = all_tags.get(&tag) {
            entry.3.clone()
        } else {
            Vec::new()
        };
        let avg_rating = if ratings.is_empty() {
            None
        } else {
            Some(ratings.iter().sum::<u32>() as f64 / ratings.len() as f64)
        };

        stats.push(TagStats {
            tag,
            solved,
            attempted,
            total,
            avg_rating,
        });
    }

    stats.sort_by(|a, b| {
        let rate_a = if a.solved + a.attempted > 0 {
            a.solved as f64 / (a.solved + a.attempted) as f64
        } else {
            1.0
        };
        let rate_b = if b.solved + b.attempted > 0 {
            b.solved as f64 / (b.solved + b.attempted) as f64
        } else {
            1.0
        };
        rate_a
            .partial_cmp(&rate_b)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    stats
}

pub fn find_weak_tags(tag_stats: &[TagStats], top_n: usize) -> Vec<&TagStats> {
    tag_stats
        .iter()
        .filter(|t| t.solved + t.attempted >= 3)
        .take(top_n)
        .collect()
}
