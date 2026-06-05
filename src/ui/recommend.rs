use ratatui::prelude::*;
use ratatui::widgets::*;

use crate::app::App;

pub fn draw(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(3), Constraint::Min(5)])
        .split(area);

    // Weak-tags summary line.
    let weak_block = t.panel("Targeting Your Weak Topics");
    let weak_inner = weak_block.inner(chunks[0]);
    frame.render_widget(weak_block, chunks[0]);

    let weak_tags: Vec<_> = app
        .tag_stats
        .iter()
        .filter(|s| s.solved + s.attempted >= 3)
        .take(6)
        .collect();

    if weak_tags.is_empty() {
        frame.render_widget(
            Paragraph::new("  Sync your submissions to unlock tailored recommendations.")
                .style(Style::default().fg(t.dim)),
            weak_inner,
        );
    } else {
        let mut spans = vec![Span::raw(" ")];
        for (i, s) in weak_tags.iter().enumerate() {
            if i > 0 {
                spans.push(Span::styled("  ", Style::default()));
            }
            let total = s.solved + s.attempted;
            let rate = if total > 0 {
                (s.solved as f64 / total as f64 * 100.0) as u32
            } else {
                0
            };
            spans.push(Span::styled(s.tag.clone(), Style::default().fg(t.warning)));
            spans.push(Span::styled(
                format!(" {rate}%"),
                Style::default().fg(t.dim),
            ));
        }
        frame.render_widget(Paragraph::new(Line::from(spans)), weak_inner);
    }

    // Recommendation table.
    let block = t.panel("Recommended Problems");

    if app.recommendations.is_empty() {
        let msg =
            Paragraph::new("  Nothing yet — set your Codeforces handle in Config and press 'r'.")
                .style(Style::default().fg(t.dim))
                .block(block);
        frame.render_widget(msg, chunks[1]);
        return;
    }

    // Split off a one-line help bar so the table never collides with it.
    let body = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(1)])
        .split(chunks[1]);
    let table_area = body[0];
    let help_area = body[1];

    let header = Row::new(vec![
        Cell::from("  Problem"),
        Cell::from("Name"),
        Cell::from("Rating"),
        Cell::from("Topics"),
    ])
    .style(t.header_style());

    // Window the rows around the selection so a long list never overflows the
    // panel — it scrolls instead.
    let visible = (table_area.height.saturating_sub(3)) as usize;
    let start = if app.recommend_selected >= visible {
        app.recommend_selected - visible + 1
    } else {
        0
    };

    let rows: Vec<Row> = app
        .recommendations
        .iter()
        .enumerate()
        .skip(start)
        .take(visible)
        .map(|(i, rec)| {
            let p = &rec.problem;
            let selected = i == app.recommend_selected;
            let row_style = if selected {
                t.selection()
            } else {
                Style::default().fg(t.fg)
            };
            let marker = if selected { "▸" } else { " " };
            let topics = top_topics(p, 2);
            Row::new(vec![
                Cell::from(Line::from(vec![
                    Span::styled(format!(" {marker} "), Style::default().fg(t.accent)),
                    Span::styled(p.display_id().to_string(), Style::default().fg(t.dim)),
                ])),
                Cell::from(p.name.clone()),
                Cell::from(p.difficulty_label())
                    .style(Style::default().fg(app.theme.rating_color(p.rating))),
                Cell::from(topics).style(Style::default().fg(t.dim)),
            ])
            .style(row_style)
        })
        .collect();

    let widths = [
        Constraint::Length(12),
        Constraint::Min(20),
        Constraint::Length(8),
        Constraint::Min(16),
    ];

    let table = Table::new(rows, widths).header(header).block(block);
    frame.render_widget(table, table_area);

    let help = Paragraph::new(Line::from(vec![
        Span::styled(
            format!(
                "  {}/{}  ",
                app.recommend_selected + 1,
                app.recommendations.len()
            ),
            Style::default().fg(t.dim),
        ),
        Span::styled(
            "j/k ",
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        ),
        Span::styled("move   ", Style::default().fg(t.dim)),
        Span::styled(
            "enter/o ",
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        ),
        Span::styled("open & solve", Style::default().fg(t.dim)),
    ]));
    frame.render_widget(help, help_area);
}

/// A short, human topic string from the problem's own tags (CSES uses its
/// category). Empty when there's nothing useful to show.
fn top_topics(p: &crate::data::models::Problem, max: usize) -> String {
    if !p.tags.is_empty() {
        return p
            .tags
            .iter()
            .filter(|t| !t.trim().is_empty())
            .take(max)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
    }
    p.category.clone().unwrap_or_default()
}
