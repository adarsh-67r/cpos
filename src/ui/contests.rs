use chrono::Utc;
use ratatui::prelude::*;
use ratatui::widgets::*;

use crate::app::App;
use crate::data::models::ContestPhase;

pub fn draw(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let block = t.panel("Contests");

    if app.contests.is_empty() {
        let msg = if app.loading {
            "  Fetching contests…"
        } else {
            "  No contests cached yet — syncing in the background…"
        };
        frame.render_widget(
            Paragraph::new(msg)
                .style(Style::default().fg(t.dim))
                .block(block),
            area,
        );
        return;
    }

    let body = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(1)])
        .split(area);
    let table_area = body[0];
    let help_area = body[1];

    let header = Row::new(vec![
        Cell::from(" When"),
        Cell::from("Contest"),
        Cell::from("Length"),
        Cell::from("Starts (UTC)"),
    ])
    .style(t.header_style());

    let visible = (table_area.height.saturating_sub(3)) as usize;
    let start = if app.contest_selected >= visible {
        app.contest_selected - visible + 1
    } else {
        0
    };

    let now = Utc::now();
    let rows: Vec<Row> = app
        .contests
        .iter()
        .enumerate()
        .skip(start)
        .take(visible)
        .map(|(i, c)| {
            let selected = i == app.contest_selected;
            let marker = if selected { "▸ " } else { "  " };

            let (when_text, when_color) = match c.phase {
                ContestPhase::Running => ("● LIVE".to_string(), t.danger),
                ContestPhase::Before => (format!("in {}", humanize(c.start_time - now)), t.success),
                ContestPhase::Finished => (format!("{} ago", humanize(now - c.start_time)), t.dim),
            };

            let base = if selected {
                t.selection()
            } else {
                Style::default().fg(t.fg)
            };

            Row::new(vec![
                Cell::from(format!("{marker}{when_text}")).style(Style::default().fg(when_color)),
                Cell::from(c.name.clone()),
                Cell::from(fmt_duration(c.duration_seconds))
                    .style(Style::default().fg(t.accent_dim)),
                Cell::from(c.start_time.format("%b %d, %H:%M").to_string())
                    .style(Style::default().fg(t.dim)),
            ])
            .style(base)
        })
        .collect();

    let widths = [
        Constraint::Length(14),
        Constraint::Min(30),
        Constraint::Length(8),
        Constraint::Length(16),
    ];

    let table = Table::new(rows, widths).header(header).block(block);
    frame.render_widget(table, table_area);

    let help = Paragraph::new(Line::from(vec![
        Span::styled(
            format!("  {}/{}  ", app.contest_selected + 1, app.contests.len()),
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
        Span::styled("solve its problems   ", Style::default().fg(t.dim)),
        Span::styled(
            "b ",
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        ),
        Span::styled("open in browser", Style::default().fg(t.dim)),
    ]));
    frame.render_widget(help, help_area);
}

/// Human-friendly duration like "2d 3h", "5h 10m", or "45m".
fn humanize(d: chrono::Duration) -> String {
    let secs = d.num_seconds().max(0);
    let days = secs / 86_400;
    let hours = (secs % 86_400) / 3_600;
    let mins = (secs % 3_600) / 60;
    if days > 0 {
        format!("{days}d {hours}h")
    } else if hours > 0 {
        format!("{hours}h {mins}m")
    } else {
        format!("{mins}m")
    }
}

/// Contest length as "H:MM".
fn fmt_duration(seconds: u64) -> String {
    let hours = seconds / 3_600;
    let mins = (seconds % 3_600) / 60;
    format!("{hours}:{mins:02}")
}
