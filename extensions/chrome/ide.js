// CPOS in-browser editor — an IDE-style slide-in panel on CF/CSES problem pages.
// Resizable, pushes the page (no overlap), multiple editor colour schemes, a
// live syntax-highlight overlay (shared tokenizer), a Run console that checks
// your solution against the page's sample tests via the local CPOS runner, and
// one-click Submit. SUBMISSION REUSES the existing background "cpos-cf-submit"
// injector — it never reimplements or alters capture/submit logic.
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
  const STARTERS = {
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n",
    python: "import sys\ninput = sys.stdin.readline\n\n",
    pypy: "import sys\ninput = sys.stdin.readline\n\n",
    java: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n\n    }\n}\n"
  };

  // IDE colour schemes for the editor surface (token colours, gutter, caret).
  const EDITOR_THEMES = {
    "vscode-dark": { name: "VS Dark+", bg: "#1e1e1e", fg: "#d4d4d4", gutter: "#858585", caret: "#aeafad", sel: "#264f7855", kw: "#569cd6", type: "#4ec9b0", str: "#ce9178", num: "#b5cea8", com: "#6a9955", fn: "#dcdcaa", pre: "#c586c0", panel: "#252526", border: "#333333" },
    monokai: { name: "Monokai", bg: "#272822", fg: "#f8f8f2", gutter: "#90908a", caret: "#f8f8f0", sel: "#49483e", kw: "#f92672", type: "#66d9ef", str: "#e6db74", num: "#ae81ff", com: "#75715e", fn: "#a6e22e", pre: "#f92672", panel: "#2d2e27", border: "#3b3c35" },
    dracula: { name: "Dracula", bg: "#282a36", fg: "#f8f8f2", gutter: "#6272a4", caret: "#f8f8f2", sel: "#44475a", kw: "#ff79c6", type: "#8be9fd", str: "#f1fa8c", num: "#bd93f9", com: "#6272a4", fn: "#50fa7b", pre: "#ff79c6", panel: "#21222c", border: "#3a3c4e" },
    nord: { name: "Nord", bg: "#2e3440", fg: "#d8dee9", gutter: "#4c566a", caret: "#d8dee9", sel: "#434c5e", kw: "#81a1c1", type: "#8fbcbb", str: "#a3be8c", num: "#b48ead", com: "#616e88", fn: "#88c0d0", pre: "#81a1c1", panel: "#3b4252", border: "#434c5e" },
    "github-light": { name: "GitHub Light", bg: "#ffffff", fg: "#24292e", gutter: "#babbbd", caret: "#24292e", sel: "#c8e1ff", kw: "#d73a49", type: "#6f42c1", str: "#032f62", num: "#005cc5", com: "#6a737d", fn: "#6f42c1", pre: "#d73a49", panel: "#f6f8fa", border: "#d0d7de" }
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

  async function applyChrome(node) {
    if (!T || !C) return;
    const theme = T.get(await C.activeThemeId());
    const map = { "--cpos-bg": "--bg", "--cpos-panel": "--panel", "--cpos-panel2": "--panel-2", "--cpos-fg": "--fg", "--cpos-dim": "--dim", "--cpos-border": "--border", "--cpos-accent": "--accent" };
    for (const [out, src] of Object.entries(map)) node.style.setProperty(out, theme[src]);
  }
  function applyEditorTheme(root, id) {
    const t = EDITOR_THEMES[id] || EDITOR_THEMES["vscode-dark"];
    const v = {
      "--ed-bg": t.bg, "--ed-fg": t.fg, "--ed-gutter": t.gutter, "--ed-caret": t.caret, "--ed-sel": t.sel,
      "--ed-kw": t.kw, "--ed-type": t.type, "--ed-str": t.str, "--ed-num": t.num, "--ed-com": t.com,
      "--ed-fn": t.fn, "--ed-pre": t.pre, "--ed-panel": t.panel, "--ed-border": t.border
    };
    for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val);
  }

  // ---- editor (textarea + overlay + gutter) -------------------------------
  function mountEditor(container, initial, lang, onChange, onCursor) {
    const wrap = document.createElement("div");
    wrap.className = "cpos-ed";
    const gutter = document.createElement("div");
    gutter.className = "cpos-ed-gutter";
    const scroll = document.createElement("div");
    scroll.className = "cpos-ed-scroll";
    const pre = document.createElement("pre");
    pre.className = "cpos-ed-hl";
    const ta = document.createElement("textarea");
    ta.className = "cpos-ed-ta";
    ta.spellcheck = false;
    ta.value = initial || "";
    scroll.appendChild(pre);
    scroll.appendChild(ta);
    wrap.appendChild(gutter);
    wrap.appendChild(scroll);
    container.appendChild(wrap);

    let curLang = lang;
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
      pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
      gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
    }
    function cursor() {
      const upto = ta.value.slice(0, ta.selectionStart);
      const line = upto.split("\n").length;
      const col = upto.length - upto.lastIndexOf("\n");
      onCursor && onCursor(line, col);
    }
    ta.addEventListener("input", () => { render(); onChange(ta.value); cursor(); });
    ta.addEventListener("scroll", syncScroll);
    ta.addEventListener("keyup", cursor);
    ta.addEventListener("click", cursor);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 4;
        render(); onChange(ta.value);
      }
    });
    render();
    return {
      getValue: () => ta.value,
      setValue: (val) => { ta.value = val; render(); syncScroll(); },
      setLang: (l) => { curLang = l; render(); },
      focus: () => ta.focus()
    };
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
  let panel, editor, msgEl, launch, consoleEl, statusEl;

  async function buildPanel() {
    if (document.getElementById("cpos-ide-panel")) return;
    const conf = await sget([codeKey(), "cpos.ide.lang", "cpos.ide.theme", "cpos.ide.width"]);
    const lang = conf["cpos.ide.lang"] || "cpp";
    const edThemeId = conf["cpos.ide.theme"] || "vscode-dark";
    const width = Math.max(360, Math.min(conf["cpos.ide.width"] || 640, Math.round(window.innerWidth * 0.85)));

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
        '<button class="x" title="Close editor">✕</button>' +
      "</div>" +
      '<div class="cpos-ide-editor"><div class="cpos-ide-mount" id="cpos-ide-mount"></div></div>' +
      '<div class="cpos-ide-console" id="cpos-ide-console" hidden></div>' +
      '<div class="cpos-ide-status"><span id="cpos-ide-pos">Ln 1, Col 1</span><span class="grow"></span><span id="cpos-ide-langtag">' + lang + "</span></div>" +
      '<div class="cpos-ide-foot">' +
        '<span class="msg"></span>' +
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
    const langTag = panel.querySelector("#cpos-ide-langtag");

    const initial = conf[codeKey()] != null ? conf[codeKey()] : (STARTERS[lang] || "");
    let saveTimer = null;
    editor = mountEditor(
      panel.querySelector("#cpos-ide-mount"),
      initial,
      lang,
      (v) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => sset({ [codeKey()]: v }), 250); },
      (ln, col) => { statusEl.textContent = "Ln " + ln + ", Col " + col; }
    );

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

    setupResize(panel.querySelector(".cpos-ide-grip"));
  }

  function setMsg(m) { if (msgEl) msgEl.textContent = m; }

  // ---- open/close + push the page so it never overlaps --------------------
  function pushPage(px) {
    const html = document.documentElement;
    html.style.transition = "margin-right 0.18s ease";
    html.style.marginRight = px ? px + "px" : "";
    html.style.overflowX = px ? "hidden" : "";
  }
  function openPanel(width) {
    panel.classList.add("open");
    pushPage(parseInt(panel.style.width, 10) || width || 640);
    editor.focus();
  }
  function closePanel() {
    panel.classList.remove("open");
    pushPage(0);
  }

  function setupResize(grip) {
    let dragging = false;
    grip.addEventListener("mousedown", (e) => {
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

  // ---- run against samples via the local CPOS runner ----------------------
  function showConsole(html) {
    consoleEl.hidden = false;
    consoleEl.innerHTML = html;
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  async function runSamples() {
    const tests = scrapeSamples();
    if (!tests.length) { showConsole('<div class="cpos-con-empty">No sample tests found on this page.</div>'); return; }
    showConsole('<div class="cpos-con-empty">Running ' + tests.length + " sample(s) on your local CPOS runner…</div>");
    const payload = { code: editor.getValue(), language: panel.querySelector("#cpos-ide-lang").value, tests };
    for (const base of RUNNERS) {
      try {
        const res = await fetch(base + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) { renderRunResults(await res.json()); return; }
      } catch { /* try next */ }
    }
    showConsole(
      '<div class="cpos-con-empty">Couldn\'t reach the CPOS runner.<br>' +
      "Open <b>VS Code</b> with the CPOS extension or start the <b>CPOS terminal app</b> so it can compile & run locally.<br>" +
      '<span class="cpos-dim">(Browsers can\'t execute C++/Java directly — running uses your local compiler.)</span></div>'
    );
  }
  function renderRunResults(data) {
    const results = (data && data.results) || [];
    if (!results.length) { showConsole('<div class="cpos-con-empty">Runner returned no results.</div>'); return; }
    let html = "";
    results.forEach((r, i) => {
      const ok = r.passed || r.verdict === "AC";
      html +=
        '<div class="cpos-con-test ' + (ok ? "ok" : "bad") + '">' +
        '<div class="cpos-con-head"><b>Test ' + (i + 1) + "</b><span>" + esc(r.verdict || (ok ? "AC" : "WA")) + (r.timeMs != null ? " · " + r.timeMs + " ms" : "") + "</span></div>" +
        (ok ? "" :
          '<div class="cpos-con-io"><label>got</label><pre>' + esc(r.actual || r.stdout || "") + "</pre></div>" +
          '<div class="cpos-con-io"><label>expected</label><pre>' + esc(r.expected || "") + "</pre></div>" +
          (r.stderr ? '<div class="cpos-con-io"><label>stderr</label><pre>' + esc(r.stderr) + "</pre></div>" : "")) +
        "</div>";
    });
    const passed = results.filter((r) => r.passed || r.verdict === "AC").length;
    showConsole('<div class="cpos-con-summary">' + passed + " / " + results.length + " passed</div>" + html);
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
    panel = editor = msgEl = launch = consoleEl = statusEl = null;
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
