use ratatui::prelude::*;
use ratatui::widgets::*;

use crate::app::App;

fn trim_config_value(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    let tail: String = value.chars().rev().take(max.saturating_sub(1)).collect();
    format!("…{}", tail.chars().rev().collect::<String>())
}

pub fn draw(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(8),
            Constraint::Length(3),
            Constraint::Length(1),
        ])
        .split(area);

    let block = t.panel("Configuration");
    let inner = block.inner(chunks[0]);
    frame.render_widget(block, chunks[0]);

    let fields = app.config_fields();
    let mut lines: Vec<Line> = vec![Line::from("")];
    let visible_fields = ((inner.height as usize).saturating_sub(1) / 2).max(1);
    let start = if app.config_selected >= visible_fields {
        app.config_selected - visible_fields + 1
    } else {
        0
    };

    for (i, (label, value)) in fields.iter().enumerate().skip(start).take(visible_fields) {
        let is_selected = i == app.config_selected;
        let display_value = if app.config_editing && is_selected {
            format!("{}_", app.config_edit_buf)
        } else if value.is_empty() {
            "(not set)".to_string()
        } else {
            trim_config_value(value, 42)
        };

        let pointer = if is_selected { "▸ " } else { "  " };
        let label_style = if is_selected {
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(t.fg)
        };
        let value_style = if value.is_empty() && !(app.config_editing && is_selected) {
            Style::default().fg(t.dim)
        } else {
            Style::default().fg(t.accent_dim)
        };

        lines.push(Line::from(vec![
            Span::styled(format!("  {pointer}"), Style::default().fg(t.accent)),
            Span::styled(format!("{label:<22}"), label_style),
            Span::styled(display_value, value_style),
        ]));
        lines.push(Line::from(""));
    }

    frame.render_widget(Paragraph::new(lines), inner);

    // Theme preview swatch row.
    let preview_block = t.panel("Theme Preview");
    let preview_inner = preview_block.inner(chunks[1]);
    frame.render_widget(preview_block, chunks[1]);

    let swatch = Paragraph::new(Line::from(vec![
        Span::raw(" "),
        Span::styled("████ ", Style::default().fg(t.accent)),
        Span::styled("████ ", Style::default().fg(t.accent_dim)),
        Span::styled("████ ", Style::default().fg(t.success)),
        Span::styled("████ ", Style::default().fg(t.warning)),
        Span::styled("████ ", Style::default().fg(t.danger)),
        Span::styled(
            format!("  {}", app.config.theme),
            Style::default().fg(t.dim),
        ),
    ]));
    frame.render_widget(swatch, preview_inner);

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
        lbl(" select  "),
        key("enter"),
        lbl(" edit / pick  "),
        key("S"),
        lbl(" setup  "),
        key("G"),
        lbl(" connect GitHub  "),
        key("O"),
        lbl(" setup Ollama  "),
        key("L"),
        lbl(" connect CSES  "),
        key("esc"),
        lbl(" cancel"),
    ]));
    frame.render_widget(help, chunks[2]);
}
