use ratatui::prelude::*;
use ratatui::widgets::*;

use crate::app::App;
use crate::data::models::{Problem, SolveStatus};
use crate::ui::theme::Theme;

pub fn draw(frame: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(7),
            Constraint::Length(1),
        ])
        .split(area);

    draw_filter_bar(frame, app, chunks[0]);
    draw_problem_table(frame, app, chunks[1]);
    draw_detail(frame, app, chunks[2]);
    draw_help_bar(frame, app, chunks[3]);

    if app.show_test_popup {
        draw_test_popup(frame, app, area);
    }
}

fn draw_filter_bar(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let block = t.panel("Filter");
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let mut spans = vec![
        Span::styled(" platform ", Style::default().fg(t.dim)),
        Span::styled(
            app.platform_filter.label(),
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        ),
    ];

    if app.search_active || !app.search_query.is_empty() {
        spans.push(Span::styled("   search ", Style::default().fg(t.dim)));
        let cursor = if app.search_active { "_" } else { "" };
        spans.push(Span::styled(
            format!("{}{}", app.search_query, cursor),
            Style::default().fg(t.fg),
        ));
    }

    if let Some(tag) = &app.tag_filter {
        spans.push(Span::styled("   tag ", Style::default().fg(t.dim)));
        spans.push(Span::styled(tag.clone(), Style::default().fg(t.warning)));
    }

    if let Some(cid) = &app.contest_filter {
        spans.push(Span::styled("   contest ", Style::default().fg(t.dim)));
        spans.push(Span::styled(
            cid.clone(),
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        ));
    }

    if app.url_input_active {
        spans = vec![
            Span::styled(" paste problem URL ", Style::default().fg(t.dim)),
            Span::styled(
                format!("{}_", app.url_input_buf),
                Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
            ),
        ];
        frame.render_widget(Paragraph::new(Line::from(spans)), inner);
        return;
    }

    if app.rating_input_active {
        spans.push(Span::styled("   rating ", Style::default().fg(t.dim)));
        spans.push(Span::styled(
            format!("{}_", app.rating_input_buf),
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        ));
    } else if let Some(label) = app.rating_filter_label() {
        spans.push(Span::styled("   rating ", Style::default().fg(t.dim)));
        spans.push(Span::styled(label, Style::default().fg(t.success)));
    }

    spans.push(Span::styled(
        format!("   {} shown", app.filtered_problems.len()),
        Style::default().fg(t.dim),
    ));

    frame.render_widget(Paragraph::new(Line::from(spans)), inner);
}

fn draw_problem_table(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;

    let header = Row::new(vec![
        Cell::from("  Problem"),
        Cell::from("Name"),
        Cell::from("Rating"),
        Cell::from("Platform"),
    ])
    .style(t.header_style())
    .height(1);

    let visible_height = area.height.saturating_sub(3) as usize;
    let start = if app.problem_selected >= visible_height {
        app.problem_selected - visible_height + 1
    } else {
        0
    };

    let rows: Vec<Row> = app
        .filtered_problems
        .iter()
        .enumerate()
        .skip(start)
        .take(visible_height)
        .map(|(i, p)| {
            let is_selected = i == app.problem_selected;

            let (mark, mark_color) = match p.status {
                SolveStatus::Solved => ("●", t.success),
                SolveStatus::Attempted => ("◐", t.warning),
                SolveStatus::Unsolved => ("○", t.border),
            };

            let row_style = if is_selected {
                t.selection()
            } else {
                Style::default().fg(t.fg)
            };

            Row::new(vec![
                Cell::from(Line::from(vec![
                    Span::styled(format!(" {mark} "), Style::default().fg(mark_color)),
                    Span::styled(p.display_id().to_string(), Style::default().fg(t.dim)),
                ])),
                Cell::from(p.name.clone()),
                Cell::from(p.difficulty_label())
                    .style(Style::default().fg(app.theme.rating_color(p.rating))),
                Cell::from(format!("{}", p.platform)).style(Style::default().fg(t.accent_dim)),
            ])
            .style(row_style)
        })
        .collect();

    let widths = [
        Constraint::Length(12),
        Constraint::Min(24),
        Constraint::Length(8),
        Constraint::Length(12),
    ];

    let table = Table::new(rows, widths)
        .header(header)
        .block(t.panel("Problems"));

    frame.render_widget(table, area);
}

fn draw_detail(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let block = t.panel_accent("Details");
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let problem: Option<&Problem> = app.selected_problem();
    let Some(p) = problem else {
        let hint =
            Paragraph::new("  Select a problem to see details.").style(Style::default().fg(t.dim));
        frame.render_widget(hint, inner);
        return;
    };

    let solved_label = p
        .solved_count
        .map(|c| format!("{c} accepted"))
        .unwrap_or_else(|| "—".to_string());

    let lines = vec![
        Line::from(vec![
            Span::styled(
                format!(" {} ", p.display_id()),
                Style::default()
                    .fg(app.theme.rating_color(p.rating))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                p.name.clone(),
                Style::default().fg(t.fg).add_modifier(Modifier::BOLD),
            ),
        ]),
        Line::from(vec![
            Span::styled(" rating  ", Style::default().fg(t.dim)),
            Span::styled(
                p.difficulty_label(),
                Style::default().fg(app.theme.rating_color(p.rating)),
            ),
            Span::styled("    status  ", Style::default().fg(t.dim)),
            Span::styled(format!("{}", p.status), Style::default().fg(t.fg)),
            Span::styled("    ", Style::default()),
            Span::styled(solved_label, Style::default().fg(t.dim)),
        ]),
        Line::from(vec![
            Span::styled(" tags    ", Style::default().fg(t.dim)),
            Span::styled(p.tags_label(), Style::default().fg(t.accent_dim)),
        ]),
        Line::from(vec![
            Span::styled(" url     ", Style::default().fg(t.dim)),
            Span::styled(p.url.clone(), Style::default().fg(t.dim)),
        ]),
        file_line(app, p),
    ];

    frame.render_widget(Paragraph::new(lines).wrap(Wrap { trim: true }), inner);
}

/// Shows the solution file `o`/`T`/`s` all act on, and whether it exists yet.
fn file_line(app: &App, p: &Problem) -> Line<'static> {
    let t = &app.theme;
    let path = app.solution_file(p);
    let exists = path.exists();

    let state = if exists {
        ""
    } else {
        "  · press 'o' to create & open"
    };
    let color = if exists { t.success } else { t.dim };

    Line::from(vec![
        Span::styled(" file    ", Style::default().fg(t.dim)),
        Span::styled(path.display().to_string(), Style::default().fg(color)),
        Span::styled(state.to_string(), Style::default().fg(t.dim)),
    ])
}

fn draw_help_bar(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let key = |k: &'static str| {
        Span::styled(
            k,
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        )
    };
    let lbl = |l: &'static str| Span::styled(l, Style::default().fg(t.dim));

    let help = Paragraph::new(Line::from(vec![
        Span::raw(" "),
        key("j/k"),
        lbl(" move  "),
        key("o"),
        lbl(" open  "),
        key("U"),
        lbl(" url  "),
        key("T"),
        lbl(" test  "),
        key("s"),
        lbl(" submit  "),
        key("/"),
        lbl(" search  "),
        key("f"),
        lbl(" rating  "),
        key("p"),
        lbl(" platform  "),
        key("r"),
        lbl(" sync"),
    ]));
    frame.render_widget(help, area);
}

/// Centered overlay that shows local test results (or progress).
fn draw_test_popup(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let popup = centered_rect(72, 80, area);
    frame.render_widget(Clear, popup);

    let title = if app.testing {
        "Running Tests"
    } else {
        "Test Results"
    };
    let block = t.panel_accent(title);
    let inner = block.inner(popup);
    frame.render_widget(block, popup);

    let mut lines: Vec<Line> = Vec::new();

    if app.testing {
        lines.push(Line::from(Span::styled(
            "  Compiling and running against samples…",
            Style::default().fg(t.dim),
        )));
    } else if let Some(err) = &app.test_error {
        lines.push(Line::from(Span::styled(
            "  Could not run tests",
            Style::default().fg(t.danger).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::from(""));
        for l in err.lines().take(12) {
            lines.push(Line::from(Span::styled(
                format!("  {l}"),
                Style::default().fg(t.fg),
            )));
        }
    } else if let Some(results) = &app.test_results {
        let passed = results.iter().filter(|r| r.passed).count();
        let total = results.len();
        let all = passed == total;
        let (icon, color, text) = if all {
            ("✓", t.success, format!("All {total} samples passed"))
        } else {
            ("✗", t.danger, format!("{passed} of {total} samples passed"))
        };
        lines.push(Line::from(vec![
            Span::styled(
                format!(" {icon}  "),
                Style::default().fg(color).add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                text,
                Style::default().fg(color).add_modifier(Modifier::BOLD),
            ),
        ]));
        lines.push(Line::from(""));

        for r in results {
            let (mark, color) = if r.passed {
                ("✓", t.success)
            } else {
                ("✗", t.danger)
            };
            let verdict = if r.passed {
                "passed".to_string()
            } else if let Some(err) = &r.error {
                short_verdict(err)
            } else {
                "wrong answer".to_string()
            };
            lines.push(Line::from(vec![
                Span::styled(format!(" {mark} "), Style::default().fg(color)),
                Span::styled(
                    format!("Case {}", r.test_index),
                    Style::default().fg(t.fg).add_modifier(Modifier::BOLD),
                ),
                Span::styled(format!("  ·  {verdict}"), Style::default().fg(color)),
                Span::styled(format!("   {} ms", r.time_ms), Style::default().fg(t.dim)),
            ]));

            // Only expand the cases that failed, so the popup stays focused on
            // what you need to debug.
            if !r.passed {
                push_block(&mut lines, t, "input", &r.input, t.dim);
                if let Some(err) = &r.error {
                    push_block(&mut lines, t, "error", err, t.danger);
                } else {
                    push_block(&mut lines, t, "expected", &r.expected, t.success);
                    push_block(&mut lines, t, "your output", &r.actual, t.danger);
                }
                lines.push(Line::from(""));
            }
        }
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        " esc / enter to close",
        Style::default().fg(t.dim),
    )));

    frame.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }), inner);
}

/// A one-word verdict pulled from the runner's error text.
fn short_verdict(err: &str) -> String {
    let lower = err.to_lowercase();
    if lower.contains("time limit") {
        "time limit exceeded".to_string()
    } else if lower.contains("compil") {
        "compile error".to_string()
    } else {
        "runtime error".to_string()
    }
}

/// Render a labeled, indented multi-line block (input / expected / output) so
/// the user can read exactly what differed — capped so a huge sample can't
/// overflow the popup.
fn push_block(lines: &mut Vec<Line<'static>>, t: &Theme, label: &str, value: &str, color: Color) {
    const MAX_LINES: usize = 10;
    const MAX_WIDTH: usize = 60;

    lines.push(Line::from(Span::styled(
        format!("     {label}:"),
        Style::default().fg(t.dim).add_modifier(Modifier::BOLD),
    )));

    let value = value.trim_end_matches('\n');
    if value.trim().is_empty() {
        lines.push(Line::from(Span::styled(
            "       (empty)".to_string(),
            Style::default().fg(t.dim).add_modifier(Modifier::ITALIC),
        )));
        return;
    }

    let all: Vec<&str> = value.lines().collect();
    let shown = all.len().min(MAX_LINES);
    for l in all.iter().take(shown) {
        lines.push(Line::from(Span::styled(
            format!("       {}", truncate(l, MAX_WIDTH)),
            Style::default().fg(color),
        )));
    }
    if all.len() > shown {
        lines.push(Line::from(Span::styled(
            format!("       … (+{} more lines)", all.len() - shown),
            Style::default().fg(t.dim),
        )));
    }
}

fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(area);
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(vertical[1])[1]
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max.saturating_sub(1)).collect();
        format!("{truncated}…")
    }
}
