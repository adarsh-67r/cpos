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
      ".comments pre",
      ".content pre"             // CSES task pages
    ].join(",");
    return [...document.querySelectorAll(sel)].filter((pre) => {
      if (pre.hasAttribute(DONE)) return false;
      // Skip Codeforces sample input/output blocks.
      if (pre.closest(".sample-test, .input, .output, .test-example-line")) return false;
      // Skip blocks with rich child markup we shouldn't flatten.
      if (pre.querySelector("img, table, a, button, .test-example-line")) return false;
      return true;
    });
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

  let observer;
  async function sync() {
    if (!C) return;
    const on = await C.feature("highlight");
    if (on) {
      await process();
      if (!observer) {
        observer = new MutationObserver(() => { process().catch(() => {}); });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      observer?.disconnect();
      observer = null;
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
