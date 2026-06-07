use ratatui::prelude::*;
use ratatui::widgets::*;

use crate::app::{language_display, App, SetupStep, TemplateInput, LANGUAGES};

pub fn draw(frame: &mut Frame, app: &App) {
    let t = &app.theme;
    let height = if app.setup_step == SetupStep::Template {
        78
    } else {
        60
    };
    let area = centered_rect(72, height, frame.area());
    frame.render_widget(Clear, area);

    let block = t.panel_accent("Welcome to CPOS · Quick Setup");
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2), // step indicator
            Constraint::Min(6),    // body
            Constraint::Length(2), // hints
        ])
        .split(inner);

    frame.render_widget(step_indicator(app), rows[0]);
    draw_body(frame, app, rows[1]);
    frame.render_widget(
        Paragraph::new(hint_line(app)).wrap(Wrap { trim: true }),
        rows[2],
    );
}

fn step_indicator(app: &App) -> Paragraph<'static> {
    let t = &app.theme;
    let steps = [
        (SetupStep::Handle, "1 Handle"),
        (SetupStep::Language, "2 Language"),
        (SetupStep::Template, "3 Template"),
        (SetupStep::Cses, "4 CSES"),
    ];
    let mut spans = vec![Span::raw(" ")];
    for (i, (step, label)) in steps.iter().enumerate() {
        if i > 0 {
            spans.push(Span::styled("  →  ", Style::default().fg(t.border)));
        }
        let style = if *step == app.setup_step {
            Style::default().fg(t.accent).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(t.dim)
        };
        spans.push(Span::styled(label.to_string(), style));
    }
    Paragraph::new(Line::from(spans))
}

fn draw_body(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    match app.setup_step {
        SetupStep::Handle => {
            let lines = vec![
                Line::from(Span::styled(
                    "Enter your Codeforces handle so CPOS can sync your",
                    Style::default().fg(t.fg),
                )),
                Line::from(Span::styled(
                    "solves, rating, and recommendations.",
                    Style::default().fg(t.fg),
                )),
                Line::from(""),
                Line::from(vec![
                    Span::styled("  handle  ", Style::default().fg(t.dim)),
                    Span::styled(
                        format!("{}_", app.setup_handle),
                        Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
                    ),
                ]),
            ];
            frame.render_widget(Paragraph::new(lines), area);
        }
        SetupStep::Language => {
            let mut lines = vec![
                Line::from(Span::styled(
                    "Pick your default language for new solution files.",
                    Style::default().fg(t.fg),
                )),
                Line::from(Span::styled(
                    "Use ←/→ to browse — all of these compile and run locally.",
                    Style::default().fg(t.dim),
                )),
                Line::from(""),
            ];
            // Lay the languages out in rows of four, highlighting the choice.
            for chunk in LANGUAGES.chunks(4) {
                let mut spans = vec![Span::raw("  ")];
                for lang in chunk {
                    let label = language_display(lang);
                    if *lang == app.setup_lang {
                        spans.push(Span::styled(
                            format!(" ▸ {label} "),
                            Style::default().fg(t.bg).bg(t.accent).add_modifier(Modifier::BOLD),
                        ));
                    } else {
                        spans.push(Span::styled(format!("   {label} "), Style::default().fg(t.dim)));
                    }
                    spans.push(Span::raw("  "));
                }
                lines.push(Line::from(spans));
            }
            frame.render_widget(Paragraph::new(lines), area);
        }
        SetupStep::Template => draw_template_step(frame, app, area),
        SetupStep::Cses => {
            let connected = !app.setup_cses.trim().is_empty();
            let mut body = vec![
                Line::from(Span::styled(
                    "Connect CSES (optional) to sync your solved problems.",
                    Style::default().fg(t.fg),
                )),
                Line::from(Span::styled(
                    "Press o to open the CSES login page, sign in, then copy",
                    Style::default().fg(t.dim),
                )),
                Line::from(Span::styled(
                    "the PHPSESSID cookie value and paste it here (⌘V).",
                    Style::default().fg(t.dim),
                )),
                Line::from(""),
            ];
            if connected {
                body.push(Line::from(vec![
                    Span::styled("  PHPSESSID  ", Style::default().fg(t.dim)),
                    Span::styled(
                        masked(&app.setup_cses),
                        Style::default().fg(t.success).add_modifier(Modifier::BOLD),
                    ),
                    Span::styled("  ✓ ready", Style::default().fg(t.success)),
                ]));
            } else {
                body.push(Line::from(Span::styled(
                    "  (not connected — you can also do this later in Config)",
                    Style::default().fg(t.dim),
                )));
            }
            frame.render_widget(Paragraph::new(body), area);
        }
    }
}

fn draw_template_step(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // mode toggle
            Constraint::Length(3), // intro / path field
            Constraint::Min(4),    // preview
        ])
        .split(area);

    // Mode toggle: [ Paste ]  Upload  (Tab to switch).
    let tab_chip = |label: &str, active: bool| {
        if active {
            Span::styled(
                format!(" {label} "),
                Style::default().fg(t.bg).bg(t.accent).add_modifier(Modifier::BOLD),
            )
        } else {
            Span::styled(format!(" {label} "), Style::default().fg(t.dim))
        }
    };
    let is_paste = app.setup_template_mode == TemplateInput::Paste;
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::raw(" "),
            tab_chip("Paste", is_paste),
            Span::styled("  ⇄  ", Style::default().fg(t.border)),
            tab_chip("Upload", !is_paste),
            Span::styled("   (Tab to switch)", Style::default().fg(t.dim)),
        ])),
        chunks[0],
    );

    let intro = match app.setup_template_mode {
        TemplateInput::Paste => vec![
            Line::from(Span::styled(
                "Copy your template, then press v to paste it here.",
                Style::default().fg(t.fg),
            )),
            Line::from(Span::styled(
                "Leave blank for the built-in template. Backspace clears.",
                Style::default().fg(t.dim),
            )),
        ],
        TemplateInput::Upload => vec![
            Line::from(Span::styled(
                "Type or paste a path to your template file, then press Enter.",
                Style::default().fg(t.fg),
            )),
            Line::from(vec![
                Span::styled("  file  ", Style::default().fg(t.dim)),
                Span::styled(
                    format!("{}_", app.setup_template_path),
                    Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
                ),
            ]),
        ],
    };
    frame.render_widget(Paragraph::new(intro), chunks[1]);

    draw_template_preview(frame, app, chunks[2]);
}

fn draw_template_preview(frame: &mut Frame, app: &App, area: Rect) {
    let t = &app.theme;
    let lines: Vec<&str> = app.setup_template.lines().collect();
    let line_count = lines.len();
    let title = if line_count == 0 {
        " template preview ".to_string()
    } else {
        format!(" template · {line_count} lines ")
    };

    let block = Block::default()
        .title(Span::styled(title, Style::default().fg(t.accent).add_modifier(Modifier::BOLD)))
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(if line_count == 0 { t.border } else { t.accent_dim }))
        .style(Style::default().bg(t.bg));

    let inner = block.inner(area);
    frame.render_widget(block, area);

    if line_count == 0 {
        let placeholder = if app.setup_template_mode == TemplateInput::Paste {
            "Press v to paste your template…"
        } else {
            "Enter a file path above, then press Enter to load…"
        };
        frame.render_widget(
            Paragraph::new(Span::styled(placeholder, Style::default().fg(t.dim)))
                .alignment(Alignment::Center),
            inner,
        );
        return;
    }

    let visible_rows = inner.height.saturating_sub(1) as usize;
    let scroll = app.setup_template_scroll as usize;
    let max_scroll = line_count.saturating_sub(visible_rows.max(1));
    let scroll = scroll.min(max_scroll);
    let code_width = inner.width.saturating_sub(5) as usize;

    let mut body = Vec::new();
    for (i, line) in lines.iter().skip(scroll).take(visible_rows).enumerate() {
        let num = scroll + i + 1;
        body.push(Line::from(vec![
            Span::styled(format!("{:>3} ", num), Style::default().fg(t.dim)),
            Span::styled(truncate_line(line, code_width), Style::default().fg(t.fg)),
        ]));
    }

    if line_count > visible_rows {
        body.push(Line::from(Span::styled(
            format!(
                "  … {} more line(s) — ↑/↓ to scroll",
                line_count.saturating_sub(scroll + visible_rows)
            ),
            Style::default().fg(t.dim),
        )));
    }

    frame.render_widget(Paragraph::new(body), inner);
}

fn truncate_line(line: &str, max_chars: usize) -> String {
    if max_chars == 0 {
        return String::new();
    }
    if line.chars().count() <= max_chars {
        return line.to_string();
    }
    let mut out: String = line.chars().take(max_chars.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn masked(s: &str) -> String {
    let s = s.trim();
    if s.len() <= 6 {
        "•".repeat(s.len())
    } else {
        format!("{}…{}", &s[..3], &s[s.len() - 3..])
    }
}

fn hint_line(app: &App) -> Line<'static> {
    let t = &app.theme;
    let key = |k: &'static str| Span::styled(k, Style::default().fg(t.accent).add_modifier(Modifier::BOLD));
    let lbl = |l: &'static str| Span::styled(l, Style::default().fg(t.dim));
    match app.setup_step {
        SetupStep::Handle => Line::from(vec![
            Span::raw(" "),
            key("Enter"),
            lbl(" continue   "),
            key("Esc"),
            lbl(" skip setup"),
        ]),
        SetupStep::Language => Line::from(vec![
            Span::raw(" "),
            key("←/→"),
            lbl(" switch   "),
            key("Enter"),
            lbl(" continue   "),
            key("Esc"),
            lbl(" skip"),
        ]),
        SetupStep::Template => match app.setup_template_mode {
            TemplateInput::Paste => Line::from(vec![
                Span::raw(" "),
                key("v"),
                lbl(" paste   "),
                key("Tab"),
                lbl(" upload mode   "),
                key("Enter"),
                lbl(" continue   "),
                key("Bksp"),
                lbl(" clear   "),
                key("Esc"),
                lbl(" skip"),
            ]),
            TemplateInput::Upload => Line::from(vec![
                Span::raw(" "),
                key("Enter"),
                lbl(" load then continue   "),
                key("Tab"),
                lbl(" paste mode   "),
                key("Bksp"),
                lbl(" edit path   "),
                key("Esc"),
                lbl(" skip"),
            ]),
        },
        SetupStep::Cses => Line::from(vec![
            Span::raw(" "),
            key("o"),
            lbl(" open login   "),
            key("Enter"),
            lbl(" finish   "),
            key("Backspace"),
            lbl(" clear"),
        ]),
    }
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(vertical[1])[1]
}
