// CPOS code styling — dependency-free syntax highlighting for the actual code
// blocks in Codeforces / CSES statements, editorials, and comments (MV3 forbids
// loading a highlighter from a CDN, so this is self-contained). It skips sample
// input/output blocks, themes each block to the active CPOS palette, and never
// touches capture/submit. Toggle from the popup (feature "highlight").
(function () {
  const DONE = "data-cpos-hl";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  const HL = self.CPOS_HL;
  if (!HL) return;
  const { detect, highlight, looksLikeCode } = HL;

  function candidates() {
    const sel = [
      ".ttypography pre",        // editorials / blog / problem prose code
      ".problem-statement pre",  // (filtered below — skip sample I/O)
      "pre.prettyprint",
      "pre code",                // CF blog / markdown-rendered fenced blocks
      ".comments pre",
      ".content pre",            // CSES task pages
      ".md-content pre"          // CSES rendered markdown
    ].join(",");
    const seen = new Set();
    const list = [];
    for (const node of document.querySelectorAll(sel)) {
      // Normalize "pre code" → the <pre> so we only process the block once.
      const pre = node.tagName === "PRE" ? node : node.closest("pre");
      if (!pre || seen.has(pre)) continue;
      seen.add(pre);
      if (pre.hasAttribute(DONE)) continue;
      // Skip Codeforces sample input/output blocks (and CSES equivalents).
      if (pre.closest(".sample-test, .input, .output, .test-example-line, .test-section")) continue;
      // Skip blocks with rich child markup we shouldn't flatten. Allow a single
      // <code> wrapper (common in rendered markdown) — that's not rich markup.
      if (pre.querySelector("img, table, a, button, input, .test-example-line")) continue;
      list.push(pre);
    }
    return list;
  }

  let theme = null;
  async function ensureTheme() {
    if (theme || !T || !C) return;
    theme = T.get(await C.activeThemeId());
  }

  function styleBlock(pre) {
    if (!theme) return;
    pre.style.setProperty("--cpos-fg", theme["--fg"]);
    pre.style.setProperty("--cpos-panel2", theme["--panel-2"]);
    pre.style.setProperty("--cpos-border", theme["--border"]);
  }

  async function process() {
    await ensureTheme();
    for (const pre of candidates()) {
      const code = pre.textContent || "";
      if (code.length > 40000 || !looksLikeCode(code)) continue;
      pre.setAttribute(DONE, "1");
      const rawText = code; // preserve for unprocess
      pre.setAttribute("data-cpos-raw", rawText);
      pre.classList.add("cpos-hl");
      styleBlock(pre);
      pre.innerHTML = highlight(code, detect(code));
    }
  }

  function restyleAll() {
    document.querySelectorAll("pre.cpos-hl").forEach(styleBlock);
  }

  function unprocess() {
    document.querySelectorAll("pre.cpos-hl").forEach((pre) => {
      const raw = pre.getAttribute("data-cpos-raw");
      if (raw != null) pre.textContent = raw;
      pre.classList.remove("cpos-hl");
      pre.removeAttribute(DONE);
      pre.removeAttribute("data-cpos-raw");
      pre.style.removeProperty("--cpos-fg");
      pre.style.removeProperty("--cpos-panel2");
      pre.style.removeProperty("--cpos-border");
    });
  }

  let observer, pending;
  function scheduleProcess() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      // Pause the observer while we mutate the DOM (innerHTML rewrite) so our
      // own changes don't retrigger an endless processing loop.
      observer?.disconnect();
      process()
        .catch(() => {})
        .finally(() => {
          if (observer) observer.observe(document.body, { childList: true, subtree: true });
        });
    }, 120);
  }

  async function sync() {
    if (!C) return;
    const on = await C.feature("highlight");
    if (on) {
      await process();
      if (!observer) {
        observer = new MutationObserver(scheduleProcess);
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      observer?.disconnect();
      observer = null;
      if (pending) { clearTimeout(pending); pending = null; }
      unprocess();
    }
  }

  if (C) {
    C.onChange((changes) => {
      if (changes[C.KEYS.FEATURES]) sync();
      else { theme = null; ensureTheme().then(restyleAll); }
    });
    if (document.body) sync();
    else document.addEventListener("DOMContentLoaded", () => sync());
  }
})();
