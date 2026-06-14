// Shared, dependency-free syntax highlighter used by the page highlighter
// (highlight.js) and the in-browser editor overlay (ide.js). Exposes
// self.CPOS_HL.highlight(code, lang) -> HTML and detect(code) -> lang.
(function (root) {
  const KEYWORDS = {
    cpp: new Set("alignas alignof and asm auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register return short signed sizeof static static_assert struct switch template this throw true try typedef typename union unsigned using virtual void volatile wchar_t while".split(" ")),
    py: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None match case".split(" ")),
    java: new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record".split(" "))
  };
  const TYPES = new Set("int long double float char bool void short unsigned signed string wstring vector map unordered_map set unordered_set multiset pair queue priority_queue stack deque list array tuple size_t int8_t int16_t int32_t int64_t uint32_t uint64_t ll ull lld pii vi vll auto String StringBuilder Integer Long Double Boolean List ArrayList HashMap HashSet TreeMap TreeSet Scanner".split(" "));

  function detect(code) {
    if (/#include|std::|cout|cin\b|->|template\s*</.test(code)) return "cpp";
    if (/\bdef\s|\bprint\(|\bimport\s|elif\b|\bself\b|:\s*\n/.test(code)) return "py";
    if (/public\s+(class|static)|System\.(out|in)|import\s+java|new\s+Scanner/.test(code)) return "java";
    return "cpp";
  }

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const span = (cls, text) => '<span class="' + cls + '">' + esc(text) + "</span>";

  function highlight(code, lang) {
    const kws = KEYWORDS[lang] || KEYWORDS.cpp;
    const lineC = lang === "py" ? "#" : "//";
    const re = new RegExp(
      [
        "(/\\*[\\s\\S]*?\\*/)",
        "(" + (lineC === "#" ? "#" : "//") + "[^\\n]*)",
        '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)',
        "(\\b0[xX][0-9a-fA-F]+\\b|\\b\\d[\\d.eE+]*\\b)",
        "(^[ \\t]*#[a-zA-Z]+)",
        "([A-Za-z_]\\w*)"
      ].join("|"),
      "gm"
    );
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      if (m.index < last) { re.lastIndex = last; continue; }
      out += esc(code.slice(last, m.index));
      last = re.lastIndex;
      if (m[1] || m[2]) out += span("hl-com", m[1] || m[2]);
      else if (m[3]) out += span("hl-str", m[3]);
      else if (m[4]) out += span("hl-num", m[4]);
      else if (m[5]) out += span("hl-pre", m[5]);
      else if (m[6]) {
        const w = m[6];
        if (kws.has(w)) out += span("hl-kw", w);
        else if (TYPES.has(w)) out += span("hl-type", w);
        else out += code[re.lastIndex] === "(" ? span("hl-fn", w) : esc(w);
      }
    }
    out += esc(code.slice(last));
    return out;
  }

  function looksLikeCode(code) {
    if (!code || code.length < 8) return false;
    return /[;{}]|#include|\bdef \b|\bclass \b|\bfor\s*\(|\bif\s*\(|\bint\b|\breturn\b|=>|::|System\.|print\(/.test(code);
  }

  root.CPOS_HL = { KEYWORDS, TYPES, detect, highlight, looksLikeCode, esc };
})(typeof self !== "undefined" ? self : this);
