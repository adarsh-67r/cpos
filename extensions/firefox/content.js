(function () {
  const ENDPOINTS = [
    { name: "CPOS VS Code", baseUrl: "http://127.0.0.1:27122" },
    { name: "CPOS TUI", baseUrl: "http://127.0.0.1:27121" }
  ];

  function preText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent;
      } else if (node.nodeName === "BR") {
        out += "\n";
      } else {
        out += node.textContent;
        if (["DIV", "P", "LI"].includes(node.nodeName)) out += "\n";
      }
    }
    return out.replace(/^\n+|\n+$/g, "");
  }

  /** Block line counts from Codeforces test-example-line-N markup. */
  function blockSizesFromExample(preEl) {
    if (!preEl) return null;
    const lineEls = preEl.querySelectorAll(".test-example-line");
    if (!lineEls.length) return undefined;

    const counts = new Map();
    lineEls.forEach((line) => {
      if (/\btest-example-line-op\b/.test(line.className)) return;
      const m = line.className.match(/test-example-line-(\d+)/);
      const id = m ? parseInt(m[1], 10) : 0;
      counts.set(id, (counts.get(id) || 0) + 1);
    });

    const ids = [...counts.keys()].sort((a, b) => a - b);
    const sizes = ids.map((id) => counts.get(id));
    if (!sizes.length) return undefined;
    return { ids, sizes };
  }

  function parseCodeforcesOutputBlockSizes(expected) {
    const lines = String(expected || "").split("\n");
    const sizes = [];
    let i = 0;
    while (i < lines.length) {
      const s = lines[i].trim();
      if (!s) {
        i++;
        continue;
      }
      if (s === "NO") {
        sizes.push(1);
        i++;
        continue;
      }
      if (s === "YES") {
        i++;
        const k = i < lines.length ? parseInt(lines[i].trim(), 10) : NaN;
        if (!isNaN(k) && k >= 0) {
          sizes.push(2 + k);
          i++;
          i += k;
        } else {
          sizes.push(2);
        }
        continue;
      }
      sizes.push(1);
      i++;
    }
    return sizes.length ? sizes : null;
  }

  function inputOutputBlockMeta(inputPre, outputPre, expectedOutput) {
    const inMeta = blockSizesFromExample(inputPre);
    if (!inMeta) return undefined;
    const outMeta = blockSizesFromExample(outputPre);
    const sizes = inMeta.sizes;

    let outputBlockSizes =
      outMeta && outMeta.sizes.length ? outMeta.sizes : parseCodeforcesOutputBlockSizes(expectedOutput);
    let outputOffset = 0;
    if (outputBlockSizes && sizes.length === outputBlockSizes.length + 1) {
      outputOffset = 1;
    } else if (outMeta && outMeta.ids.length) {
      const firstOutId = outMeta.ids[0];
      const idx = inMeta.ids.indexOf(firstOutId);
      if (idx >= 0) outputOffset = idx;
      else if (sizes.length === outMeta.sizes.length + 1 || (sizes.length > outMeta.sizes.length && sizes[0] === 1)) {
        outputOffset = 1;
      }
    } else if (sizes.length > 1 && sizes[0] === 1 && outputBlockSizes && sizes.length === outputBlockSizes.length + 1) {
      outputOffset = 1;
    }

    const row = { input_block_sizes: sizes, input_output_offset: outputOffset };
    if (outputBlockSizes && outputBlockSizes.length) row.output_block_sizes = outputBlockSizes;
    return row;
  }

  function toast(message, ok) {
    const d = document.createElement("div");
    d.textContent = message;
    Object.assign(d.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      maxWidth: "340px",
      padding: "10px 13px",
      background: "#0d1117",
      color: "#e6edf3",
      borderRadius: "6px",
      border: "1px solid #30363d",
      borderLeft: `3px solid ${ok ? "#3fb950" : "#e3b341"}`,
      zIndex: 2147483647,
      fontSize: "12.5px",
      lineHeight: "1.45",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
      opacity: "0",
      transform: "translateY(6px)",
      transition: "opacity .18s ease, transform .18s ease"
    });
    document.body.appendChild(d);
    requestAnimationFrame(() => {
      d.style.opacity = "1";
      d.style.transform = "translateY(0)";
    });
    setTimeout(() => {
      d.style.opacity = "0";
      d.style.transform = "translateY(6px)";
    }, 2600);
    setTimeout(() => d.remove(), 2900);
  }

  async function get(path) {
    let lastError;
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await fetch(`${endpoint.baseUrl}${path}`);
        if (res.ok) return { endpoint, data: await res.json() };
        lastError = `${endpoint.name} returned ${res.status}`;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function post(path, body) {
    let lastError;
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await fetch(`${endpoint.baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok !== false) {
          return { endpoint, data };
        }
        lastError = data.error || `${endpoint.name} returned ${res.status}`;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  /** POST to every running CPOS endpoint so TUI + VS Code stay in sync. */
  async function postAll(path, body) {
    const synced = [];
    let lastError;
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await fetch(`${endpoint.baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok !== false) synced.push(endpoint.name);
        else lastError = data.error || `${endpoint.name} returned ${res.status}`;
      } catch (error) {
        lastError = error;
      }
    }
    return { synced, lastError };
  }

  async function captureCsesProgress() {
    const solved = [];
    const attempted = [];
    let taskCount = 0;

    document.querySelectorAll(".task").forEach((task) => {
      const a = task.querySelector("a[href*='/task/']") || task.querySelector("a");
      if (!a) return;
      const id = (a.getAttribute("href") || "").split("/").filter(Boolean).pop();
      if (!id || !/^\d+$/.test(id)) return;
      taskCount++;
      const score = task.querySelector(".task-score");
      if (!score) return;
      const cls = score.className || "";
      if (/\bfull\b/.test(cls)) solved.push(id);
      else if (/\bzero\b/.test(cls)) attempted.push(id);
    });

    if (solved.length === 0 && attempted.length === 0) {
      const bodyText = document.body?.innerText || "";
      if (/log in|login/i.test(bodyText)) {
        toast("CPOS · log in to CSES, then open this page to sync progress", false);
      } else if (taskCount > 0) {
        toast(
          `CPOS · found ${taskCount} tasks but no scores — log in to CSES to sync solved status`,
          false
        );
      }
      return;
    }

    const { synced } = await postAll("/capture/cses-progress", { solved, attempted });
    if (synced.length > 0) {
      toast(
        `CPOS · synced ${solved.length} solved, ${attempted.length} attempted → ${synced.join(", ")}`,
        true
      );
    } else {
      toast("CPOS · could not reach CPOS (start VS Code extension or TUI)", false);
    }
  }

  function captureProblem() {
    const pageUrl = location.href;
    let platform;
    let id;
    let name;
    let url;

    if (location.hostname === "codeforces.com") {
      platform = "codeforces";
      const match = pageUrl.match(/(?:problemset\/problem|(?:contest|gym)\/(\d+)\/problem)\/?(\d+)?\/?([A-Za-z0-9]+)/);
      const contest = match && (match[1] || match[2]);
      const index = match && match[3];
      if (!contest || !index) return null;
      id = `${contest}${index.toUpperCase()}`;
      url = pageUrl;
      const title = document.querySelector(".problem-statement .title") || document.querySelector(".title");
      name = title ? title.textContent.replace(/^[A-Z]\d*\.\s*/, "").trim() : id;
    } else if (location.hostname === "cses.fi") {
      platform = "cses";
      const match = pageUrl.match(/task\/(\d+)/);
      if (!match) return null;
      id = match[1];
      url = `https://cses.fi/problemset/task/${id}/`;
      const h1 = document.querySelector(".title-block h1, .content h1, h1");
      name = h1 ? h1.textContent.trim() : id;
    } else {
      return null;
    }

    const tests = [];
    if (platform === "codeforces") {
      const inputs = document.querySelectorAll(".sample-test .input pre");
      const outputs = document.querySelectorAll(".sample-test .output pre");
      for (let i = 0; i < Math.min(inputs.length, outputs.length); i++) {
        const expected = preText(outputs[i]);
        const meta = inputOutputBlockMeta(inputs[i], outputs[i], expected);
        const row = { input: preText(inputs[i]), expected_output: expected };
        if (meta) {
          row.input_block_sizes = meta.input_block_sizes;
          row.input_output_offset = meta.input_output_offset;
        }
        tests.push(row);
      }
    } else {
      // CSES: examples are consecutive <pre> blocks inside the statement content.
      const scope = document.querySelector(".content") || document;
      const pres = Array.from(scope.querySelectorAll("pre"))
        .map((el) => preText(el))
        .filter((s) => s.trim().length > 0);
      for (let i = 0; i + 1 < pres.length; i += 2) {
        tests.push({ input: pres[i], expected_output: pres[i + 1] });
      }
    }

    return { platform, id, name, url, tests };
  }

  const CF_LANGUAGE_IDS = {
    // Legacy fallbacks only — Codeforces reuses/changes ids; label matching is preferred.
    cpp: 54,
    c: 43,
    python: 31,
    pypy: 40,
    java: 60,
    kotlin: 73,
    rust: 75,
    go: 32,
    csharp: 79,
    javascript: 55,
    ruby: 67,
    haskell: 12,
    pascal: 51
  };

  const LANG_EXT = {
    cpp: "cpp",
    c: "c",
    python: "py",
    pypy: "py",
    java: "java",
    kotlin: "kt",
    rust: "rs",
    go: "go",
    csharp: "cs",
    javascript: "js",
    ruby: "rb",
    haskell: "hs",
    pascal: "pas"
  };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function ackSubmit() {
    try {
      await post("/pending-submit/consumed", {});
    } catch {
      /* ignore */
    }
  }

  function findProblemCodeInput() {
    const el = document.querySelector('input[name="submittedProblemCode"]');
    return el instanceof HTMLInputElement ? el : null;
  }

  function findProblemIndexSelect() {
    return document.querySelector('select[name="submittedProblemIndex"]');
  }

  function cfProblemId(pending) {
    if (pending?.id) return String(pending.id);
    if (pending?.contest && pending?.index) return `${pending.contest}${pending.index}`;
    return cfIndexFromUrl() || "";
  }

  function setProblemField(pending, fireChange = false) {
    const fullId = cfProblemId(pending);
    const input = findProblemCodeInput();
    if (input && fullId) {
      input.value = fullId;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (fireChange) input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    const select = findProblemIndexSelect();
    if (select && pending.index) {
      return setProblemSelect(select, pending.index, pending.id, fireChange);
    }
    return false;
  }

  function getCfAceEditor() {
    if (typeof window.ace === "undefined" || typeof window.ace.edit !== "function") {
      return null;
    }
    try {
      return window.ace.edit("editor");
    } catch {
      return null;
    }
  }

  function aceEditorReady() {
    const ed = getCfAceEditor();
    return !!ed && typeof ed.setValue === "function";
  }

  function findProblemSelect() {
    return findProblemIndexSelect() || findProblemCodeInput();
  }

  function findLangSelect() {
    return (
      document.querySelector('select[name="programTypeId"]') ||
      document.querySelector("#programTypeId")
    );
  }

  function setSelect(select, value, fireChange = false) {
    if (!select || value == null) return false;
    const v = String(value);
    for (const opt of select.options) {
      if (opt.value === v) {
        if (select.value !== opt.value) select.value = opt.value;
        if (fireChange) select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  function findSourceTextarea() {
    return (
      document.getElementById("sourceCodeTextarea") ||
      document.querySelector('textarea[name="source"]') ||
      document.querySelector("#sourceCode") ||
      document.querySelector('textarea[name="sourceCode"]')
    );
  }

  function setProblemSelect(select, index, fullId, fireChange = false) {
    if (!select || !index || select.options.length <= 1) return false;
    const wants = [index.toUpperCase()];
    if (fullId) wants.push(String(fullId).toUpperCase());
    for (const want of wants) {
      for (const opt of select.options) {
        const val = (opt.value || "").toUpperCase();
        const text = (opt.textContent || "").trim().toUpperCase();
        if (
          val === want ||
          text === want ||
          text.startsWith(`${want} —`) ||
          text.startsWith(`${want} -`) ||
          text.startsWith(`${want}.`) ||
          text.startsWith(`${want} `) ||
          new RegExp(`^${want}\\b`).test(text) ||
          val.endsWith(want)
        ) {
          if (select.value !== opt.value) select.value = opt.value;
          if (fireChange) select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
    }
    return false;
  }

  const CF_LANG_RANK = {
    cpp: [/GNU G\+\+23/i, /GNU G\+\+20/i, /GNU G\+\+17/i, /G\+\+23/i, /G\+\+20/i, /G\+\+17/i, /G\+\+/i],
    c: [/GNU GCC C11/i, /GNU GCC C\b/i, /\bGNU C\b/i],
    python: [/^Python 3/i, /Python 3\.\d/i, /\bPython 3\b/i, /PyPy 3/i],
    pypy: [/PyPy 3/i, /PyPy/i],
    java: [/Java 21/i, /Java 17/i, /Java 11/i, /\bJava\b/i],
    kotlin: [/Kotlin/i],
    rust: [/Rust 1\.\d/i, /Rust/i],
    go: [/\bGo\b/i],
    csharp: [/\.NET[^#]*C#/i, /Mono C#/i, /C#/i],
    javascript: [/Node\.js/i, /JavaScript/i],
    ruby: [/Ruby/i],
    haskell: [/Haskell/i],
    pascal: [/PascalABC/i, /Free Pascal/i, /Delphi/i]
  };

  function pickLanguage(select, lang, fireChange = false) {
    if (!select || !lang || select.options.length <= 1) return false;

    const ranks = CF_LANG_RANK[lang] || [];
    for (const re of ranks) {
      for (const opt of select.options) {
        if (re.test(opt.textContent || "")) {
          if (select.value !== opt.value) select.value = opt.value;
          if (fireChange) select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
    }

    const id = CF_LANGUAGE_IDS[lang];
    if (id != null) {
      if (String(select.value) === String(id)) return true;
      if (setSelect(select, id, fireChange)) return true;
    }

    return false;
  }

  function getCfCsrf() {
    return (
      document.querySelector('meta[name="X-Csrf-Token"]')?.getAttribute("content") ||
      document.querySelector(".csrf-token[data-csrf]")?.getAttribute("data-csrf") ||
      document.querySelector('[name="csrf_token"]')?.value ||
      null
    );
  }

  function getSourceCode() {
    const editor = getCfAceEditor();
    if (editor) {
      const v = editor.getValue();
      if (v?.trim()) return v;
    }

    const src = findSourceTextarea();
    if (src?.value?.trim()) return src.value;

    const editorDiv = document.querySelector("#editor");
    if (editorDiv?.env?.editor) {
      const v = editorDiv.env.editor.getValue();
      if (v?.trim()) return v;
    }
    return "";
  }

  function syncAceDisplay(code) {
    const editor = getCfAceEditor();
    if (editor) {
      try {
        editor.setValue(code, -1);
        editor.clearSelection();
        editor.resize();
      } catch {
        /* fall through */
      }
    }
    const editorDiv = document.querySelector("#editor");
    if (editorDiv?.env?.editor) {
      try {
        const ed = editorDiv.env.editor;
        ed.setValue(code, -1);
        ed.clearSelection();
      } catch {
        /* ignore */
      }
    }
  }

  function setSourceCode(code, quiet) {
    if (!code) return false;

    const textarea = findSourceTextarea();
    if (textarea) textarea.value = code;

    syncAceDisplay(code);

    if (!quiet && textarea) {
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return getSourceCode().trim().length > 0 || !!textarea?.value?.trim();
  }

  /** Quiet form fill without change events (used only if background injection is unavailable). */
  function cfFillQuiet(pending) {
    const textarea = findSourceTextarea();
    const lang = findLangSelect();
    if (!textarea || !lang || lang.options.length <= 1) return false;

    textarea.value = pending.code;

    pickLanguage(lang, pending.language, false);

    setProblemField(pending, false);

    syncAceDisplay(pending.code);

    if (!textarea.value.trim()) {
      textarea.value = pending.code;
      syncAceDisplay(pending.code);
    }

    return textarea.value.trim().length > 0;
  }

  function clickCodeforcesSubmit() {
    const candidates = [
      document.getElementById("singlePageSubmitButton"),
      document.querySelector('input.submit[type="submit"]'),
      document.querySelector('form.submit-form input[type="submit"]'),
      document.querySelector(".submit input[type='submit']"),
      document.querySelector("button.submit"),
      document.querySelector(".submit")
    ];
    for (const btn of candidates) {
      if (btn && !btn.disabled) {
        btn.disabled = false;
        btn.click();
        return true;
      }
    }
    return clickSubmitButton();
  }

  function cfSubmitBasePath() {
    const p = location.pathname;
    const patterns = [
      /^(\/contest\/\d+\/submit)/,
      /^(\/gym\/\d+\/submit)/,
      /^(\/group\/[^/]+\/contest\/\d+\/submit)/,
      /^(\/edu\/[^/]+\/lesson\/[^/]+\/[^/]+\/practice\/contest\/\d+\/submit)/,
      /^(\/problemset\/submit)/
    ];
    for (const re of patterns) {
      const m = p.match(re);
      if (m) return m[1];
    }
    return null;
  }

  function cfIndexFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get("submittedProblemIndex") || params.get("submittedProblemCode") || null;
  }

  function cfContestFromPath() {
    const m = location.pathname.match(/\/(?:contest|gym)\/(\d+)\/submit/);
    return m ? m[1] : null;
  }

  async function postCodeforcesSubmit(pending) {
    const basePath = cfSubmitBasePath();
    const csrf = getCfCsrf();
    if (!basePath || !csrf) return false;

    const langSelect = findLangSelect();
    const codeInput = findProblemCodeInput();
    const problemSelect = findProblemIndexSelect();
    if (langSelect && pending.language) {
      pickLanguage(langSelect, pending.language, false);
    }
    const programTypeId =
      (langSelect && langSelect.value) ||
      (pending.language && CF_LANGUAGE_IDS[pending.language] != null
        ? String(CF_LANGUAGE_IDS[pending.language])
        : null);
    const source = pending.code;
    if (!programTypeId || !source.trim()) return false;

    let problemField;
    let problemValue;
    if (codeInput) {
      problemField = "submittedProblemCode";
      problemValue = codeInput.value || cfProblemId(pending);
    } else if (problemSelect) {
      problemField = problemSelect.name || "submittedProblemIndex";
      problemValue = problemSelect.value || pending.index || cfIndexFromUrl();
    } else {
      problemField = "submittedProblemIndex";
      problemValue = pending.index || cfIndexFromUrl();
    }
    if (!problemValue) return false;

    const body = new URLSearchParams();
    body.set("csrf_token", csrf);
    body.set("action", "submitSolutionFormSubmitted");
    body.set(problemField, problemValue);
    body.set("programTypeId", programTypeId);
    body.set("source", source);

    const res = await fetch(`${basePath}?csrf_token=${encodeURIComponent(csrf)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Csrf-Token": csrf,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: body.toString(),
      credentials: "include",
      redirect: "follow"
    });

    return res.ok || res.redirected;
  }

  function fillCodeforcesDom(pending) {
    if (findLangSelect() && pending.language) {
      pickLanguage(findLangSelect(), pending.language, true);
    }
    setProblemField(pending, true);
    return setSourceCode(pending.code);
  }

  async function prepareCodeforcesForm(pending) {
    setProblemField(pending, true);
    if (findLangSelect() && pending.language) {
      pickLanguage(findLangSelect(), pending.language, true);
    }
    await sleep(600);
  }

  function isCodeforcesSubmitPage() {
    return location.hostname === "codeforces.com" && /\/submit/.test(location.pathname);
  }

  function submitViaPageScript(pending) {
    const pathname = location.pathname;
    const submitByIndex =
      /\/contest\/\d+\/submit/.test(pathname) ||
      /\/gym\/\d+\/submit/.test(pathname) ||
      /\/group\/[^/]+\/contest\/\d+\/submit/.test(pathname);
    return browser.runtime
      .sendMessage({
        type: "cpos-cf-submit",
        code: pending.code,
        languageId: CF_LANGUAGE_IDS[pending.language] ?? null,
        language: pending.language || "cpp",
        problemIndex: pending.index ?? cfIndexFromUrl() ?? null,
        submitByIndex,
        problemCode: submitByIndex ? null : pending.id ?? null
      })
      .then((resp) => resp || { ok: false, reason: "no-response" })
      .catch((error) => ({ ok: false, reason: String(error) }));
  }

  function clickSubmitButton() {
    const selectors = [
      'form.submit-form input[type="submit"]',
      'input[type="submit"].submit',
      ".submit input[type='submit']",
      "input.submit",
      "button.submit",
      'form[action*="submit"] input[type="submit"]',
      'input[type="submit"][value*="Submit"]',
      'button[type="submit"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && !el.disabled) {
        el.disabled = false;
        el.click();
        return true;
      }
    }
    const form =
      document.querySelector("form.submit-form") ||
      document.querySelector('form[action*="submit"]');
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    return false;
  }

  async function autofillCodeforcesSubmit(pending) {
    const contest = cfContestFromPath();
    if (pending.contest && contest && pending.contest !== contest) return false;

    let lastReason = "form-not-ready";

    for (let attempt = 0; attempt < 60; attempt++) {
      const langSelect = findLangSelect();
      const textarea = findSourceTextarea();
      const hasLang = langSelect && langSelect.options.length > 1;

      if (hasLang && textarea) {
        if (cfFillQuiet(pending)) {
          await sleep(250);
          if (clickCodeforcesSubmit()) {
            await ackSubmit();
            toast(`CPOS · submitted ${pending.id}`, true);
            return true;
          }
        }

        // 2) MAIN-world inject via background.
        const injected = await submitViaPageScript(pending);
        if (injected.ok) {
          await ackSubmit();
          toast(`CPOS · submitted ${pending.id}`, true);
          return true;
        }
        lastReason = injected.reason || "inject-failed";

        // 3) Direct POST fallback.
        try {
          if (await postCodeforcesSubmit(pending)) {
            await ackSubmit();
            toast(`CPOS · submitted ${pending.id}`, true);
            return true;
          }
        } catch {
          /* try again */
        }
        lastReason = "dom-fill-failed";
      }

      await sleep(300);
    }

    toast(`CPOS · could not submit ${pending.id} (${lastReason})`, false);
    return false;
  }

  async function getPendingSubmit() {
    let lastError;
    for (let i = 0; i < 10; i++) {
      try {
        return await get("/pending-submit");
      } catch (error) {
        lastError = error;
        await sleep(250);
      }
    }
    throw lastError;
  }

  function taskIdFromAnyUrl(url) {
    const s = String(url || "");
    const m = s.match(/\/(?:task|submit)\/(\d+)/);
    return m ? m[1] : null;
  }

  function findCsesSubmitForm() {
    for (const form of document.querySelectorAll("form")) {
      if (form.querySelector('input[type="file"]')) return form;
    }
    return null;
  }

  function csesLanguageHints(lang) {
    return (
      {
        cpp: ["C++"],
        c: ["C"],
        python: ["Python3", "Python 3", "Python", "CPython"],
        pypy: ["PyPy"],
        java: ["Java"],
        kotlin: ["Kotlin"],
        rust: ["Rust"],
        go: ["Go"],
        javascript: ["Node.js", "JavaScript"],
        ruby: ["Ruby"],
        haskell: ["Haskell"],
        pascal: ["Pascal"],
        csharp: ["C#"]
      }[lang] || []
    );
  }

  function csesOptionStrategy(lang) {
    // Preferred variant for the second ("option") select.
    return (
      {
        cpp: { version: /(?:C\+\+\s*)?(\d{2})/i, prefer: [/C\+\+/i] },
        rust: { version: /(\d{4})/i, prefer: [/Rust/i] },
        python: { prefer: [/CPython3/i, /Python\s*3/i, /CPython/i] }
      }[lang] || []
    );
  }

  function selectByHints(select, hints, exact) {
    if (!select) return false;
    const score = (text) => {
      const t = text.trim();
      for (let i = 0; i < hints.length; i++) {
        if (exact ? t === hints[i] : t.includes(hints[i])) return hints.length - i;
      }
      return 0;
    };
    let best = null;
    let bestScore = 0;
    for (const opt of select.options) {
      const s = score(opt.textContent || "");
      if (s > bestScore) {
        bestScore = s;
        best = opt;
      }
    }
    if (best) {
      if (select.value !== best.value) {
        select.value = best.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  function selectBestOption(select, strategy) {
    if (!select || !strategy) return false;
    let best = null;
    let bestScore = -1;
    for (const opt of select.options) {
      const text = opt.textContent || "";
      let score = 0;
      const version = strategy.version?.exec(text);
      if (version) score += Number(version[1]) * 100;
      const prefer = strategy.prefer || [];
      for (let i = 0; i < prefer.length; i++) {
        if (prefer[i].test(text)) {
          score += prefer.length - i;
          break;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }
    if (best && bestScore > 0) {
      if (select.value !== best.value) {
        select.value = best.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  async function setCsesLanguage(form, lang) {
    const typeSelect =
      form.querySelector('select[name="type"]') || form.querySelector("select");
    if (typeSelect) {
      selectByHints(typeSelect, csesLanguageHints(lang), false);
      // The option list repopulates after the language changes.
      await sleep(250);
    }
    const optionSelect = form.querySelector('select[name="option"]');
    const optionStrategy = csesOptionStrategy(lang);
    if (optionSelect && optionStrategy) {
      selectBestOption(optionSelect, optionStrategy);
    }
  }

  function clickCsesSubmit(form) {
    const scope = form || document;
    for (const el of scope.querySelectorAll("input[type='submit'], button")) {
      const text = (el.value || el.textContent || "").trim().toLowerCase();
      if (text === "send" || text === "submit" || text === "submit solution") {
        el.click();
        return true;
      }
    }
    const fallback = scope.querySelector("input[type='submit'], button[type='submit']");
    if (fallback) {
      fallback.click();
      return true;
    }
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    return clickSubmitButton();
  }

  function attachCsesFile(form, pending, taskId) {
    const ext = LANG_EXT[pending.language] || "cpp";
    let fileName = pending.fileName || `${taskId}.${ext}`;
    if (pending.language === "java") fileName = "Main.java";

    const fileInput = form.querySelector('input[type="file"]');
    if (!fileInput) return null;

    const file = new File([pending.code], fileName, { type: "text/plain" });
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    return fileName;
  }

  async function postCsesForm(form, pending, taskId) {
    const ext = LANG_EXT[pending.language] || "cpp";
    let fileName = pending.fileName || `${taskId}.${ext}`;
    if (pending.language === "java") fileName = "Main.java";

    await setCsesLanguage(form, pending.language);

    const fileInput = form.querySelector('input[type="file"]');
    const fieldName = fileInput?.name || "file";
    const fd = new FormData(form);
    fd.set(fieldName, new File([pending.code], fileName, { type: "text/plain" }), fileName);

    const res = await fetch(form.action || location.href, {
      method: (form.method || "POST").toUpperCase(),
      body: fd,
      credentials: "include",
      redirect: "follow"
    });

    return res.ok || res.redirected;
  }

  async function autofillCsesSubmit(pending) {
    const taskId =
      taskIdFromAnyUrl(location.href) ||
      taskIdFromAnyUrl(pending.submitUrl) ||
      (/^\d+$/.test(String(pending.id)) ? String(pending.id) : null);

    if (!taskId) {
      toast("CPOS · could not resolve CSES task id", false);
      return false;
    }

    const submitUrl = `https://cses.fi/problemset/submit/${taskId}/`;
    if (!location.pathname.includes("/submit/")) {
      location.href = submitUrl;
      return false;
    }

    for (let attempt = 0; attempt < 40; attempt++) {
      const form = findCsesSubmitForm();
      if (form) {
        const fileName = attachCsesFile(form, pending, taskId);
        if (fileName) {
          await setCsesLanguage(form, pending.language);
          await sleep(300);
          if (clickCsesSubmit(form)) {
            await ackSubmit();
            toast(`CPOS · submitted ${fileName}`, true);
            return true;
          }
        }

        // Fallback: multipart POST.
        try {
          if (await postCsesForm(form, pending, taskId)) {
            await ackSubmit();
            toast(`CPOS · submitted ${pending.fileName || taskId}`, true);
            setTimeout(() => location.reload(), 800);
            return true;
          }
        } catch {
          /* fall through */
        }

        toast("CPOS · attached file — click Send to finish", false);
        return false;
      }

      const bodyText = document.body?.innerText || "";
      if (attempt > 8 && /log in|login/i.test(bodyText)) {
        toast("CPOS · log in to CSES in this browser, then Submit again", false);
        return false;
      }
      await sleep(250);
    }

    toast("CPOS · CSES submit form not found — are you logged in?", false);
    return false;
  }

  async function autofillSubmit() {
    let pending;
    try {
      ({ data: pending } = await getPendingSubmit());
    } catch {
      return false;
    }
    if (!pending || !pending.ok || !pending.code) return false;

    const platform = String(pending.platform || "").toLowerCase();
    if (platform === "codeforces" || platform === "cf") {
      return autofillCodeforcesSubmit(pending);
    }
    if (platform === "cses") {
      return autofillCsesSubmit(pending);
    }
    return false;
  }

  async function watchSubmitPage() {
    // Let the background worker own CSES submission. The old content-script
    // fallback could race the injected submitter and send the same form twice.
    browser.runtime.sendMessage({ type: "cpos-poll-submit" }).catch(() => undefined);
  }

  async function watchCodeforcesSubmit() {
    for (let i = 0; i < 120; i++) {
      try {
        browser.runtime.sendMessage({ type: "cpos-poll-submit" }).catch(() => undefined);
      } catch {
        /* background polls on its own timer too */
      }
      // Fallback if background inject has not finished yet.
      if (i === 2 || i === 5) {
        try {
          const { data: pending } = await getPendingSubmit();
          if (pending?.ok && pending.code) {
            const injected = await submitViaPageScript(pending);
            if (injected.ok) {
              await ackSubmit();
              toast(`CPOS · submitted ${pending.id}`, true);
              return;
            }
            try {
              if (await postCodeforcesSubmit(pending)) {
                await ackSubmit();
                toast(`CPOS · submitted ${pending.id}`, true);
                return;
              }
            } catch {
              /* retry */
            }
          }
        } catch {
          /* pending not ready */
        }
      }
      await sleep(200);
    }
    toast("CPOS · submit timed out — log in to Codeforces and keep the CPOS companion enabled", false);
  }

  // On an open problem page, watch for a queued submit and immediately wake the
  // background worker. This makes submit feel instant even if the service worker
  // was suspended, because a runtime message revives it right away.
  function startPendingSubmitNudge() {
    let waking = false;
    setInterval(async () => {
      if (waking) return;
      try {
        const { data } = await get("/pending-submit");
        if (data && data.ok && data.code) {
          waking = true;
          browser.runtime
            .sendMessage({ type: "cpos-poll-submit" })
            .catch(() => undefined)
            .finally(() => {
              waking = false;
            });
        }
      } catch {
        /* no pending submit, or CPOS not running */
      }
    }, 300);
  }

  (async function main() {
    try {
      if (location.hostname === "codeforces.com" && isCodeforcesSubmitPage()) {
        await watchCodeforcesSubmit();
        return;
      }

      if (location.hostname === "cses.fi" && location.pathname.includes("/submit/")) {
        await watchSubmitPage();
        return;
      }

      if (location.hostname === "cses.fi" && location.pathname.includes("/problemset/list")) {
        await captureCsesProgress();
        window.addEventListener("pageshow", () => captureCsesProgress());
        return;
      }

      // Codeforces problem page or CSES task page: keep a fast submit watcher running.
      startPendingSubmitNudge();

      const payload = captureProblem();
      if (!payload) return;
      const { synced } = await postAll("/capture/problem", payload);
      if (synced.length > 0) {
        const detail =
          payload.tests.length > 0
            ? `${payload.tests.length} sample(s) → ${synced.join(", ")}`
            : synced.join(", ");
        toast(`CPOS · captured ${payload.id} (${payload.name}) · ${detail}`, true);
      } else {
        toast("CPOS not running. Open VS Code with CPOS, or start the CPOS TUI.", false);
      }
    } catch (_) {
      if (location.hostname === "codeforces.com" && isCodeforcesSubmitPage()) {
        return;
      }
      if (location.hostname === "cses.fi" && location.pathname.includes("/submit/")) {
        return;
      }
      toast("CPOS not running. Open VS Code with the CPOS extension, or start the CPOS app.", false);
    }
  })();
})();
