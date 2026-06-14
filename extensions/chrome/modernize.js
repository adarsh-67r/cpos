// CPOS Modernize — a sleek restyle for Codeforces / CSES: modern system font,
// roomier spacing, rounded card-style boxes (the old corner-image artifacts are
// neutralised), cleaner tables, buttons, inputs and code. Purely typographic /
// structural — colours are left to the optional site theme, so the two compose.
// No gradients. Toggle from the CPOS popup (feature "modernize").
(function () {
  const STYLE_ID = "cpos-modernize";
  const C = self.CPOS;
  const isCf = location.hostname.endsWith("codeforces.com");
  const isCses = location.hostname.endsWith("cses.fi");

  const FONT = `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, "Helvetica Neue", Arial, sans-serif`;
  const MONO = `"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`;

  function cfCss() {
    return `
      body, .ttypography, button, input, select, textarea, table, .roundbox, #pageContent {
        font-family: ${FONT} !important;
        -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
      }
      body { font-size: 14.5px !important; line-height: 1.62 !important; }
      h1,h2,h3,h4,.title,.caption { font-weight: 700 !important; letter-spacing: -0.01em !important; }

      /* card-ify round boxes; kill the old corner-image artifacts */
      .roundbox {
        border-radius: 14px !important; border: 1px solid rgba(128,128,128,0.18) !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04) !important;
        overflow: hidden !important; margin-bottom: 16px !important;
      }
      .roundbox > .lt, .roundbox > .rt, .roundbox > .lb, .roundbox > .rb,
      .roundbox > .left, .roundbox > .right { display: none !important; }
      .roundbox > .top, .roundbox > .bottom { height: 0 !important; border: none !important; background: none !important; }
      .roundbox .caption.titled { padding: 12px 16px !important; font-size: 15px !important; }

      /* spacing for content + statement */
      #pageContent { padding-top: 6px !important; }
      .problem-statement { padding: 4px 2px !important; }
      .problem-statement .header .title { font-size: 20px !important; }
      .ttypography { line-height: 1.7 !important; }

      /* tables */
      table.problems, .datatable table, table.rtable, table.standings, table.user-table {
        border-collapse: separate !important; border-spacing: 0 !important;
      }
      .datatable td, .datatable th, table.problems td, table.problems th,
      table.rtable td, table.rtable th { padding: 9px 14px !important; border-color: rgba(128,128,128,0.14) !important; }
      .datatable th, table.problems th { font-weight: 600 !important; letter-spacing: 0.02em !important; }

      /* buttons + inputs */
      input[type="submit"], button, .submit, a.submit, .button {
        border-radius: 9px !important; padding: 8px 16px !important; font-weight: 600 !important;
        border: 1px solid rgba(128,128,128,0.22) !important; transition: filter .12s ease, transform .04s ease;
      }
      input[type="submit"]:active, button:active { transform: translateY(1px); }
      input[type="text"], input[type="password"], input[type="number"], textarea, select {
        border-radius: 9px !important; padding: 8px 11px !important; border: 1px solid rgba(128,128,128,0.22) !important;
      }

      /* links + nav */
      a { text-decoration: none !important; }
      a:hover { text-decoration: underline !important; }
      .second-level-menu-list, .menu-list { letter-spacing: 0.01em; }

      /* code */
      pre, code, .prettyprint, tt { font-family: ${MONO} !important; }
      pre, .prettyprint { border-radius: 10px !important; padding: 12px 14px !important; }
      .sample-test pre { border-radius: 10px !important; }

      /* tidy header */
      #header { padding: 6px 0 !important; }
      #footer { border-radius: 14px 14px 0 0 !important; }
    `;
  }

  function csesCss() {
    return `
      body, table, input, select, textarea, button { font-family: ${FONT} !important; -webkit-font-smoothing: antialiased; }
      body { font-size: 15px !important; line-height: 1.65 !important; }
      h1, h2, h3, .title-block { font-weight: 700 !important; letter-spacing: -0.01em !important; }
      #content, .content { max-width: 1080px !important; }
      table.list, .summary-table, table { border-collapse: separate !important; border-spacing: 0 !important; }
      table td, table th { padding: 9px 13px !important; border-color: rgba(128,128,128,0.16) !important; }
      a { text-decoration: none !important; }
      a:hover { text-decoration: underline !important; }
      input, select, textarea { border-radius: 9px !important; padding: 8px 11px !important; }
      input[type="submit"], button { border-radius: 9px !important; padding: 8px 16px !important; font-weight: 600 !important; }
      pre, code { font-family: ${MONO} !important; border-radius: 10px !important; }
      pre { padding: 12px 14px !important; }
      .nav { letter-spacing: 0.01em; }
    `;
  }

  function apply() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = isCf ? cfCss() : isCses ? csesCss() : "";
  }
  function remove() {
    document.getElementById(STYLE_ID)?.remove();
  }

  async function sync() {
    if (!C) return;
    const on = await C.feature("modernize");
    if (on) apply();
    else remove();
  }

  if (C) {
    C.onChange((changes) => { if (changes[C.KEYS.FEATURES]) sync(); });
    sync();
  }
})();
