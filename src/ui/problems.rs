use ratatui::prelude::*;
use ratatui::widgets::*;
use ratatui_image::{Resize, StatefulImage};
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

use crate::app::App;
use crate::data::models::{Problem, SolveStatus, TestCase};
use crate::engine::statement::{StatementBlock, StatementDocument};
use crate::ui::theme::Theme;

pub fn draw(frame: &mut Frame, app: &mut App, area: Rect) {
    if app.statement_view_active {
        draw_statement(frame, app, area);
        return;
    }

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

    if app.tag_input_active {
        spans.push(Span::styled(
            format!("   tag ({}) [tab to toggle] ", app.tag_filter_mode.label()),
            Style::default().fg(t.dim),
        ));
        spans.push(Span::styled(
            format!("{}_", app.tag_input_buf),
            Style::default().fg(t.warning).add_modifier(Modifier::BOLD),
        ));
    } else if let Some(tag) = &app.tag_filter {
        spans.push(Span::styled(
            format!("   tag ({}) ", app.tag_filter_mode.label()),
            Style::default().fg(t.dim),
        ));
        spans.push(Span::styled(
            tag.clone(),
            Style::default().fg(t.warning),
        ));
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
        let hint = Paragraph::new("  Select a problem to see details.")
            .style(Style::default().fg(t.dim));
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
            Span::styled(p.name.clone(), Style::default().fg(t.fg).add_modifier(Modifier::BOLD)),
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
    let key = |k: &'static str| Span::styled(k, Style::default().fg(t.accent).add_modifier(Modifier::BOLD));
    let lbl = |l: &'static str| Span::styled(l, Style::default().fg(t.dim));

    let help = Paragraph::new(Line::from(vec![
        Span::raw(" "),
        key("j/k"),
        lbl(" move  "),
        key("o"),
        lbl(" open  "),
        key("v"),
        lbl(" statement  "),
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
        key("t"),
        lbl(" tag  "),
        key("p"),
        lbl(" platform  "),
        key("r"),
        lbl(" sync"),
    ]));
    frame.render_widget(help, area);
}

#[derive(Clone)]
struct PageLine {
    text: String,
    style: Style,
    alignment: Alignment,
}

enum PageItem {
    Lines(Vec<PageLine>),
    Image {
        image_index: usize,
        alt: String,
        height: u16,
    },
}

impl PageItem {
    fn height(&self) -> u16 {
        match self {
            Self::Lines(lines) => lines.len().min(u16::MAX as usize) as u16,
            Self::Image { height, .. } => *height,
        }
    }
}

fn draw_statement(frame: &mut Frame, app: &mut App, area: Rect) {
    let Some(problem) = app.selected_problem().cloned() else {
        return;
    };
    let t = app.theme;
    let title = format!("Statement — {} {}", problem.display_id(), problem.name);
    let block = t.panel_accent(&title);
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(2), Constraint::Length(1)])
        .split(inner);

    let document = app
        .statement_document
        .clone()
        .unwrap_or(StatementDocument { blocks: Vec::new() });
    let tests = crate::engine::workspace::load_tests(&app.config, &problem);
    let page = build_statement_page(&document, &tests, rows[0].width, rows[0].height, &t);
    let total_height = page
        .iter()
        .fold(0u16, |height, item| height.saturating_add(item.height()));
    let max_scroll = total_height.saturating_sub(rows[0].height);
    app.statement_scroll = app.statement_scroll.min(max_scroll);
    render_statement_page(frame, app, rows[0], &page);

    let position = if max_scroll == 0 {
        "all".to_string()
    } else {
        format!("{}%", (u32::from(app.statement_scroll) * 100 / u32::from(max_scroll)).min(100))
    };
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(" j/k ", t.title_style()),
            Span::styled("scroll   ", Style::default().fg(t.dim)),
            Span::styled("d/u ", t.title_style()),
            Span::styled("page   ", Style::default().fg(t.dim)),
            Span::styled("v/esc ", t.title_style()),
            Span::styled("back   ", Style::default().fg(t.dim)),
            Span::styled("T ", t.title_style()),
            Span::styled("run samples   ", Style::default().fg(t.dim)),
            Span::styled("b ", t.title_style()),
            Span::styled("browser   ", Style::default().fg(t.dim)),
            Span::styled(position, Style::default().fg(t.accent_dim)),
        ])),
        rows[1],
    );
}

fn build_statement_page(
    document: &StatementDocument,
    tests: &[TestCase],
    width: u16,
    viewport_height: u16,
    t: &Theme,
) -> Vec<PageItem> {
    let width = width.max(12) as usize;
    let mut items = Vec::new();
    let mut image_index = 0usize;
    let mut ordered_index = 0usize;
    let mut samples_inserted = false;

    for block in &document.blocks {
        if !samples_inserted
            && !tests.is_empty()
            && matches!(block, StatementBlock::Heading(text) if text.eq_ignore_ascii_case("note"))
        {
            append_samples(&mut items, tests, width, t);
            samples_inserted = true;
        }
        match block {
            StatementBlock::Title(text) => {
                push_spacer(&mut items);
                push_wrapped(
                    &mut items,
                    text,
                    width.saturating_sub(4),
                    Style::default().fg(t.fg).add_modifier(Modifier::BOLD),
                    Alignment::Center,
                    "",
                );
                push_spacer(&mut items);
            }
            StatementBlock::Meta(text) => push_wrapped(
                &mut items,
                text,
                width.saturating_sub(4),
                Style::default().fg(t.dim),
                Alignment::Center,
                "",
            ),
            StatementBlock::Heading(text) => {
                push_spacer(&mut items);
                push_wrapped(
                    &mut items,
                    text,
                    width,
                    Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
                    Alignment::Left,
                    "",
                );
                items.push(PageItem::Lines(vec![PageLine {
                    text: "─".repeat(width),
                    style: Style::default().fg(t.border),
                    alignment: Alignment::Left,
                }]));
            }
            StatementBlock::Paragraph(text) => {
                ordered_index = 0;
                push_wrapped(
                    &mut items,
                    text,
                    width,
                    Style::default().fg(t.fg),
                    Alignment::Left,
                    "",
                );
                push_spacer(&mut items);
            }
            StatementBlock::Math(latex) => {
                push_spacer(&mut items);
                let rendered = tui_math::render_latex(latex).unwrap_or_else(|_| latex.clone());
                let lines = rendered
                    .lines()
                    .map(|line| PageLine {
                        text: line.to_string(),
                        style: Style::default().fg(t.fg),
                        alignment: Alignment::Center,
                    })
                    .collect();
                items.push(PageItem::Lines(lines));
                push_spacer(&mut items);
            }
            StatementBlock::ListItem { text, ordered } => {
                if *ordered {
                    ordered_index += 1;
                } else {
                    ordered_index = 0;
                }
                let prefix = if *ordered {
                    format!("{ordered_index}. ")
                } else {
                    "• ".to_string()
                };
                push_wrapped(
                    &mut items,
                    text,
                    width,
                    Style::default().fg(t.fg),
                    Alignment::Left,
                    &prefix,
                );
            }
            StatementBlock::Code(code) => {
                push_spacer(&mut items);
                items.push(PageItem::Lines(code_panel(code, width, t)));
                push_spacer(&mut items);
            }
            StatementBlock::Image { alt, .. } => {
                push_spacer(&mut items);
                items.push(PageItem::Image {
                    image_index,
                    alt: alt.clone(),
                    height: viewport_height.clamp(8, 18).saturating_sub(2),
                });
                image_index += 1;
                push_spacer(&mut items);
            }
        }
    }

    if !samples_inserted && !tests.is_empty() {
        append_samples(&mut items, tests, width, t);
    }
    items
}

fn append_samples(items: &mut Vec<PageItem>, tests: &[TestCase], width: usize, t: &Theme) {
    push_spacer(items);
    push_wrapped(
        items,
        "Sample Tests",
        width,
        Style::default().fg(t.accent).add_modifier(Modifier::BOLD),
        Alignment::Left,
        "",
    );
    items.push(PageItem::Lines(vec![PageLine {
        text: "─".repeat(width),
        style: Style::default().fg(t.border),
        alignment: Alignment::Left,
    }]));
    for (index, test) in tests.iter().enumerate() {
        items.push(PageItem::Lines(sample_case(test, index + 1, width, t)));
        push_spacer(items);
    }
}

fn render_statement_page(frame: &mut Frame, app: &mut App, area: Rect, page: &[PageItem]) {
    let scroll = app.statement_scroll;
    let viewport_end = scroll.saturating_add(area.height);
    let mut virtual_y = 0u16;

    for item in page {
        let item_end = virtual_y.saturating_add(item.height());
        if item_end <= scroll {
            virtual_y = item_end;
            continue;
        }
        if virtual_y >= viewport_end {
            break;
        }

        match item {
            PageItem::Lines(lines) => {
                for (line_index, line) in lines.iter().enumerate() {
                    let row = virtual_y.saturating_add(line_index as u16);
                    if row < scroll || row >= viewport_end {
                        continue;
                    }
                    let y = area.y.saturating_add(row.saturating_sub(scroll));
                    frame.render_widget(
                        Paragraph::new(line.text.clone())
                            .style(line.style)
                            .alignment(line.alignment),
                        Rect::new(area.x, y, area.width, 1),
                    );
                }
            }
            PageItem::Image {
                image_index,
                alt,
                height,
            } => {
                let visible_top = virtual_y.max(scroll);
                let visible_bottom = item_end.min(viewport_end);
                let visible_height = visible_bottom.saturating_sub(visible_top);
                if visible_height > 0 {
                    let y = area.y.saturating_add(visible_top.saturating_sub(scroll));
                    let image_area = Rect::new(area.x, y, area.width, visible_height);
                    if let Some(statement_image) = app.statement_images.get_mut(*image_index) {
                        if let Some(protocol) = statement_image.protocol.as_mut() {
                            frame.render_stateful_widget(
                                StatefulImage::default().resize(Resize::Fit(None)),
                                image_area,
                                protocol,
                            );
                        } else {
                            let detail = statement_image
                                .error
                                .as_deref()
                                .unwrap_or("loading diagram…");
                            frame.render_widget(
                                Paragraph::new(format!("🖼  {alt}\n{detail}\n{}", statement_image.url))
                                    .style(Style::default().fg(app.theme.dim))
                                    .alignment(Alignment::Center)
                                    .wrap(Wrap { trim: true }),
                                image_area,
                            );
                        }
                    } else {
                        frame.render_widget(
                            Paragraph::new(format!("🖼  {alt}"))
                                .style(Style::default().fg(app.theme.dim))
                                .alignment(Alignment::Center),
                            image_area,
                        );
                    }
                }
                let _ = height;
            }
        }
        virtual_y = item_end;
    }
}

fn push_spacer(items: &mut Vec<PageItem>) {
    if !matches!(
        items.last(),
        Some(PageItem::Lines(lines)) if lines.len() == 1 && lines[0].text.is_empty()
    ) {
        items.push(PageItem::Lines(vec![PageLine {
            text: String::new(),
            style: Style::default(),
            alignment: Alignment::Left,
        }]));
    }
}

fn push_wrapped(
    items: &mut Vec<PageItem>,
    text: &str,
    width: usize,
    style: Style,
    alignment: Alignment,
    prefix: &str,
) {
    let lines = wrap_with_prefix(text, width.max(1), prefix)
        .into_iter()
        .map(|text| PageLine {
            text,
            style,
            alignment,
        })
        .collect();
    items.push(PageItem::Lines(lines));
}

fn wrap_with_prefix(text: &str, width: usize, prefix: &str) -> Vec<String> {
    let prefix_width = UnicodeWidthStr::width(prefix);
    let continuation = " ".repeat(prefix_width);
    let mut lines = Vec::new();
    let mut current = prefix.to_string();
    let mut current_width = prefix_width;

    for word in text.split_whitespace() {
        let word_width = UnicodeWidthStr::width(word);
        let separator = usize::from(current_width > prefix_width);
        if current_width + separator + word_width > width && current_width > prefix_width {
            lines.push(current);
            current = continuation.clone();
            current_width = prefix_width;
        }
        if current_width > prefix_width {
            current.push(' ');
            current_width += 1;
        }
        current.push_str(word);
        current_width += word_width;
    }
    if current_width > prefix_width || !prefix.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn code_panel(code: &str, width: usize, t: &Theme) -> Vec<PageLine> {
    let inner = width.saturating_sub(4).max(1);
    let mut lines = vec![PageLine {
        text: format!("┌{}┐", "─".repeat(width.saturating_sub(2))),
        style: Style::default().fg(t.border),
        alignment: Alignment::Left,
    }];
    for raw in code.lines() {
        let content = truncate_width(raw, inner);
        let padding = inner.saturating_sub(UnicodeWidthStr::width(content.as_str()));
        lines.push(PageLine {
            text: format!("│ {content}{} │", " ".repeat(padding)),
            style: Style::default().fg(t.fg).bg(t.highlight_bg),
            alignment: Alignment::Left,
        });
    }
    lines.push(PageLine {
        text: format!("└{}┘", "─".repeat(width.saturating_sub(2))),
        style: Style::default().fg(t.border),
        alignment: Alignment::Left,
    });
    lines
}

fn sample_case(test: &TestCase, number: usize, width: usize, t: &Theme) -> Vec<PageLine> {
    let mut lines = vec![PageLine {
        text: format!("Example {number}"),
        style: Style::default().fg(t.fg).add_modifier(Modifier::BOLD),
        alignment: Alignment::Left,
    }];
    if width >= 72 {
        let gap = 2usize;
        let column = (width.saturating_sub(gap)) / 2;
        let input = sample_box(
            "Input",
            &test.input,
            &test.input_block_sizes,
            0,
            column,
            t,
        );
        let output = sample_box(
            "Output",
            &test.expected_output,
            &test.output_block_sizes,
            test.input_output_offset,
            width.saturating_sub(column + gap),
            t,
        );
        let height = input.len().max(output.len());
        for row in 0..height {
            let left = input.get(row).cloned().unwrap_or_else(|| PageLine {
                text: " ".repeat(column),
                style: Style::default(),
                alignment: Alignment::Left,
            });
            let right = output.get(row).cloned().unwrap_or_else(|| PageLine {
                text: String::new(),
                style: Style::default(),
                alignment: Alignment::Left,
            });
            lines.push(PageLine {
                text: format!(
                    "{}{}{}",
                    pad_width(&left.text, column),
                    " ".repeat(gap),
                    right.text
                ),
                style: if row <= 1 { left.style } else { Style::default().fg(t.fg) },
                alignment: Alignment::Left,
            });
        }
    } else {
        lines.extend(sample_box(
            "Input",
            &test.input,
            &test.input_block_sizes,
            0,
            width,
            t,
        ));
        lines.push(PageLine {
            text: String::new(),
            style: Style::default(),
            alignment: Alignment::Left,
        });
        lines.extend(sample_box(
            "Output",
            &test.expected_output,
            &test.output_block_sizes,
            test.input_output_offset,
            width,
            t,
        ));
    }
    lines
}

fn sample_box(
    label: &str,
    text: &str,
    block_sizes: &[usize],
    block_offset: usize,
    width: usize,
    t: &Theme,
) -> Vec<PageLine> {
    let inner = width.saturating_sub(4).max(1);
    let mut result = vec![
        PageLine {
            text: label.to_uppercase(),
            style: Style::default().fg(t.dim).add_modifier(Modifier::BOLD),
            alignment: Alignment::Left,
        },
        PageLine {
            text: format!("┌{}┐", "─".repeat(width.saturating_sub(2))),
            style: Style::default().fg(t.border),
            alignment: Alignment::Left,
        },
    ];
    let mut block = 0usize;
    let mut left_in_block = block_sizes.first().copied().unwrap_or(usize::MAX);
    for raw in text.lines().chain(std::iter::once("")).take(text.lines().count().max(1)) {
        if left_in_block == 0 {
            block += 1;
            left_in_block = block_sizes.get(block).copied().unwrap_or(usize::MAX);
        }
        let visual_block = block.saturating_add(block_offset);
        let marker = if !block_sizes.is_empty() && visual_block.is_multiple_of(2) {
            "▌"
        } else {
            " "
        };
        let content = truncate_width(raw, inner.saturating_sub(1));
        let used = UnicodeWidthStr::width(content.as_str()) + 1;
        result.push(PageLine {
            text: format!(
                "│{marker}{content}{}│",
                " ".repeat(width.saturating_sub(2 + used))
            ),
            style: Style::default()
                .fg(t.fg)
                .bg(if visual_block.is_multiple_of(2) {
                    t.highlight_bg
                } else {
                    t.bg
                }),
            alignment: Alignment::Left,
        });
        left_in_block = left_in_block.saturating_sub(1);
    }
    result.push(PageLine {
        text: format!("└{}┘", "─".repeat(width.saturating_sub(2))),
        style: Style::default().fg(t.border),
        alignment: Alignment::Left,
    });
    result
}

fn truncate_width(text: &str, max_width: usize) -> String {
    if UnicodeWidthStr::width(text) <= max_width {
        return text.to_string();
    }
    let mut out = String::new();
    let target = max_width.saturating_sub(1);
    let mut width = 0usize;
    for ch in text.chars() {
        let char_width = UnicodeWidthChar::width(ch).unwrap_or(0);
        if width + char_width > target {
            break;
        }
        out.push(ch);
        width += char_width;
    }
    out.push('…');
    out
}

fn pad_width(text: &str, width: usize) -> String {
    let used = UnicodeWidthStr::width(text);
    format!("{text}{}", " ".repeat(width.saturating_sub(used)))
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
            Span::styled(format!(" {icon}  "), Style::default().fg(color).add_modifier(Modifier::BOLD)),
            Span::styled(text, Style::default().fg(color).add_modifier(Modifier::BOLD)),
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

    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: false }),
        inner,
    );
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

#[cfg(test)]
mod statement_tests {
    use super::*;

    #[test]
    fn wide_statement_samples_render_input_and_output_side_by_side() {
        let test = TestCase {
            input: "2\n1 2\n3 4".to_string(),
            expected_output: "3\n7".to_string(),
            input_block_sizes: vec![1, 2],
            output_block_sizes: vec![1, 1],
            input_output_offset: 0,
        };
        let lines = sample_case(&test, 1, 90, &Theme::default());
        let text = lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");

        assert!(text.contains("Example 1"));
        assert!(text.contains("INPUT"));
        assert!(text.contains("OUTPUT"));
        assert!(text.contains('▌'));
    }

    #[test]
    fn narrow_statement_samples_stack_columns() {
        let test = TestCase {
            input: "8".to_string(),
            expected_output: "YES".to_string(),
            input_block_sizes: Vec::new(),
            output_block_sizes: Vec::new(),
            input_output_offset: 0,
        };
        let lines = sample_case(&test, 1, 40, &Theme::default());
        let input = lines.iter().position(|line| line.text == "INPUT").unwrap();
        let output = lines.iter().position(|line| line.text == "OUTPUT").unwrap();
        assert!(output > input + 2);
    }

    #[test]
    fn samples_are_inserted_before_codeforces_note() {
        let document = StatementDocument {
            blocks: vec![
                StatementBlock::Paragraph("Solve it.".to_string()),
                StatementBlock::Heading("Note".to_string()),
                StatementBlock::Paragraph("Explanation.".to_string()),
            ],
        };
        let tests = vec![TestCase {
            input: "1".to_string(),
            expected_output: "2".to_string(),
            input_block_sizes: Vec::new(),
            output_block_sizes: Vec::new(),
            input_output_offset: 0,
        }];
        let page = build_statement_page(&document, &tests, 80, 24, &Theme::default());
        let text = page
            .iter()
            .filter_map(|item| match item {
                PageItem::Lines(lines) => Some(
                    lines
                        .iter()
                        .map(|line| line.text.as_str())
                        .collect::<Vec<_>>()
                        .join("\n"),
                ),
                PageItem::Image { .. } => None,
            })
            .collect::<Vec<_>>()
            .join("\n");
        assert!(text.find("Sample Tests").unwrap() < text.find("Note").unwrap());
    }
}
