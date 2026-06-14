// CPOS in-browser editor — a slide-in code editor on CF/CSES problem pages so
// you can write and submit without leaving the browser. The editor is a
// line-numbered textarea with a live syntax-highlight overlay (shared with the
// page highlighter). SUBMISSION REUSES the existing background "cpos-cf-submit"
// injector — it does not reimplement or alter any submit/capture logic.
// Toggle from the CPOS popup (feature "ide").
(function () {
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  const HL = self.CPOS_HL;
  const SUBMIT_KEY = "cpos.ide.submit";

  const LANGS = [
    ["cpp", "C++"],
    ["python", "Python 3"],
    ["pypy", "PyPy 3"],
    ["java", "Java"],
    ["kotlin", "Kotlin"],
    ["rust", "Rust"],
    ["go", "Go"],
    ["csharp", "C#"],
    ["javascript", "JavaScript"]
  ];
  const HL_LANG = { cpp: "cpp", pypy: "py", python: "py", java: "java" };
  const STARTERS = {
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n",
    python: "import sys\ninput = sys.stdin.readline\n\n",
    pypy: "import sys\ninput = sys.stdin.readline\n\n",
    java: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n\n    }\n}\n"
  };

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

  function problemKey() {
    if (isCf && ctx) return `cf:${ctx.contest}${ctx.index}`;
    if (ctx && ctx.kind === "cses") return `cses:${ctx.id}`;
    return "p:" + location.pathname;
  }
  function problemLabel() {
    if (isCf && ctx) return ctx.contest + ctx.index;
    if (ctx && ctx.kind === "cses") return "CSES " + ctx.id;
    return "Problem";
  }

  // ---- storage ------------------------------------------------------------
  const sget = (k) => new Promise((r) => chrome.storage.local.get(k, (v) => r(v || {})));
  const sset = (o) => new Promise((r) => chrome.storage.local.set(o, () => r()));
  const sdel = (k) => new Promise((r) => chrome.storage.local.remove(k, () => r()));
  const codeKey = () => "cpos.ide.code." + problemKey();

  async function applyThemeVars(node) {
    if (!T || !C) return;
    const theme = T.get(await C.activeThemeId());
    const map = {
      "--cpos-bg": "--bg", "--cpos-panel": "--panel", "--cpos-panel2": "--panel-2",
      "--cpos-fg": "--fg", "--cpos-dim": "--dim", "--cpos-border": "--border", "--cpos-accent": "--accent"
    };
    for (const [out, src] of Object.entries(map)) node.style.setProperty(out, theme[src]);
  }

  // ---- editor (textarea + live highlight overlay + line gutter) -----------
  function mountEditor(container, initial, lang, onChange) {
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
    function render() {
      const code = ta.value;
      const hlLang = HL_LANG[curLang] || "cpp";
      pre.innerHTML = HL ? HL.highlight(code + "\n", hlLang) : (code + "\n").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      const lines = code.split("\n").length;
      let g = "";
      for (let i = 1; i <= lines; i++) g += i + "\n";
      gutter.textContent = g;
    }
    function syncScroll() {
      pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
      gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
    }
    ta.addEventListener("input", () => { render(); onChange(ta.value); });
    ta.addEventListener("scroll", syncScroll);
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
      setValue: (v) => { ta.value = v; render(); syncScroll(); },
      setLang: (l) => { curLang = l; render(); },
      focus: () => ta.focus()
    };
  }

  // ---- panel --------------------------------------------------------------
  let panel, editor, msgEl, launch;

  async function buildPanel() {
    if (document.getElementById("cpos-ide-panel")) return;

    launch = document.createElement("button");
    launch.id = "cpos-ide-launch";
    launch.textContent = "‹ /› EDITOR";
    launch.title = "CPOS in-browser editor";
    document.body.appendChild(launch);

    panel = document.createElement("div");
    panel.id = "cpos-ide-panel";
    panel.innerHTML =
      '<div class="cpos-ide-head">' +
        '<span class="pid">' + problemLabel() + "</span>" +
        '<span class="grow"></span>' +
        '<select id="cpos-ide-lang"></select>' +
        '<button class="x" title="Close editor">✕</button>' +
      "</div>" +
      '<div class="cpos-ide-editor"><div class="cpos-ide-mount" id="cpos-ide-mount"></div></div>' +
      '<div class="cpos-ide-foot">' +
        '<span class="msg"></span>' +
        '<button id="cpos-ide-reset" title="Reset to starter template">Reset</button>' +
        '<button id="cpos-ide-copy">Copy</button>' +
        '<button class="primary" id="cpos-ide-submit">Submit ▸</button>' +
      "</div>";
    document.body.appendChild(panel);
    await applyThemeVars(launch);
    await applyThemeVars(panel);

    const langSel = panel.querySelector("#cpos-ide-lang");
    LANGS.forEach(([id, label]) => {
      const o = document.createElement("option");
      o.value = id; o.textContent = label;
      langSel.appendChild(o);
    });

    const saved = await sget([codeKey(), "cpos.ide.lang"]);
    const lang = saved["cpos.ide.lang"] || "cpp";
    langSel.value = lang;
    const initial = saved[codeKey()] != null ? saved[codeKey()] : (STARTERS[lang] || "");

    msgEl = panel.querySelector(".msg");
    let saveTimer = null;
    editor = mountEditor(panel.querySelector("#cpos-ide-mount"), initial, lang, (v) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => sset({ [codeKey()]: v }), 250);
    });

    langSel.onchange = async () => {
      editor.setLang(langSel.value);
      await sset({ "cpos.ide.lang": langSel.value });
      if (!editor.getValue().trim() && STARTERS[langSel.value]) {
        editor.setValue(STARTERS[langSel.value]);
        await sset({ [codeKey()]: editor.getValue() });
      }
    };

    launch.onclick = () => { panel.classList.add("open"); editor.focus(); };
    panel.querySelector(".x").onclick = () => panel.classList.remove("open");
    panel.querySelector("#cpos-ide-reset").onclick = async () => {
      const l = langSel.value;
      editor.setValue(STARTERS[l] || "");
      await sset({ [codeKey()]: editor.getValue() });
      setMsg("Reset to starter.");
    };
    panel.querySelector("#cpos-ide-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(editor.getValue()); setMsg("Copied."); }
      catch { setMsg("Copy failed."); }
    };
    panel.querySelector("#cpos-ide-submit").onclick = submit;
  }

  function setMsg(m) { if (msgEl) msgEl.textContent = m; }

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
        key: problemKey(),
        contest: ctx.contest,
        index: ctx.index,
        submitByIndex: ctx.kind === "contest" || ctx.kind === "gym",
        problemCode: ctx.contest + ctx.index,
        code,
        language: lang,
        ts: Date.now()
      }
    });
    setMsg("Opening submit page…");
    setTimeout(() => { window.location.href = ctx.submitUrl; }, 250);
  }

  // ---- submit-page handoff (reuses the existing background injector) ------
  async function maybeCompleteSubmit() {
    const raw = await sget([SUBMIT_KEY]);
    const pending = raw[SUBMIT_KEY];
    if (!pending || Date.now() - pending.ts > 60000) return;
    if (!/\/submit/.test(location.pathname)) return;
    // Give the form a moment to render, then hand off.
    setTimeout(() => {
      chrome.runtime.sendMessage(
        {
          type: "cpos-cf-submit",
          code: pending.code,
          language: pending.language,
          problemIndex: pending.submitByIndex ? pending.index : null,
          submitByIndex: pending.submitByIndex,
          problemCode: pending.submitByIndex ? null : pending.problemCode
        },
        () => void chrome.runtime.lastError
      );
    }, 600);
    await sdel(SUBMIT_KEY);
  }

  // ---- lifecycle ----------------------------------------------------------
  function teardown() {
    document.getElementById("cpos-ide-panel")?.remove();
    document.getElementById("cpos-ide-launch")?.remove();
    panel = editor = msgEl = launch = null;
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
      else { if (panel) applyThemeVars(panel); if (launch) applyThemeVars(launch); }
    });
  }

  if (onSubmitPage) maybeCompleteSubmit();
  if (onProblemPage) sync();
})();
