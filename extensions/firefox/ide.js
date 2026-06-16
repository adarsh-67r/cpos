// CPOS in-browser editor — an IDE-style slide-in panel on CF/CSES problem pages.
// Resizable, pushes the page (no overlap), multiple editor colour schemes, a
// live syntax-highlight overlay (shared tokenizer), a Run console that checks
// your solution against the page's sample tests via the local CPOS runner, and
// one-click Submit. SUBMISSION REUSES the existing background "cpos-cf-submit"
// injector — it never reimplements or alters capture/submit logic.
//
// Editor UX is LeetCode-grade: current-line highlight, bracket matching with
// auto-close for brackets/quotes, auto-indent that carries indentation (extra
// after "{"/":"), in-editor find & replace (Ctrl/Cmd+F), a font-size control,
// a line-wrap toggle, and Tab=4 spaces. The Run panel renders per-test cards
// with AC/WA/TLE/RE coloring, a got-vs-expected diff, optional time/memory,
// a custom-stdin box, and an "X/Y passed" summary. Layout adds a maximize/zen
// toggle on top of the existing resizable, page-pushing side panel.
(function () {
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  const HL = self.CPOS_HL;
  const SUBMIT_KEY = "cpos.ide.submit";
  const RUNNERS = ["http://127.0.0.1:27122", "http://127.0.0.1:27121"];

  const LANGS = [
    ["cpp", "C++"], ["python", "Python 3"], ["pypy", "PyPy 3"], ["java", "Java"],
    ["kotlin", "Kotlin"], ["rust", "Rust"], ["go", "Go"], ["csharp", "C#"], ["javascript", "JavaScript"]
  ];
  const HL_LANG = { cpp: "cpp", pypy: "py", python: "py", java: "java" };
  // Languages whose blocks open with ":" (extra auto-indent after a line ending in ":").
  const COLON_INDENT = { python: true, pypy: true };
  const STARTERS = {
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n",
    python: "import sys\ninput = sys.stdin.readline\n\n",
    pypy: "import sys\ninput = sys.stdin.readline\n\n",
    java: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n\n    }\n}\n"
  };

  // IDE colour schemes for the editor surface (token colours, gutter, caret).
  const EDITOR_THEMES = {
    "vscode-dark": { name: "VS Dark+", bg: "#1e1e1e", fg: "#d4d4d4", gutter: "#858585", caret: "#aeafad", sel: "#264f7855", line: "#ffffff0d", kw: "#569cd6", type: "#4ec9b0", str: "#ce9178", num: "#b5cea8", com: "#6a9955", fn: "#dcdcaa", pre: "#c586c0", panel: "#252526", border: "#333333" },
    monokai: { name: "Monokai", bg: "#272822", fg: "#f8f8f2", gutter: "#90908a", caret: "#f8f8f0", sel: "#49483e", line: "#ffffff0a", kw: "#f92672", type: "#66d9ef", str: "#e6db74", num: "#ae81ff", com: "#75715e", fn: "#a6e22e", pre: "#f92672", panel: "#2d2e27", border: "#3b3c35" },
    dracula: { name: "Dracula", bg: "#282a36", fg: "#f8f8f2", gutter: "#6272a4", caret: "#f8f8f2", sel: "#44475a", line: "#ffffff0a", kw: "#ff79c6", type: "#8be9fd", str: "#f1fa8c", num: "#bd93f9", com: "#6272a4", fn: "#50fa7b", pre: "#ff79c6", panel: "#21222c", border: "#3a3c4e" },
    nord: { name: "Nord", bg: "#2e3440", fg: "#d8dee9", gutter: "#4c566a", caret: "#d8dee9", sel: "#434c5e", line: "#ffffff0a", kw: "#81a1c1", type: "#8fbcbb", str: "#a3be8c", num: "#b48ead", com: "#616e88", fn: "#88c0d0", pre: "#81a1c1", panel: "#3b4252", border: "#434c5e" },
    "github-light": { name: "GitHub Light", bg: "#ffffff", fg: "#24292e", gutter: "#babbbd", caret: "#24292e", sel: "#c8e1ff", line: "#0000000a", kw: "#d73a49", type: "#6f42c1", str: "#032f62", num: "#005cc5", com: "#6a737d", fn: "#6f42c1", pre: "#d73a49", panel: "#f6f8fa", border: "#d0d7de" }
  };
  const EDITOR_THEME_IDS = Object.keys(EDITOR_THEMES);

  // ---- page context -------------------------------------------------------
  const isCf = location.hostname.endsWith("codeforces.com");
  function cfCtx() {
    let m = location.pathname.match(/\/contest\/(\d+)\/problem\/([^/]+)/i);
    if (m) return { kind: "contest", contest: m[1], index: m[2].toUpperCase(), submitUrl: `/contest/${m[1]}/submit` };
    m = location.pathname.match(/\/gym\/(\d+)\/problem\/([^/]+)/i);
    if (m) return { kind: "gym", contest: m[1], index: m[2].toUpperCase(), submitUrl: `/gym/${m[1]}/submit` };
    m = location.pathname.match(/\/problemset\/problem\/(\d+)\/([^/]+)/i);
    if (m) return { kind: "problemset", contest: m[1], index: m[2].toUpperCase(), submitUrl: `/problemset/submit/${m[1]}/${m[2].toUpperCase()}` };
    return null;
  }
  function csesCtx() {
    const m = location.pathname.match(/\/problemset\/task\/(\d+)/);
    return m ? { kind: "cses", id: m[1], submitUrl: `/problemset/submit/${m[1]}/` } : null;
  }
  const ctx = isCf ? cfCtx() : csesCtx();
  const onProblemPage = !!ctx && !/\/submit/.test(location.pathname);
  const onSubmitPage = isCf && /\/submit/.test(location.pathname);
  const problemKey = () => (isCf && ctx ? `cf:${ctx.contest}${ctx.index}` : ctx && ctx.kind === "cses" ? `cses:${ctx.id}` : "p:" + location.pathname);
  const problemLabel = () => (isCf && ctx ? ctx.contest + ctx.index : ctx && ctx.kind === "cses" ? "CSES " + ctx.id : "Problem");

  // ---- storage ------------------------------------------------------------
  const sget = (k) => new Promise((r) => chrome.storage.local.get(k, (v) => r(v || {})));
  const sset = (o) => new Promise((r) => chrome.storage.local.set(o, () => r()));
  const sdel = (k) => new Promise((r) => chrome.storage.local.remove(k, () => r()));
  const codeKey = () => "cpos.ide.code." + problemKey();
  const FONT_KEY = "cpos.ide.fontSize";
  const WRAP_KEY = "cpos.ide.wrap";

  async function applyChrome(node) {
    if (!T || !C) return;
    const theme = T.get(await C.activeThemeId());
    const map = { "--cpos-bg": "--bg", "--cpos-panel": "--panel", "--cpos-panel2": "--panel-2", "--cpos-fg": "--fg", "--cpos-dim": "--dim", "--cpos-border": "--border", "--cpos-accent": "--accent" };
    for (const [out, src] of Object.entries(map)) node.style.setProperty(out, theme[src]);
  }
  function applyEditorTheme(root, id) {
    const t = EDITOR_THEMES[id] || EDITOR_THEMES["vscode-dark"];
    const v = {
      "--ed-bg": t.bg, "--ed-fg": t.fg, "--ed-gutter": t.gutter, "--ed-caret": t.caret, "--ed-sel": t.sel, "--ed-line": t.line,
      "--ed-kw": t.kw, "--ed-type": t.type, "--ed-str": t.str, "--ed-num": t.num, "--ed-com": t.com,
      "--ed-fn": t.fn, "--ed-pre": t.pre, "--ed-panel": t.panel, "--ed-border": t.border
    };
    for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val);
  }

  // ---- editor (textarea + overlay + gutter) -------------------------------
  // The editor is a transparent <textarea> stacked over a highlighted <pre>,
  // with a line-number gutter and a current-line band. This stays the proven
  // architecture; everything below augments it without replacing it.
  const OPEN_BRACKETS = { "(": ")", "[": "]", "{": "}" };
  const CLOSE_BRACKETS = { ")": "(", "]": "[", "}": "{" };
  const QUOTES = { '"': true, "'": true, "`": true };

  function mountEditor(container, initial, lang, onChange, onCursor) {
    const wrap = document.createElement("div");
    wrap.className = "cpos-ed";
    const gutter = document.createElement("div");
    gutter.className = "cpos-ed-gutter";
    const scroll = document.createElement("div");
    scroll.className = "cpos-ed-scroll";
    const lineHi = document.createElement("div");
    lineHi.className = "cpos-ed-line";
    const pre = document.createElement("pre");
    pre.className = "cpos-ed-hl";
    const ta = document.createElement("textarea");
    ta.className = "cpos-ed-ta";
    ta.spellcheck = false;
    ta.value = initial || "";
    scroll.appendChild(lineHi);
    scroll.appendChild(pre);
    scroll.appendChild(ta);
    wrap.appendChild(gutter);
    wrap.appendChild(scroll);
    container.appendChild(wrap);

    let curLang = lang;
    let wrapOn = false;
    const escape = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    function render() {
      const code = ta.value;
      pre.innerHTML = HL ? HL.highlight(code + "\n", HL_LANG[curLang] || "cpp") : escape(code + "\n");
      const lines = code.split("\n").length;
      let g = "";
      for (let i = 1; i <= lines; i++) g += i + "\n";
      gutter.textContent = g;
    }
    function syncScroll() {
      if (wrapOn) { pre.style.transform = `translateY(${-ta.scrollTop}px)`; }
      else { pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; }
      gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
      positionLine();
    }
    // Current-line band: measured from line metrics, kept in sync with scroll.
    function positionLine() {
      const cs = getComputedStyle(ta);
      const lh = parseFloat(cs.lineHeight) || 20;
      const padTop = parseFloat(cs.paddingTop) || 0;
      const before = ta.value.slice(0, ta.selectionStart);
      // Logical-line row (the band is hidden in wrap mode, where it's ambiguous).
      const row = before.split("\n").length - 1;
      lineHi.style.height = lh + "px";
      lineHi.style.transform = `translateY(${padTop + row * lh - ta.scrollTop}px)`;
    }
    function cursor() {
      const upto = ta.value.slice(0, ta.selectionStart);
      const line = upto.split("\n").length;
      const col = upto.length - upto.lastIndexOf("\n");
      onCursor && onCursor(line, col, ta.value);
      positionLine();
    }

    function emit() { render(); onChange(ta.value); cursor(); }
    function replaceRange(start, end, text, caret) {
      ta.setRangeText(text, start, end, "end");
      if (caret != null) ta.selectionStart = ta.selectionEnd = caret;
      emit();
    }

    // ---- indentation helpers ----
    function lineStartOf(pos) {
      const i = ta.value.lastIndexOf("\n", pos - 1);
      return i + 1;
    }
    function indentOfLine(pos) {
      const start = lineStartOf(pos);
      const m = ta.value.slice(start).match(/^[ \t]*/);
      return m ? m[0] : "";
    }

    function handleEnter(e) {
      const s = ta.selectionStart, en = ta.selectionEnd;
      const before = ta.value.slice(0, s);
      const lineStart = before.lastIndexOf("\n") + 1;
      const curLine = before.slice(lineStart);
      let indent = (curLine.match(/^[ \t]*/) || [""])[0];
      const trimmed = curLine.trimEnd();
      const lastCh = trimmed.slice(-1);
      const nextCh = ta.value.slice(en, en + 1);
      let extra = "";
      if (lastCh === "{" || (COLON_INDENT[curLang] && lastCh === ":")) extra = "    ";
      // Smart pair: caret sits between {} → open a body and place close on its own line.
      if (lastCh === "{" && nextCh === "}") {
        e.preventDefault();
        const insert = "\n" + indent + "    " + "\n" + indent;
        const caret = s + 1 + indent.length + 4;
        replaceRange(s, en, insert, caret);
        return true;
      }
      e.preventDefault();
      const insert = "\n" + indent + extra;
      replaceRange(s, en, insert, s + insert.length);
      return true;
    }

    function handleBackspace(e) {
      const s = ta.selectionStart, en = ta.selectionEnd;
      if (s !== en) return false;
      const prev = ta.value.slice(s - 1, s);
      const next = ta.value.slice(s, s + 1);
      // Delete an empty auto-inserted pair as a unit.
      if ((OPEN_BRACKETS[prev] && next === OPEN_BRACKETS[prev]) || (QUOTES[prev] && next === prev)) {
        e.preventDefault();
        replaceRange(s - 1, s + 1, "", s - 1);
        return true;
      }
      // Dedent: if only whitespace precedes the caret on this line, remove up to 4.
      const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
      const seg = ta.value.slice(lineStart, s);
      if (seg.length && /^[ \t]+$/.test(seg)) {
        e.preventDefault();
        const remove = Math.min(4, ((seg.length - 1) % 4) + 1);
        replaceRange(s - remove, s, "", s - remove);
        return true;
      }
      return false;
    }

    function handleTab(e) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      if (s !== en && ta.value.slice(s, en).includes("\n")) {
        // Block (de)indent across selected lines.
        const startLine = ta.value.lastIndexOf("\n", s - 1) + 1;
        const block = ta.value.slice(startLine, en);
        let out;
        if (e.shiftKey) out = block.replace(/^( {1,4}|\t)/gm, "");
        else out = block.replace(/^/gm, "    ");
        const delta = out.length - block.length;
        ta.setRangeText(out, startLine, en, "select");
        ta.selectionStart = startLine; ta.selectionEnd = en + delta;
        emit();
        return;
      }
      if (e.shiftKey) {
        const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
        const seg = ta.value.slice(lineStart, lineStart + 4);
        const m = seg.match(/^( {1,4}|\t)/);
        if (m) replaceRange(lineStart, lineStart + m[0].length, "", Math.max(lineStart, s - m[0].length));
        return;
      }
      replaceRange(s, en, "    ", s + 4);
    }

    function handleChar(e, ch) {
      const s = ta.selectionStart, en = ta.selectionEnd;
      const next = ta.value.slice(en, en + 1);
      // Type-over a matching close bracket / quote.
      if ((CLOSE_BRACKETS[ch] || QUOTES[ch]) && next === ch && s === en) {
        e.preventDefault();
        ta.selectionStart = ta.selectionEnd = s + 1;
        cursor();
        return true;
      }
      // Wrap selection in brackets/quotes.
      if (s !== en && (OPEN_BRACKETS[ch] || QUOTES[ch])) {
        e.preventDefault();
        const close = OPEN_BRACKETS[ch] || ch;
        const sel = ta.value.slice(s, en);
        ta.setRangeText(ch + sel + close, s, en, "select");
        ta.selectionStart = s + 1; ta.selectionEnd = en + 1;
        emit();
        return true;
      }
      // Auto-close: only when followed by whitespace/closer/EOL (avoids noise mid-word).
      if (OPEN_BRACKETS[ch] && (next === "" || /[\s)\]};,]/.test(next))) {
        e.preventDefault();
        replaceRange(s, en, ch + OPEN_BRACKETS[ch], s + 1);
        return true;
      }
      if (QUOTES[ch] && s === en) {
        const prev = ta.value.slice(s - 1, s);
        // Don't auto-close right after a word char (e.g. apostrophes, suffixes).
        if (next === "" || /[\s)\]};,]/.test(next)) {
          if (!/\w/.test(prev) || ch !== "'") {
            e.preventDefault();
            replaceRange(s, en, ch + ch, s + 1);
            return true;
          }
        }
      }
      return false;
    }

    ta.addEventListener("input", () => { render(); onChange(ta.value); cursor(); });
    ta.addEventListener("scroll", syncScroll);
    ta.addEventListener("keyup", cursor);
    ta.addEventListener("click", cursor);
    ta.addEventListener("select", cursor);
    ta.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave shortcuts to the panel
      if (e.key === "Tab") return handleTab(e);
      if (e.key === "Enter") return void handleEnter(e);
      if (e.key === "Backspace") return void handleBackspace(e);
      if (e.key.length === 1 && (OPEN_BRACKETS[e.key] || CLOSE_BRACKETS[e.key] || QUOTES[e.key])) handleChar(e, e.key);
    });
    render();

    return {
      el: ta,
      getValue: () => ta.value,
      setValue: (val) => { ta.value = val; render(); syncScroll(); cursor(); },
      setLang: (l) => { curLang = l; render(); },
      focus: () => ta.focus(),
      setFontSize: (px) => { wrap.style.setProperty("--ed-fs", px + "px"); render(); syncScroll(); },
      setWrap: (on) => { wrapOn = on; wrap.classList.toggle("wrap", on); render(); syncScroll(); },
      // For find & replace.
      select: (start, end) => { ta.focus(); ta.selectionStart = start; ta.selectionEnd = end; scrollToCaret(); cursor(); },
      replaceRange,
      cursorPos: () => ta.selectionStart,
      scrollToCaret
    };

    function scrollToCaret() {
      // Best-effort: scroll the line of the caret into view.
      const cs = getComputedStyle(ta);
      const lh = parseFloat(cs.lineHeight) || 20;
      const row = ta.value.slice(0, ta.selectionStart).split("\n").length - 1;
      const y = row * lh;
      if (y < ta.scrollTop) ta.scrollTop = y;
      else if (y + lh > ta.scrollTop + ta.clientHeight) ta.scrollTop = y + lh - ta.clientHeight + lh;
      syncScroll();
    }
  }

  // ---- sample scraping ----------------------------------------------------
  function scrapeSamples() {
    const tests = [];
    if (isCf) {
      document.querySelectorAll(".sample-test").forEach((st) => {
        const ins = st.querySelectorAll(".input pre");
        const outs = st.querySelectorAll(".output pre");
        const n = Math.min(ins.length, outs.length);
        for (let i = 0; i < n; i++) {
          tests.push({ input: preToText(ins[i]), expected: preToText(outs[i]) });
        }
      });
    } else {
      // CSES shows examples in <pre> pairs under the statement.
      const pres = [...document.querySelectorAll(".content pre, pre")];
      for (let i = 0; i + 1 < pres.length; i += 2) {
        tests.push({ input: pres[i].textContent.trim(), expected: pres[i + 1].textContent.trim() });
      }
    }
    return tests;
  }
  function preToText(pre) {
    // New CF renders each line as a <div>; join them with newlines.
    const divs = pre.querySelectorAll("div");
    if (divs.length) return [...divs].map((d) => d.textContent).join("\n").trim();
    return pre.textContent.trim();
  }

  // ---- panel --------------------------------------------------------------
  let panel, editor, msgEl, launch, consoleEl, statusEl, findBar, customWrap;
  let lastRunData = null;

  async function buildPanel() {
    if (document.getElementById("cpos-ide-panel")) return;
    const conf = await sget([codeKey(), "cpos.ide.lang", "cpos.ide.theme", "cpos.ide.width", FONT_KEY, WRAP_KEY]);
    const lang = conf["cpos.ide.lang"] || "cpp";
    const edThemeId = conf["cpos.ide.theme"] || "vscode-dark";
    const width = Math.max(360, Math.min(conf["cpos.ide.width"] || 640, Math.round(window.innerWidth * 0.85)));
    const fontSize = Math.max(10, Math.min(conf[FONT_KEY] || 14, 24));
    const wrapOn = !!conf[WRAP_KEY];

    launch = document.createElement("button");
    launch.id = "cpos-ide-launch";
    launch.textContent = "‹ /› EDITOR";
    launch.title = "CPOS in-browser editor";
    document.body.appendChild(launch);

    panel = document.createElement("div");
    panel.id = "cpos-ide-panel";
    panel.style.width = width + "px";
    panel.innerHTML =
      '<div class="cpos-ide-grip" title="Drag to resize"></div>' +
      '<div class="cpos-ide-head">' +
        '<span class="pid">' + problemLabel() + "</span>" +
        '<span class="grow"></span>' +
        '<select id="cpos-ide-lang" title="Language"></select>' +
        '<select id="cpos-ide-theme" title="Editor theme"></select>' +
        '<button class="ic" id="cpos-ide-find" title="Find & replace (Ctrl/Cmd+F)">⌕</button>' +
        '<button class="ic" id="cpos-ide-wrap" title="Toggle line wrap">↩</button>' +
        '<button class="ic" id="cpos-ide-fdown" title="Decrease font size">A−</button>' +
        '<button class="ic" id="cpos-ide-fup" title="Increase font size">A+</button>' +
        '<button class="ic" id="cpos-ide-zen" title="Maximize / Zen mode">⤢</button>' +
        '<button class="x" title="Close editor">✕</button>' +
      "</div>" +
      '<div class="cpos-ide-find" id="cpos-ide-findbar" hidden>' +
        '<input id="cpos-find-q" placeholder="Find" autocomplete="off" spellcheck="false">' +
        '<input id="cpos-find-r" placeholder="Replace" autocomplete="off" spellcheck="false">' +
        '<span class="fcount" id="cpos-find-count">0/0</span>' +
        '<button id="cpos-find-prev" title="Previous (Shift+Enter)">↑</button>' +
        '<button id="cpos-find-next" title="Next (Enter)">↓</button>' +
        '<button id="cpos-find-rep" title="Replace">Repl</button>' +
        '<button id="cpos-find-repall" title="Replace all">All</button>' +
        '<button id="cpos-find-x" title="Close (Esc)">✕</button>' +
      "</div>" +
      '<div class="cpos-ide-editor"><div class="cpos-ide-mount" id="cpos-ide-mount"></div></div>' +
      '<div class="cpos-ide-console" id="cpos-ide-console" hidden></div>' +
      '<div class="cpos-ide-status"><span id="cpos-ide-pos">Ln 1, Col 1</span><span class="grow"></span><span id="cpos-ide-langtag">' + lang + "</span></div>" +
      '<div class="cpos-ide-foot">' +
        '<span class="msg"></span>' +
        '<button id="cpos-ide-custom" title="Toggle a custom stdin test">Custom</button>' +
        '<button id="cpos-ide-reset" title="Reset to starter template">Reset</button>' +
        '<button id="cpos-ide-copy">Copy</button>' +
        '<button id="cpos-ide-run" title="Run against sample tests">▷ Run</button>' +
        '<button class="primary" id="cpos-ide-submit">Submit ▸</button>' +
      "</div>";
    document.body.appendChild(panel);

    await applyChrome(panel);
    await applyChrome(launch);
    applyEditorTheme(panel, edThemeId);

    const langSel = panel.querySelector("#cpos-ide-lang");
    LANGS.forEach(([id, label]) => { const o = document.createElement("option"); o.value = id; o.textContent = label; langSel.appendChild(o); });
    langSel.value = lang;
    const themeSel = panel.querySelector("#cpos-ide-theme");
    EDITOR_THEME_IDS.forEach((id) => { const o = document.createElement("option"); o.value = id; o.textContent = EDITOR_THEMES[id].name; themeSel.appendChild(o); });
    themeSel.value = edThemeId;

    msgEl = panel.querySelector(".msg");
    consoleEl = panel.querySelector("#cpos-ide-console");
    statusEl = panel.querySelector("#cpos-ide-pos");
    findBar = panel.querySelector("#cpos-ide-findbar");
    const langTag = panel.querySelector("#cpos-ide-langtag");

    const initial = conf[codeKey()] != null ? conf[codeKey()] : (STARTERS[lang] || "");
    let saveTimer = null;
    editor = mountEditor(
      panel.querySelector("#cpos-ide-mount"),
      initial,
      lang,
      (v) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => sset({ [codeKey()]: v }), 250); if (findBar && !findBar.hidden) refreshFind(); },
      (ln, col) => { statusEl.textContent = "Ln " + ln + ", Col " + col; }
    );
    editor.setFontSize(fontSize);
    editor.setWrap(wrapOn);
    panel.querySelector("#cpos-ide-wrap").classList.toggle("active", wrapOn);

    let curFont = fontSize;

    langSel.onchange = async () => {
      editor.setLang(langSel.value);
      langTag.textContent = langSel.value;
      await sset({ "cpos.ide.lang": langSel.value });
      if (!editor.getValue().trim() && STARTERS[langSel.value]) { editor.setValue(STARTERS[langSel.value]); await sset({ [codeKey()]: editor.getValue() }); }
    };
    themeSel.onchange = async () => { applyEditorTheme(panel, themeSel.value); await sset({ "cpos.ide.theme": themeSel.value }); };

    launch.onclick = () => openPanel(width);
    panel.querySelector(".x").onclick = closePanel;
    panel.querySelector("#cpos-ide-reset").onclick = async () => { editor.setValue(STARTERS[langSel.value] || ""); await sset({ [codeKey()]: editor.getValue() }); setMsg("Reset to starter."); };
    panel.querySelector("#cpos-ide-copy").onclick = async () => { try { await navigator.clipboard.writeText(editor.getValue()); setMsg("Copied."); } catch { setMsg("Copy failed."); } };
    panel.querySelector("#cpos-ide-run").onclick = runSamples;
    panel.querySelector("#cpos-ide-submit").onclick = submit;
    panel.querySelector("#cpos-ide-custom").onclick = toggleCustom;

    // Font size controls.
    async function setFont(px) { curFont = Math.max(10, Math.min(px, 24)); editor.setFontSize(curFont); await sset({ [FONT_KEY]: curFont }); setMsg("Font " + curFont + "px"); }
    panel.querySelector("#cpos-ide-fup").onclick = () => setFont(curFont + 1);
    panel.querySelector("#cpos-ide-fdown").onclick = () => setFont(curFont - 1);

    // Line wrap toggle.
    panel.querySelector("#cpos-ide-wrap").onclick = async (e) => {
      const on = !e.currentTarget.classList.contains("active");
      e.currentTarget.classList.toggle("active", on);
      editor.setWrap(on);
      await sset({ [WRAP_KEY]: on });
    };

    // Maximize / Zen toggle (does not touch persisted width).
    panel.querySelector("#cpos-ide-zen").onclick = (e) => {
      const on = panel.classList.toggle("zen");
      e.currentTarget.classList.toggle("active", on);
      if (panel.classList.contains("open")) pushPage(on ? 0 : (parseInt(panel.style.width, 10) || width));
      editor.focus();
    };

    // Find & replace wiring.
    setupFind();

    // Keyboard: Ctrl/Cmd+F opens find inside the editor; Esc closes it/zen.
    panel.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) { e.preventDefault(); openFind(); }
      else if (e.key === "Escape") {
        if (!findBar.hidden) { closeFind(); }
        else if (panel.classList.contains("zen")) { panel.classList.remove("zen"); panel.querySelector("#cpos-ide-zen").classList.remove("active"); if (panel.classList.contains("open")) pushPage(parseInt(panel.style.width, 10) || width); }
      }
    });

    setupResize(panel.querySelector(".cpos-ide-grip"));
  }

  function setMsg(m) { if (msgEl) msgEl.textContent = m; }

  // ---- find & replace -----------------------------------------------------
  let findMatches = [], findIdx = -1;
  function findInputs() {
    return {
      q: panel.querySelector("#cpos-find-q"),
      r: panel.querySelector("#cpos-find-r"),
      count: panel.querySelector("#cpos-find-count")
    };
  }
  function computeMatches(query) {
    findMatches = [];
    if (!query) { findIdx = -1; return; }
    const hay = editor.getValue();
    let from = 0, i;
    while ((i = hay.indexOf(query, from)) !== -1) { findMatches.push(i); from = i + Math.max(1, query.length); }
  }
  function refreshFind() {
    const { q, count } = findInputs();
    const query = q.value;
    computeMatches(query);
    if (findIdx >= findMatches.length) findIdx = findMatches.length - 1;
    count.textContent = findMatches.length ? (findIdx + 1) + "/" + findMatches.length : (query ? "0/0" : "0/0");
  }
  function gotoMatch(dir) {
    const { q, count } = findInputs();
    if (!q.value) return;
    computeMatches(q.value);
    if (!findMatches.length) { findIdx = -1; count.textContent = "0/0"; return; }
    if (findIdx < 0) findIdx = 0;
    else findIdx = (findIdx + dir + findMatches.length) % findMatches.length;
    const pos = findMatches[findIdx];
    editor.select(pos, pos + q.value.length);
    count.textContent = (findIdx + 1) + "/" + findMatches.length;
  }
  function openFind() {
    findBar.hidden = false;
    const { q } = findInputs();
    const sel = editor.el.value.slice(editor.el.selectionStart, editor.el.selectionEnd);
    if (sel && !sel.includes("\n")) q.value = sel;
    q.focus(); q.select();
    findIdx = -1;
    refreshFind();
    if (findMatches.length) gotoMatch(1);
  }
  function closeFind() { findBar.hidden = true; editor.focus(); }
  function setupFind() {
    const { q, r } = findInputs();
    panel.querySelector("#cpos-ide-find").onclick = openFind;
    panel.querySelector("#cpos-find-x").onclick = closeFind;
    panel.querySelector("#cpos-find-next").onclick = () => gotoMatch(1);
    panel.querySelector("#cpos-find-prev").onclick = () => gotoMatch(-1);
    panel.querySelector("#cpos-find-rep").onclick = replaceCurrent;
    panel.querySelector("#cpos-find-repall").onclick = replaceAll;
    q.addEventListener("input", () => { findIdx = -1; refreshFind(); if (findMatches.length) gotoMatch(1); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
    });
    r.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); replaceCurrent(); }
      else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
    });
  }
  function replaceCurrent() {
    const { q, r } = findInputs();
    if (!q.value || findIdx < 0 || findIdx >= findMatches.length) { gotoMatch(1); return; }
    const pos = findMatches[findIdx];
    editor.replaceRange(pos, pos + q.value.length, r.value, pos + r.value.length);
    refreshFind();
    gotoMatch(1);
  }
  function replaceAll() {
    const { q, r } = findInputs();
    if (!q.value) return;
    const before = editor.getValue();
    const after = before.split(q.value).join(r.value);
    if (after !== before) {
      const n = before.split(q.value).length - 1;
      editor.setValue(after);
      sset({ [codeKey()]: after });
      setMsg("Replaced " + n + " occurrence(s).");
    }
    refreshFind();
  }

  // ---- open/close + push the page so it never overlaps --------------------
  function pushPage(px) {
    const html = document.documentElement;
    html.style.transition = "margin-right 0.18s ease";
    html.style.marginRight = px ? px + "px" : "";
    html.style.overflowX = px ? "hidden" : "";
  }
  function openPanel(width) {
    panel.classList.add("open");
    pushPage(panel.classList.contains("zen") ? 0 : (parseInt(panel.style.width, 10) || width || 640));
    editor.focus();
  }
  function closePanel() {
    panel.classList.remove("open");
    pushPage(0);
  }

  function setupResize(grip) {
    let dragging = false;
    grip.addEventListener("mousedown", (e) => {
      if (panel.classList.contains("zen")) return;
      dragging = true; e.preventDefault();
      panel.style.transition = "none";
      document.documentElement.style.transition = "none";
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const w = Math.max(360, Math.min(window.innerWidth - e.clientX, Math.round(window.innerWidth * 0.85)));
      panel.style.width = w + "px";
      if (panel.classList.contains("open")) document.documentElement.style.marginRight = w + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = "";
      document.body.style.userSelect = "";
      sset({ "cpos.ide.width": parseInt(panel.style.width, 10) || 640 });
    });
  }

  // ---- custom stdin test --------------------------------------------------
  function toggleCustom() {
    if (customWrap && customWrap.isConnected) { customWrap.remove(); customWrap = null; return; }
    consoleEl.hidden = false;
    customWrap = document.createElement("div");
    customWrap.className = "cpos-con-custom";
    customWrap.innerHTML =
      '<div class="cpos-con-customhead"><b>Custom test</b>' +
        '<span class="grow"></span>' +
        '<button id="cpos-custom-run" title="Run against this stdin">▷ Run custom</button>' +
      "</div>" +
      '<label>stdin</label><textarea id="cpos-custom-in" spellcheck="false" placeholder="Type input here…"></textarea>' +
      '<label>expected (optional)</label><textarea id="cpos-custom-exp" spellcheck="false" placeholder="Leave blank to just see output"></textarea>' +
      '<div id="cpos-custom-out"></div>';
    consoleEl.prepend(customWrap);
    customWrap.querySelector("#cpos-custom-run").onclick = runCustom;
    customWrap.querySelector("#cpos-custom-in").focus();
  }

  async function runCustom() {
    const input = customWrap.querySelector("#cpos-custom-in").value;
    const expRaw = customWrap.querySelector("#cpos-custom-exp").value;
    const expected = expRaw.trim();
    const out = customWrap.querySelector("#cpos-custom-out");
    out.innerHTML = '<div class="cpos-con-empty">Running on your local CPOS runner…</div>';
    const test = { input };
    if (expected) test.expected = expected;
    const data = await callRunner([test]);
    if (data === null) { out.innerHTML = runnerDownHtml(); return; }
    const r = (data.results || [])[0] || {};
    out.innerHTML = renderTestCard(r, 0, { custom: true, hasExpected: !!expected });
  }

  // ---- run against samples via the local CPOS runner ----------------------
  function showConsole(html) {
    consoleEl.hidden = false;
    // Preserve a mounted custom-test panel above the results.
    if (customWrap && customWrap.isConnected) {
      [...consoleEl.children].forEach((c) => { if (c !== customWrap) c.remove(); });
      const holder = document.createElement("div");
      holder.innerHTML = html;
      consoleEl.append(...holder.childNodes);
    } else {
      consoleEl.innerHTML = html;
    }
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function runnerDownHtml() {
    return '<div class="cpos-con-empty">Couldn\'t reach the CPOS runner.<br>' +
      "Open <b>VS Code</b> with the CPOS extension or start the <b>CPOS terminal app</b> so it can compile & run locally.<br>" +
      '<span class="cpos-dim">(Browsers can\'t execute C++/Java directly — running uses your local compiler.)</span></div>';
  }

  async function callRunner(tests) {
    const payload = { code: editor.getValue(), language: panel.querySelector("#cpos-ide-lang").value, tests };
    for (const base of RUNNERS) {
      try {
        const res = await fetch(base + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) return await res.json();
      } catch { /* try next */ }
    }
    return null;
  }

  async function runSamples() {
    const tests = scrapeSamples();
    if (!tests.length) { showConsole('<div class="cpos-con-empty">No sample tests found on this page.</div>'); return; }
    showConsole('<div class="cpos-con-empty">Running ' + tests.length + " sample(s) on your local CPOS runner…</div>");
    const data = await callRunner(tests);
    if (data === null) { showConsole(runnerDownHtml()); return; }
    renderRunResults(data, tests);
  }

  // Normalise a verdict: trust explicit verdict, else derive from pass/output.
  function verdictOf(r) {
    if (r.verdict) return String(r.verdict).toUpperCase();
    if (r.passed === true) return "AC";
    if (r.tle || r.timedOut) return "TLE";
    if (r.error || r.stderr) return "RE";
    return "WA";
  }
  function verdictClass(v) {
    if (v === "AC" || v === "OK") return "ok";
    if (v === "TLE") return "tle";
    if (v === "RE" || v === "MLE" || v === "CE" || v === "ERR") return "err";
    return "bad";
  }
  function meta(r) {
    const bits = [];
    const t = r.timeMs != null ? r.timeMs : (r.time != null ? r.time : null);
    if (t != null) bits.push(t + " ms");
    const mem = r.memoryKb != null ? (Math.round(r.memoryKb / 1024) + " MB") : (r.memory != null ? r.memory : null);
    if (mem != null) bits.push(mem);
    return bits.length ? " · " + bits.join(" · ") : "";
  }

  // Line-level diff between got and expected, marking the first differing token.
  function diffBlock(got, exp) {
    const g = String(got == null ? "" : got).replace(/\s+$/g, "");
    const e = String(exp == null ? "" : exp).replace(/\s+$/g, "");
    const gl = g.split("\n"), el = e.split("\n");
    const n = Math.max(gl.length, el.length);
    let gotHtml = "", expHtml = "";
    for (let i = 0; i < n; i++) {
      const a = gl[i], b = el[i];
      const same = a === b;
      const cls = same ? "" : ' class="dl"';
      if (a != null) gotHtml += "<span" + cls + ">" + esc(a) + "</span>\n";
      else gotHtml += '<span class="dl dm">(missing line)</span>\n';
      if (b != null) expHtml += "<span" + cls + ">" + esc(b) + "</span>\n";
      else expHtml += '<span class="dl dm">(extra line)</span>\n';
    }
    return { gotHtml, expHtml };
  }

  function renderTestCard(r, i, opts) {
    opts = opts || {};
    const v = verdictOf(r);
    const cls = verdictClass(v);
    const got = r.actual != null ? r.actual : (r.stdout != null ? r.stdout : (r.output != null ? r.output : ""));
    const exp = r.expected != null ? r.expected : "";
    const showDiff = (cls === "bad") && (opts.hasExpected !== false) && (exp !== "" || got !== "");
    const title = opts.custom ? "Custom" : "Test " + (i + 1);
    let body = "";
    if (cls === "ok") {
      // On AC for custom runs we still show the produced output.
      if (opts.custom) body = '<div class="cpos-con-io"><label>output</label><pre>' + esc(got) + "</pre></div>";
    } else if (showDiff) {
      const d = diffBlock(got, exp);
      body =
        '<div class="cpos-con-diff">' +
          '<div class="cpos-con-io"><label>got</label><pre>' + d.gotHtml + "</pre></div>" +
          '<div class="cpos-con-io"><label>expected</label><pre>' + d.expHtml + "</pre></div>" +
        "</div>";
    } else {
      body = '<div class="cpos-con-io"><label>output</label><pre>' + esc(got) + "</pre></div>";
    }
    if (r.stderr) body += '<div class="cpos-con-io"><label>stderr</label><pre>' + esc(r.stderr) + "</pre></div>";
    if (opts.input != null) body = '<div class="cpos-con-io"><label>input</label><pre>' + esc(opts.input) + "</pre></div>" + body;
    return (
      '<div class="cpos-con-test ' + cls + '">' +
        '<div class="cpos-con-head"><b>' + esc(title) + '</b><span class="vd">' + esc(v) + meta(r) + "</span></div>" +
        body +
      "</div>"
    );
  }

  function renderRunResults(data, tests) {
    lastRunData = data;
    const results = (data && data.results) || [];
    if (!results.length) { showConsole('<div class="cpos-con-empty">Runner returned no results.</div>'); return; }
    const cards = results.map((r, i) => renderTestCard(r, i, { input: tests && tests[i] ? tests[i].input : null, hasExpected: true })).join("");
    const passed = results.filter((r) => verdictClass(verdictOf(r)) === "ok").length;
    const allOk = passed === results.length;
    const summary =
      '<div class="cpos-con-summary ' + (allOk ? "ok" : "bad") + '">' +
        '<span class="sv">' + (allOk ? "✓ Accepted" : "✗ " + (results.length - passed) + " failing") + "</span>" +
        '<span class="grow"></span>' +
        '<span class="sc">' + passed + " / " + results.length + " passed</span>" +
      "</div>";
    showConsole(summary + cards);
  }

  // ---- submit (reuses existing background injector) -----------------------
  async function submit() {
    const code = editor.getValue();
    const lang = panel.querySelector("#cpos-ide-lang").value;
    if (!code.trim()) { setMsg("Editor is empty."); return; }
    if (!isCf) {
      try { await navigator.clipboard.writeText(code); } catch { /* ignore */ }
      setMsg("Code copied — opening CSES submit…");
      setTimeout(() => { window.location.href = ctx ? ctx.submitUrl : "/problemset"; }, 350);
      return;
    }
    if (!ctx) { setMsg("Could not detect the problem."); return; }
    await sset({
      [SUBMIT_KEY]: {
        key: problemKey(), contest: ctx.contest, index: ctx.index,
        submitByIndex: ctx.kind === "contest" || ctx.kind === "gym",
        problemCode: ctx.contest + ctx.index, code, language: lang, ts: Date.now()
      }
    });
    setMsg("Opening submit page…");
    setTimeout(() => { window.location.href = ctx.submitUrl; }, 250);
  }

  async function maybeCompleteSubmit() {
    const raw = await sget([SUBMIT_KEY]);
    const pending = raw[SUBMIT_KEY];
    if (!pending || Date.now() - pending.ts > 60000) return;
    if (!/\/submit/.test(location.pathname)) return;
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: "cpos-cf-submit", code: pending.code, language: pending.language,
        problemIndex: pending.submitByIndex ? pending.index : null,
        submitByIndex: pending.submitByIndex, problemCode: pending.submitByIndex ? null : pending.problemCode
      }, () => void chrome.runtime.lastError);
    }, 600);
    await sdel(SUBMIT_KEY);
  }

  // ---- lifecycle ----------------------------------------------------------
  function teardown() {
    pushPage(0);
    document.getElementById("cpos-ide-panel")?.remove();
    document.getElementById("cpos-ide-launch")?.remove();
    panel = editor = msgEl = launch = consoleEl = statusEl = findBar = customWrap = null;
  }
  async function sync() {
    if (!C) return;
    const on = await C.feature("ide");
    if (on && onProblemPage) buildPanel().catch((e) => console.debug("CPOS ide:", e));
    else teardown();
  }

  if (C) {
    C.onChange((changes) => {
      if (changes[C.KEYS.FEATURES]) sync();
      else if (panel) { applyChrome(panel); if (launch) applyChrome(launch); }
    });
  }
  if (onSubmitPage) maybeCompleteSubmit();
  if (onProblemPage) sync();
})();
