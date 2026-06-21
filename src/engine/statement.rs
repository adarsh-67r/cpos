//! Parse captured problem-statement HTML into semantic blocks for the TUI.
//!
//! The browser companion keeps the same sanitized HTML used by the VS Code
//! Statement tab. The terminal renderer consumes these blocks so headings,
//! constraints, lists, code, formulas, samples, and diagrams keep their roles
//! instead of becoming one flat paragraph.

use scraper::{ElementRef, Html, node::Node};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatementDocument {
    pub blocks: Vec<StatementBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StatementBlock {
    Title(String),
    Meta(String),
    Heading(String),
    Paragraph(String),
    Math(String),
    ListItem { text: String, ordered: bool },
    Code(String),
    Image { url: String, alt: String },
}

pub fn parse(html: &str, page_url: &str) -> StatementDocument {
    let fragment = Html::parse_fragment(html);
    let mut blocks = Vec::new();

    for child in fragment.tree.root().children() {
        if let Some(element) = ElementRef::wrap(child) {
            parse_element(element, page_url, false, &mut blocks);
        }
    }

    compact(&mut blocks);
    StatementDocument { blocks }
}

fn parse_element(
    element: ElementRef<'_>,
    page_url: &str,
    meta_list: bool,
    blocks: &mut Vec<StatementBlock>,
) {
    let tag = element.value().name();
    if matches!(tag, "script" | "style" | "noscript" | "link") {
        return;
    }

    let classes: Vec<&str> = element.value().classes().collect();
    let in_markdown = element
        .ancestors()
        .filter_map(ElementRef::wrap)
        .any(|ancestor| ancestor.value().classes().any(|class| class == "md"));
    if classes
        .iter()
        .any(|class| matches!(*class, "input-file" | "output-file" | "sample-tests"))
    {
        return;
    }

    if tag == "img" {
        push_image(element, page_url, blocks);
        return;
    }

    if tag == "pre" {
        let text = pre_text(element);
        if !text.trim().is_empty() {
            blocks.push(StatementBlock::Code(text));
        }
        return;
    }

    let text = normalized_text(element);
    let is_title = classes.contains(&"title")
        || tag == "h1" && !in_markdown && !classes.contains(&"section-title");
    let is_heading = classes.contains(&"section-title")
        || matches!(tag, "h2" | "h3" | "h4" | "h5" | "h6")
        || tag == "h1" && in_markdown;
    let is_meta = classes
        .iter()
        .any(|class| matches!(*class, "time-limit" | "memory-limit" | "input-file" | "output-file"));

    if is_title {
        push_text(blocks, StatementBlock::Title, text);
        return;
    }
    if is_meta {
        push_text(blocks, StatementBlock::Meta, text);
        return;
    }
    if is_heading {
        push_text(blocks, StatementBlock::Heading, text);
        return;
    }
    if tag == "li" {
        if meta_list {
            push_text(blocks, StatementBlock::Meta, text);
        } else {
            let ordered = element
                .ancestors()
                .filter_map(ElementRef::wrap)
                .any(|ancestor| ancestor.value().name() == "ol");
            if !text.is_empty() {
                blocks.push(StatementBlock::ListItem {
                    text: terminal_math(&text),
                    ordered,
                });
            }
        }
        for image in element.select(&scraper::Selector::parse("img").unwrap()) {
            push_image(image, page_url, blocks);
        }
        return;
    }
    if tag == "p" {
        push_paragraph(blocks, text);
        for image in element.select(&scraper::Selector::parse("img").unwrap()) {
            push_image(image, page_url, blocks);
        }
        return;
    }
    if tag == "tr" {
        let cells: Vec<String> = element
            .children()
            .filter_map(ElementRef::wrap)
            .filter(|cell| matches!(cell.value().name(), "th" | "td"))
            .map(normalized_text)
            .filter(|cell| !cell.is_empty())
            .collect();
        if !cells.is_empty() {
            push_paragraph(blocks, cells.join("  │  "));
        }
        return;
    }

    let child_meta_list =
        meta_list || classes.contains(&"task-constraints") || classes.contains(&"legend");
    let child_elements: Vec<_> = element
        .children()
        .filter_map(ElementRef::wrap)
        .collect();
    let has_structural_child = child_elements.iter().any(|child| {
        let name = child.value().name();
        matches!(
            name,
            "div"
                | "section"
                | "article"
                | "header"
                | "p"
                | "pre"
                | "ul"
                | "ol"
                | "li"
                | "table"
                | "tr"
                | "h1"
                | "h2"
                | "h3"
                | "h4"
                | "h5"
                | "h6"
                | "img"
        )
    });

    if !has_structural_child && !text.is_empty() {
        push_paragraph(blocks, text);
        return;
    }

    for child in child_elements {
        parse_element(child, page_url, child_meta_list, blocks);
    }
}

fn push_text(
    blocks: &mut Vec<StatementBlock>,
    constructor: impl FnOnce(String) -> StatementBlock,
    text: String,
) {
    if !text.is_empty() {
        blocks.push(constructor(terminal_math(&text)));
    }
}

fn push_paragraph(blocks: &mut Vec<StatementBlock>, text: String) {
    if text.is_empty() {
        return;
    }
    let mut rest = text.as_str();
    while let Some(start) = rest.find("$$$$$$") {
        let before = rest[..start].trim();
        if !before.is_empty() {
            blocks.push(StatementBlock::Paragraph(terminal_math(before)));
        }
        let after_open = &rest[start + 6..];
        let Some(end) = after_open.find("$$$$$$") else {
            blocks.push(StatementBlock::Paragraph(terminal_math(&rest[start..])));
            return;
        };
        let latex = after_open[..end].trim();
        if !latex.is_empty() {
            blocks.push(StatementBlock::Math(latex.to_string()));
        }
        rest = &after_open[end + 6..];
    }
    if let Some(latex) = standalone_math(rest) {
        blocks.push(StatementBlock::Math(latex.to_string()));
    } else if !rest.trim().is_empty() {
        blocks.push(StatementBlock::Paragraph(terminal_math(rest.trim())));
    }
}

fn standalone_math(text: &str) -> Option<&str> {
    let text = text.trim();
    if text.starts_with("$$$$$$") && text.ends_with("$$$$$$") && text.len() > 12 {
        return Some(text[6..text.len() - 6].trim());
    }
    if text.starts_with("$$") && text.ends_with("$$") && text.len() > 4 {
        return Some(text[2..text.len() - 2].trim());
    }
    if text.starts_with("\\[") && text.ends_with("\\]") && text.len() > 4 {
        return Some(text[2..text.len() - 2].trim());
    }
    None
}

fn push_image(element: ElementRef<'_>, page_url: &str, blocks: &mut Vec<StatementBlock>) {
    let Some(src) = element
        .value()
        .attr("src")
        .or_else(|| element.value().attr("data-src"))
    else {
        return;
    };
    let Some(url) = resolve_url(page_url, src) else {
        return;
    };
    let alt = element
        .value()
        .attr("alt")
        .or_else(|| element.value().attr("title"))
        .unwrap_or("statement diagram")
        .trim()
        .to_string();
    blocks.push(StatementBlock::Image { url, alt });
}

fn resolve_url(page_url: &str, source: &str) -> Option<String> {
    let source = source.trim();
    if source.is_empty() || source.starts_with("data:") {
        return None;
    }
    if source.starts_with("//") {
        return Some(format!("https:{source}"));
    }
    reqwest::Url::parse(page_url)
        .ok()?
        .join(source)
        .ok()
        .map(Into::into)
}

fn normalized_text(element: ElementRef<'_>) -> String {
    element
        .text()
        .flat_map(str::split_whitespace)
        .collect::<Vec<_>>()
        .join(" ")
}

fn pre_text(element: ElementRef<'_>) -> String {
    let mut out = String::new();
    for edge in element.traverse() {
        if let ego_tree::iter::Edge::Open(node) = edge {
            match node.value() {
                Node::Text(text) => out.push_str(&text.replace("\r\n", "\n").replace('\r', "\n")),
                Node::Element(el) if el.name() == "br" => out.push('\n'),
                _ => {}
            }
        }
    }
    out.trim_matches('\n').to_string()
}

/// Make common competitive-programming TeX readable in a terminal while
/// retaining unknown commands verbatim rather than silently changing meaning.
pub fn terminal_math(text: &str) -> String {
    let replacements = [
        ("\\leq", "≤"),
        ("\\le", "≤"),
        ("\\geq", "≥"),
        ("\\ge", "≥"),
        ("\\neq", "≠"),
        ("\\times", "×"),
        ("\\cdot", "·"),
        ("\\ldots", "…"),
        ("\\dots", "…"),
        ("\\infty", "∞"),
        ("\\rightarrow", "→"),
        ("\\leftarrow", "←"),
        ("\\sum", "Σ"),
        ("\\oplus", "⊕"),
        ("\\in", "∈"),
    ];
    let mut out = render_inline_math(text)
        .replace("$$$$$$", "")
        .replace("$$$", "")
        .replace("$$", "")
        .replace("\\[", "")
        .replace("\\]", "")
        .replace("\\left", "")
        .replace("\\right", "");
    for (from, to) in replacements {
        out = out.replace(from, to);
    }
    out
}

fn render_inline_math(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    loop {
        let paren = rest.find("\\(").map(|start| (start, "\\(", "\\)"));
        let polygon = rest.find("$$$").and_then(|start| {
            if rest[start..].starts_with("$$$$$$") {
                None
            } else {
                Some((start, "$$$", "$$$"))
            }
        });
        let Some((start, open, close)) = (match (paren, polygon) {
            (Some(paren), Some(polygon)) => Some(if paren.0 <= polygon.0 {
                paren
            } else {
                polygon
            }),
            (Some(paren), None) => Some(paren),
            (None, Some(polygon)) => Some(polygon),
            (None, None) => None,
        }) else {
            break;
        };

        out.push_str(&rest[..start]);
        let after = &rest[start + open.len()..];
        let Some(end) = after.find(close) else {
            out.push_str(&rest[start..]);
            return out;
        };
        out.push_str(&render_latex_inline(&after[..end]));
        rest = &after[end + close.len()..];
    }
    out.push_str(rest);
    out
}

fn render_latex_inline(latex: &str) -> String {
    let normalized = normalize_latex_aliases(latex);
    tui_math::render_latex(&normalized)
        .ok()
        .filter(|rendered| rendered.lines().count() == 1 && !rendered.contains("[PARSE ERROR"))
        .unwrap_or_else(|| basic_math_fallback(latex))
        .trim()
        .to_string()
}

fn normalize_latex_aliases(latex: &str) -> String {
    let mut out = latex.to_string();
    for (short, canonical) in [
        ("\\le", "\\leq"),
        ("\\ge", "\\geq"),
        ("\\ne", "\\neq"),
    ] {
        out = replace_latex_command(&out, short, canonical);
    }
    out
}

fn replace_latex_command(text: &str, command: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(command) {
        out.push_str(&rest[..start]);
        let after = &rest[start + command.len()..];
        if after
            .chars()
            .next()
            .is_some_and(|next| next.is_ascii_alphabetic())
        {
            out.push_str(command);
        } else {
            out.push_str(replacement);
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

fn basic_math_fallback(latex: &str) -> String {
    let mut out = latex.to_string();
    for (from, to) in [
        ("\\leq", "≤"),
        ("\\le", "≤"),
        ("\\geq", "≥"),
        ("\\ge", "≥"),
        ("\\neq", "≠"),
        ("\\ne", "≠"),
        ("\\times", "×"),
        ("\\cdot", "·"),
        ("\\ldots", "…"),
        ("\\dots", "…"),
        ("\\oplus", "⊕"),
    ] {
        out = out.replace(from, to);
    }
    out
}

fn compact(blocks: &mut Vec<StatementBlock>) {
    blocks.retain(|block| match block {
        StatementBlock::Title(text)
        | StatementBlock::Meta(text)
        | StatementBlock::Heading(text)
        | StatementBlock::Paragraph(text)
        | StatementBlock::Math(text)
        | StatementBlock::Code(text) => !text.trim().is_empty(),
        StatementBlock::ListItem { text, .. } => !text.trim().is_empty(),
        StatementBlock::Image { url, .. } => !url.is_empty(),
    });
    blocks.dedup();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_semantic_sections_math_code_and_images() {
        let html = r#"
          <div class="problem-statement">
            <div class="header">
              <div class="title">A. Watermelon</div>
              <div class="time-limit"><div class="property-title">time limit</div>1 second</div>
            </div>
            <p>Choose two <b>positive</b> parts where \(a \leq b\).</p>
            <div class="input-specification">
              <div class="section-title">Input</div>
              <p>An integer \(w\).</p>
            </div>
            <ul><li>first condition</li><li>second condition</li></ul>
            <pre>if (w % 2 == 0) {
  ok();
}</pre>
            <img src="/images/example.png" alt="graph" />
          </div>
        "#;
        let doc = parse(html, "https://codeforces.com/problemset/problem/4/A");

        assert!(doc.blocks.contains(&StatementBlock::Title("A. Watermelon".into())));
        assert!(doc.blocks.contains(&StatementBlock::Meta("time limit 1 second".into())));
        assert!(doc.blocks.contains(&StatementBlock::Heading("Input".into())));
        assert!(doc.blocks.iter().any(|block| matches!(
            block,
            StatementBlock::Paragraph(text) if text.contains("a ≤ b")
        )));
        assert!(doc.blocks.iter().any(|block| matches!(
            block,
            StatementBlock::Code(text) if text.contains("  ok();")
        )));
        assert!(doc.blocks.contains(&StatementBlock::Image {
            url: "https://codeforces.com/images/example.png".into(),
            alt: "graph".into(),
        }));
    }

    #[test]
    fn skips_scripts_and_captured_sample_markup() {
        let doc = parse(
            "<p>Hello</p><script>bad()</script><div class='sample-tests'>duplicate</div><p>World</p>",
            "https://example.com/problem",
        );
        assert_eq!(
            doc.blocks,
            vec![
                StatementBlock::Paragraph("Hello".into()),
                StatementBlock::Paragraph("World".into())
            ]
        );
    }

    #[test]
    fn renders_inline_math_and_keeps_display_math_structured() {
        let doc = parse(
            r#"<p>\(x^2 \leq y\)</p><p>$$\frac{a+b}{c}$$</p>"#,
            "https://example.com/problem",
        );
        assert!(matches!(
            &doc.blocks[0],
            StatementBlock::Paragraph(text) if text.contains('²') && text.contains('≤')
        ));
        assert_eq!(
            doc.blocks[1],
            StatementBlock::Math(r"\frac{a+b}{c}".to_string())
        );
    }

    #[test]
    fn treats_cses_markdown_h1_elements_as_sections() {
        let doc = parse(
            r#"<div class="md"><h1>Input</h1><p>The first line contains \(n\).</p><h1>Output</h1></div>"#,
            "https://cses.fi/problemset/task/1068",
        );
        assert_eq!(doc.blocks[0], StatementBlock::Heading("Input".to_string()));
        assert_eq!(
            doc.blocks[2],
            StatementBlock::Heading("Output".to_string())
        );
    }

    #[test]
    fn renders_legacy_codeforces_triple_dollar_inline_math() {
        let doc = parse(
            r#"<p>The first line contains a single integer $$$t$$$ $$$(1 \le t \le 10^4)$$$ — the number of test cases.</p>"#,
            "https://codeforces.com/problemset/problem/2236/C",
        );
        let StatementBlock::Paragraph(text) = &doc.blocks[0] else {
            panic!("expected paragraph");
        };
        assert_eq!(
            text,
            "The first line contains a single integer t (1 ≤ t ≤ 10⁴) — the number of test cases."
        );
        assert!(!text.contains('$'));
    }

    #[test]
    fn splits_legacy_codeforces_six_dollar_display_math() {
        let doc = parse(
            r#"<p>The condition is: $$$$$$ \frac{a+b}{c} \geq x $$$$$$ after simplification.</p>"#,
            "https://codeforces.com/problemset/problem/1/A",
        );
        assert_eq!(
            doc.blocks,
            vec![
                StatementBlock::Paragraph("The condition is:".to_string()),
                StatementBlock::Math(r"\frac{a+b}{c} \geq x".to_string()),
                StatementBlock::Paragraph("after simplification.".to_string()),
            ]
        );
    }
}
