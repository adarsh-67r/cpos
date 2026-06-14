// CPOS code styling — lightweight, dependency-free syntax highlighting for the
// code blocks in Codeforces / CSES statements and editorials (MV3 forbids
// loading a highlighter from a CDN, so this is self-contained). Read-only DOM
// decoration; never touches capture/submit. Toggle from the popup ("highlight").
(function () {
  const DONE = "data-cpos-hl";

  const KEYWORDS = {
    cpp: new Set("alignas alignof and asm auto break case catch class const constexpr continue default delete do else enum explicit export extern for friend goto if inline mutable namespace new noexcept not operator or private protected public register return sizeof static static_assert struct switch template this throw try typedef typename union using virtual volatile while".split(" ")),
    py: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None".split(" ")),
    java: new Set("abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try void volatile while true false null".split(" "))
  };
  const TYPES = new Set("int long double float char bool void short unsigned signed string vector map set pair queue stack deque size_t int64_t int32_t uint64_t ll auto String boolean byte".split(" "));

  function detect(code) {
    if (/#include|std::|cout|cin|vector<|int main/.test(code)) return "cpp";
    if (/\bdef\s|\bprint\(|\bimport\s|elif\b|:\s*$|self\b/.test(code)) return "py";
    if (/public\s+class|System\.out|import java|void\s+main/.test(code)) return "java";
    return "cpp";
  }

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const span = (cls, text) => '<span class="' + cls + '">' + esc(text) + "</span>";

  // Tokenize with one ordered regex; classify by which group matched.
  function highlight(code, lang) {
    const kws = KEYWORDS[lang] || KEYWORDS.cpp;
    const lineComment = lang === "py" ? "#" : "//";
    const re = new RegExp(
      [
        "(/\\*[\\s\\S]*?\\*/)", // 1 block comment
        "(" + (lineComment === "#" ? "#" : "//") + "[^\\n]*)", // 2 line comment
        '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')', // 3 string
        "(\\b\\d[\\d.eExXa-fA-F]*\\b)", // 4 number
        "(^\\s*#[a-zA-Z]+)", // 5 preprocessor (C/C++)
        "([A-Za-z_]\\w*)" // 6 identifier
      ].join("|"),
      "gm"
    );
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) out += span("hl-com", m[1]);
      else if (m[2]) out += span("hl-com", m[2]);
      else if (m[3]) out += span("hl-str", m[3]);
      else if (m[4]) out += span("hl-num", m[4]);
      else if (m[5]) out += span("hl-pre", m[5]);
      else if (m[6]) {
        const w = m[6];
        if (kws.has(w)) out += span("hl-kw", w);
        else if (TYPES.has(w)) out += span("hl-type", w);
        else {
          // function call? next non-space char is '('
          const after = code[re.lastIndex];
          out += after === "(" ? span("hl-fn", w) : esc(w);
        }
      }
    }
    out += esc(code.slice(last));
    return out;
  }

  function blocks() {
    const sel = [
      ".problem-statement pre",
      ".ttypography pre",
      ".content pre", // CSES
      "pre.prettyprint",
      ".problemindexholder pre"
    ].join(",");
    return document.querySelectorAll(sel);
  }

  function process() {
    blocks().forEach((pre) => {
      if (pre.hasAttribute(DONE)) return;
      // Only plain-text blocks (don't mangle ones with rich child markup).
      if (pre.children.length && pre.querySelector("img,table,a")) return;
      const code = pre.textContent;
      if (!code || code.length > 20000) return;
      pre.setAttribute(DONE, "1");
      pre.classList.add("cpos-hl");
      pre.innerHTML = highlight(code, detect(code));
    });
    document.querySelectorAll(".problem-statement, .ttypography").forEach((e) => e.classList.add("cpos-math-soft"));
  }

  function unprocess() {
    document.querySelectorAll("pre.cpos-hl").forEach((pre) => {
      pre.innerHTML = esc(pre.textContent);
      pre.classList.remove("cpos-hl");
      pre.removeAttribute(DONE);
    });
  }

  let observer;
  async function sync() {
    const raw = await new Promise((res) => chrome.storage.local.get(["cpos.features"], res));
    const on = (raw["cpos.features"] || {}).highlight !== false;
    if (on) {
      process();
      if (!observer) {
        observer = new MutationObserver(() => process());
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      observer?.disconnect();
      observer = null;
      unprocess();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes["cpos.features"]) sync();
  });

  if (document.body) sync();
  else document.addEventListener("DOMContentLoaded", sync);
})();
