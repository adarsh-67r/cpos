// CPOS in-browser editor — a slide-in panel on CF/CSES problem pages so you can
// write a solution and submit without leaving the browser. Submission REUSES the
// existing background "cpos-cf-submit" injector (the same proven path the
// companion uses) — it does not reimplement or alter any submit logic.
// Toggle from the CPOS popup (feature "ide").
(function () {
  const T = self.CPOS_THEMES;
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
  const STARTERS = {
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    \n    return 0;\n}\n",
    python: "import sys\ninput = sys.stdin.readline\n\n",
    java: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n"
  };

  // ---- page context -------------------------------------------------------
  function cfContestProblem() {
    let m = location.pathname.match(/\/contest\/(\d+)\/problem\/([^/]+)/);
    if (m) return { kind: "contest", contest: m[1], index: m[2].toUpperCase(), submitUrl: `/contest/${m[1]}/submit` };
    m = location.pathname.match(/\/gym\/(\d+)\/problem\/([^/]+)/);
    if (m) return { kind: "gym", contest: m[1], index: m[2].toUpperCase(), submitUrl: `/gym/${m[1]}/submit` };
    m = location.pathname.match(/\/problemset\/problem\/(\d+)\/([^/]+)/);
    if (m) return { kind: "problemset", contest: m[1], index: m[2].toUpperCase(), submitUrl: `/problemset/submit/${m[1]}/${m[2].toUpperCase()}` };
    return null;
  }
  function csesTask() {
    const m = location.pathname.match(/\/problemset\/task\/(\d+)/);
    return m ? { id: m[1], submitUrl: `/problemset/submit/${m[1]}/` } : null;
  }

  const isCf = location.hostname.endsWith("codeforces.com");
  const ctx = isCf ? cfContestProblem() : csesTask();

  function problemKey() {
    if (isCf && ctx) return `cf:${ctx.contest}${ctx.index}`;
    if (!isCf && ctx) return `cses:${ctx.id}`;
    return location.pathname;
  }
  function problemLabel() {
    if (isCf && ctx) return ctx.contest + ctx.index;
    if (!isCf && ctx) return "CSES " + ctx.id;
    return "Problem";
  }

  // ---- storage helpers ----------------------------------------------------
  const sget = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const sset = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));
  const codeKey = () => "cpos.ide.code." + problemKey();

  async function applyThemeVars(node) {
    const raw = await sget(["cpos.ui.theme", "cpos.siteThemeId", "cpos.features"]);
    const f = raw["cpos.features"] || {};
    const id = f.siteTheme ? raw["cpos.siteThemeId"] || "github" : raw["cpos.ui.theme"] || (T && T.DEFAULT_THEME) || "purple";
    if (!T) return;
    const theme = T.get(id);
    // Map palette to the --cpos-* vars our CSS uses.
    const map = {
      "--cpos-bg": "--bg", "--cpos-panel": "--panel", "--cpos-panel2": "--panel-2",
      "--cpos-fg": "--fg", "--cpos-dim": "--dim", "--cpos-border": "--border", "--cpos-accent": "--accent"
    };
    for (const [out, src] of Object.entries(map)) node.style.setProperty(out, theme[src]);
  }

  // ---- editor (textarea today; Monaco drop-in if vendored, see README) ----
  function mountEditor(container, initial, onChange) {
    const ta = document.createElement("textarea");
    ta.id = "cpos-ide-ta";
    ta.spellcheck = false;
    ta.value = initial || "";
    ta.addEventListener("input", () => onChange(ta.value));
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 4;
        onChange(ta.value);
      }
    });
    container.appendChild(ta);
    return { getValue: () => ta.value, setValue: (v) => { ta.value = v; }, focus: () => ta.focus() };
  }

  // ---- panel --------------------------------------------------------------
  let panel, editor, msgEl;

  async function buildPanel() {
    if (document.getElementById("cpos-ide-panel")) return;

    const launch = document.createElement("button");
    launch.id = "cpos-ide-launch";
    launch.textContent = "‹ /› EDITOR";
    launch.title = "CPOS in-browser editor";
    document.body.appendChild(launch);

    panel = document.createElement("div");
    panel.id = "cpos-ide-panel";
    panel.innerHTML =
      '<div class="cpos-ide-head">' +
        '<span class="pid">' + problemLabel() + '</span>' +
        '<span class="grow"></span>' +
        '<select id="cpos-ide-lang"></select>' +
        '<button class="x" title="Close">✕</button>' +
      '</div>' +
      '<div class="cpos-ide-editor"><div class="cpos-ide-mount" id="cpos-ide-mount"></div></div>' +
      '<div class="cpos-ide-foot">' +
        '<span class="msg"></span>' +
        '<button id="cpos-ide-copy">Copy</button>' +
        '<button class="primary" id="cpos-ide-submit">Submit</button>' +
      '</div>';
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
    editor = mountEditor(panel.querySelector("#cpos-ide-mount"), initial, (v) => sset({ [codeKey()]: v }));

    langSel.onchange = async () => {
      await sset({ "cpos.ide.lang": langSel.value });
      if (!editor.getValue().trim() && STARTERS[langSel.value]) {
        editor.setValue(STARTERS[langSel.value]);
        await sset({ [codeKey()]: editor.getValue() });
      }
    };

    launch.onclick = () => { panel.classList.add("open"); editor.focus(); };
    panel.querySelector(".x").onclick = () => panel.classList.remove("open");
    panel.querySelector("#cpos-ide-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(editor.getValue()); setMsg("Copied to clipboard."); }
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
      // CSES submit is a file-upload form; hand off via clipboard + open page.
      try { await navigator.clipboard.writeText(code); } catch { /* ignore */ }
      setMsg("Code copied — opening CSES submit…");
      window.location.href = ctx ? ctx.submitUrl : "/problemset";
      return;
    }
    if (!ctx) { setMsg("Could not detect the problem."); return; }

    // Stash for the submit page, where we hand off to the existing injector.
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
    window.location.href = ctx.submitUrl;
  }

  // ---- on the CF submit page: complete the handoff ------------------------
  async function maybeCompleteSubmit() {
    const raw = await sget([SUBMIT_KEY]);
    const pending = raw[SUBMIT_KEY];
    if (!pending || Date.now() - pending.ts > 60000) return;
    // Only fire on a submit page.
    if (!/\/submit/.test(location.pathname)) return;
    // Hand to the background MAIN-world injector (same path the companion uses).
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
    await new Promise((r) => chrome.storage.local.remove(SUBMIT_KEY, r));
  }

  // ---- lifecycle ----------------------------------------------------------
  function teardown() {
    document.getElementById("cpos-ide-panel")?.remove();
    document.getElementById("cpos-ide-launch")?.remove();
  }

  async function sync() {
    const raw = await sget(["cpos.features"]);
    const on = (raw["cpos.features"] || {}).ide === true;
    const onProblemPage = !!ctx && !/\/submit/.test(location.pathname);
    if (on && onProblemPage) buildPanel();
    else teardown();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes["cpos.features"]) sync();
    if (changes["cpos.ui.theme"] || changes["cpos.siteThemeId"]) {
      const p = document.getElementById("cpos-ide-panel");
      const l = document.getElementById("cpos-ide-launch");
      if (p) applyThemeVars(p);
      if (l) applyThemeVars(l);
    }
  });

  // The submit-page handoff runs regardless of the panel toggle (the user opted
  // in by clicking Submit), but only if a fresh pending submit exists.
  maybeCompleteSubmit();
  sync();
})();
