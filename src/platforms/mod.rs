pub mod codeforces;
pub mod cses;

use anyhow::Result;
use scraper::{ElementRef, Node};

use crate::data::models::*;

/// Extract the text of a `<pre>` sample block while preserving line structure.
///
/// Different judges render samples differently: modern Codeforces wraps each
/// input line in a `div.test-example-line`, some pages use `<br>` separators,
/// and CSES uses plain text. A naive `.text()` concatenates everything and
/// drops the line breaks (turning `3\nXS\nM` into `3XSM`). This walks the
/// `<pre>`'s children and re-inserts a newline after each block element / `<br>`.
pub(crate) fn pre_text(el: ElementRef) -> String {
    let mut out = String::new();
    for child in el.children() {
        match child.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(e) => {
                let name = e.name();
                if name == "br" {
                    out.push('\n');
                } else {
                    if let Some(cref) = ElementRef::wrap(child) {
                        out.push_str(&cref.text().collect::<String>());
                    }
                    if matches!(name, "div" | "p" | "li") {
                        out.push('\n');
                    }
                }
            }
            _ => {}
        }
    }
    out.trim_matches('\n').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use scraper::{Html, Selector};

    fn pre(html: &str) -> String {
        let doc = Html::parse_fragment(html);
        let sel = Selector::parse("pre").unwrap();
        pre_text(doc.select(&sel).next().unwrap())
    }

    #[test]
    fn keeps_newlines_for_codeforces_line_divs() {
        let html = "<pre><div class=\"test-example-line\">3</div>\
            <div class=\"test-example-line\">XS</div>\
            <div class=\"test-example-line\">M XL S</div></pre>";
        assert_eq!(pre(html), "3\nXS\nM XL S");
    }

    #[test]
    fn keeps_newlines_for_br_separated() {
        assert_eq!(pre("<pre>3<br>XS<br>M XL S</pre>"), "3\nXS\nM XL S");
    }

    #[test]
    fn preserves_plain_pre_text() {
        assert_eq!(pre("<pre>3\nXS XS M XL S XS\n</pre>"), "3\nXS XS M XL S XS");
    }
}

pub trait PlatformClient {
    fn platform(&self) -> Platform;
    fn fetch_problems(&self) -> impl std::future::Future<Output = Result<Vec<Problem>>> + Send;
    fn fetch_submissions(
        &self,
        handle: &str,
    ) -> impl std::future::Future<Output = Result<Vec<Submission>>> + Send;
    fn fetch_rating_history(
        &self,
        handle: &str,
    ) -> impl std::future::Future<Output = Result<Vec<RatingChange>>> + Send;
    fn fetch_contests(&self) -> impl std::future::Future<Output = Result<Vec<Contest>>> + Send;
}
