// Shared, dependency-free syntax highlighter used by the page highlighter
// (highlight.js) and the in-browser editor overlay (ide.js). Exposes
// self.CPOS_HL.highlight(code, lang) -> HTML and detect(code) -> lang.
//
// API CONTRACT (backwards-compatible, do not break):
//   highlight(code, lang) -> HTML string with .hl-* token spans
//   detect(code)          -> lang id ("cpp" | "py" | "java" | ...)
//   looksLikeCode(code)   -> bool
// Token classes emitted (matched by highlight.css / ide.css): hl-kw, hl-type,
// hl-str, hl-num, hl-com, hl-pre, hl-fn. New languages map onto the same set.
(function (root) {
  // Language ids understood by highlight(); ide.js passes "cpp","py","java".
  // Aliases keep older / IDE-side names working.
  const ALIAS = { python: "py", py3: "py", "c++": "cpp", cc: "cpp", cxx: "cpp", c: "cpp", pypy: "py", js: "js", javascript: "js", ts: "js", typescript: "js" };

  const KEYWORDS = {
    cpp: new Set("alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq".split(" ")),
    py: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None match case self cls".split(" ")),
    java: new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield sealed permits non-sealed".split(" ")),
    js: new Set("async await break case catch class const continue debugger default delete do else export extends false finally for function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield as from".split(" "))
  };

  // Common library types / aliases per family. Shared bucket keeps it simple;
  // a token only renders as a type when it isn't a keyword first.
  const TYPES = new Set([
    // C++
    "int", "long", "double", "float", "char", "bool", "void", "short", "unsigned", "signed",
    "string", "wstring", "vector", "map", "unordered_map", "set", "unordered_set", "multiset",
    "multimap", "pair", "queue", "priority_queue", "stack", "deque", "list", "forward_list",
    "array", "tuple", "bitset", "complex", "size_t", "ptrdiff_t", "ssize_t",
    "int8_t", "int16_t", "int32_t", "int64_t", "uint8_t", "uint16_t", "uint32_t", "uint64_t",
    "intmax_t", "uintmax_t", "ll", "ull", "lld", "ld", "pii", "pll", "vi", "vll", "vvi", "vb",
    "istream", "ostream", "stringstream", "ifstream", "ofstream",
    // Java
    "String", "StringBuilder", "StringBuffer", "Integer", "Long", "Double", "Float", "Boolean",
    "Character", "Byte", "Short", "Object", "List", "ArrayList", "LinkedList", "Map", "HashMap",
    "TreeMap", "LinkedHashMap", "Set", "HashSet", "TreeSet", "LinkedHashSet", "Queue", "Deque",
    "ArrayDeque", "PriorityQueue", "Stack", "Vector", "Collections", "Arrays", "Math",
    "Scanner", "BufferedReader", "InputStreamReader", "BufferedWriter", "PrintWriter",
    "StreamTokenizer", "Comparator", "Comparable", "Iterator", "Optional", "BigInteger", "BigDecimal"
  ]);

  // Builtins worth tinting like functions even without a trailing "(".
  const PY_BUILTINS = new Set("print input len range int float str list dict set tuple map filter sorted sum min max abs enumerate zip reversed any all bool ord chr open isinstance type id hash round pow divmod bin hex oct format".split(" "));

  function norm(lang) {
    if (!lang) return "cpp";
    const l = String(lang).toLowerCase();
    return ALIAS[l] || (KEYWORDS[l] ? l : "cpp");
  }

  function detect(code) {
    const c = code || "";
    // Java first: its signatures are distinctive and overlap with cpp tokens.
    if (/\b(public|private|protected)\s+(static\s+)?(class|void|int|final)\b|System\.(out|in|err)\b|import\s+java|new\s+Scanner|String\[\]\s*args|public\s+class\b/.test(c)) return "java";
    if (/#include\b|std::|\bcout\b|\bcin\b|->|template\s*<|using\s+namespace|::\w|\bvector\s*<|\bauto\b\s*&|\bnullptr\b|printf\(|scanf\(/.test(c)) return "cpp";
    if (/\bdef\s+\w|\bprint\s*\(|\bimport\s+\w|^\s*from\s+\w|\belif\b|\bself\b|\brange\s*\(|:\s*$|->\s*\w+\s*:|f"|f'/m.test(c)) return "py";
    if (/\bfunction\b|=>|\bconsole\.|\b(const|let)\s+\w+\s*=|\brequire\(|\bdocument\.|\bwindow\./.test(c)) return "js";
    return "cpp";
  }

  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ESC_MAP[c]);
  const span = (cls, text) => '<span class="' + cls + '">' + esc(text) + "</span>";

  // One master regex per highlight; alternatives are ordered so earlier (greedy
  // multi-char) constructs win. Capture-group meaning is stable across langs:
  //   1 block comment | 2 line comment | 3 string/char | 4 number
  //   5 preprocessor/decorator line | 6 identifier
  function buildRe(lang) {
    const parts = [];
    // Block comments: C-family only (Python/JS handled below differently).
    parts.push("(/\\*[\\s\\S]*?\\*/)");
    // Line comments.
    parts.push(lang === "py" ? "(#[^\\n]*)" : "(//[^\\n]*)");
    // Strings: dq, sq, plus raw/backtick. Python triple-quotes handled first.
    if (lang === "py") {
      parts.push('([rbfRBF]{0,2}"""[\\s\\S]*?"""|[rbfRBF]{0,2}\'\'\'[\\s\\S]*?\'\'\'|[rbfRBF]{0,2}"(?:\\\\.|[^"\\\\\\n])*"|[rbfRBF]{0,2}\'(?:\\\\.|[^\'\\\\\\n])*\')');
    } else if (lang === "js") {
      parts.push('("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)');
    } else {
      // C++ / Java: raw string R"(...)" then normal dq/sq.
      parts.push('(R"\\([\\s\\S]*?\\)"|@"(?:[^"]|"")*"|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\')');
    }
    // Numbers: hex, binary, floats, suffixes, separators.
    parts.push("(\\b0[xX][0-9a-fA-F']+\\b|\\b0[bB][01']+\\b|\\b\\d[\\d'._]*(?:[eE][+-]?\\d+)?[fFlLuUdD]*\\b)");
    // Preprocessor (C-family #directive) or Python/Java decorator (@name).
    if (lang === "py" || lang === "java" || lang === "js") parts.push("(^[ \\t]*@[A-Za-z_]\\w*)");
    else parts.push("(^[ \\t]*#\\s*[a-zA-Z]+)");
    // Identifier.
    parts.push("([A-Za-z_$][\\w$]*)");
    return new RegExp(parts.join("|"), "gm");
  }

  // Cache compiled regexes per lang (they are stateful via lastIndex, so we must
  // reset lastIndex before each run — done in highlight()).
  const RE_CACHE = {};
  function reFor(lang) {
    return RE_CACHE[lang] || (RE_CACHE[lang] = buildRe(lang));
  }

  function highlight(code, lang) {
    lang = norm(lang);
    const kws = KEYWORDS[lang] || KEYWORDS.cpp;
    const re = reFor(lang);
    re.lastIndex = 0;
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      // Guard against zero-width matches looping forever.
      if (re.lastIndex === m.index) { re.lastIndex++; continue; }
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
        else if (lang === "py" && PY_BUILTINS.has(w)) out += span("hl-fn", w);
        else {
          // Function call heuristic: identifier immediately followed by "(" —
          // skip optional whitespace so "foo (x)" still tints.
          let j = re.lastIndex;
          while (j < code.length && (code[j] === " " || code[j] === "\t")) j++;
          out += code[j] === "(" ? span("hl-fn", w) : esc(w);
        }
      }
    }
    out += esc(code.slice(last));
    return out;
  }

  function looksLikeCode(code) {
    if (!code || code.length < 8) return false;
    // Signals across C++/Py/Java/JS. Multiple weak signals or one strong one.
    if (/#include|using\s+namespace|std::|System\.(out|in)|public\s+class|def\s+\w+\s*\(|import\s+(java|sys|os)\b/.test(code)) return true;
    let score = 0;
    if (/[;{}]/.test(code)) score++;
    if (/\b(for|if|while|switch)\s*\(/.test(code)) score++;
    if (/\b(int|long|double|char|bool|void|float|auto|var|let|const)\b/.test(code)) score++;
    if (/\breturn\b/.test(code)) score++;
    if (/::|=>|->|\bclass\b|\bdef\b/.test(code)) score++;
    if (/\bprint\s*\(|cout|printf|System\.out/.test(code)) score++;
    return score >= 2;
  }

  root.CPOS_HL = { KEYWORDS, TYPES, ALIAS, detect, highlight, looksLikeCode, esc, norm };
})(typeof self !== "undefined" ? self : this);
