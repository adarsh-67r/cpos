// CPOS site theming — restyles Codeforces / CSES with the chosen CPOS palette.
// Pure additive CSS injection driven by chrome.storage; never touches the
// capture/submit flow. Only colours/backgrounds/borders are changed — never
// layout/positioning — and Codeforces rating-tier handle colours are preserved.
// Toggle + palette come from the CPOS popup (feature "siteTheme").
(function () {
  const STYLE_ID = "cpos-site-theme";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  const host = location.hostname;
  const isCf = host.endsWith("codeforces.com");
  const isCses = host.endsWith("cses.fi");

  // Darken/lighten helper for derived shades (hover, stripes).
  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return hex;
    let n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt));
    g = Math.max(0, Math.min(255, g + amt));
    b = Math.max(0, Math.min(255, b + amt));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function vars(t) {
    const isLight = t.name === "Light";
    const stripe = isLight ? shade(t["--panel"], -8) : shade(t["--panel"], 8);
    const hover = isLight ? shade(t["--panel"], -16) : shade(t["--panel"], 16);
    return `
      --c-bg:${t["--bg"]}; --c-panel:${t["--panel"]}; --c-panel2:${t["--panel-2"]};
      --c-fg:${t["--fg"]}; --c-dim:${t["--dim"]}; --c-border:${t["--border"]};
      --c-accent:${t["--accent"]}; --c-accent-dim:${t["--accent-dim"]};
      --c-ok:${t["--ok"]}; --c-bad:${t["--bad"]}; --c-warn:${t["--warn"]};
      --c-stripe:${stripe}; --c-hover:${hover};
    `;
  }

  function cfCss() {
    return `
      :root{${vars(currentTheme)}}

      /* base canvas */
      html, body { background: var(--c-bg) !important; color: var(--c-fg) !important; }
      #body, #pageContent, .content-with-sidebar, .container, .main, #content {
        background: transparent !important; color: var(--c-fg) !important;
      }
      hr { border-color: var(--c-border) !important; }

      /* links — keep rating-tier handle colours (.user-*, .legendary-user-first-letter) */
      a:not([class*="user-"]):not(.rated-user), a:not([class*="user-"]):not(.rated-user):visited {
        color: var(--c-accent) !important;
      }
      a:not([class*="user-"]):not(.rated-user):hover { color: var(--c-accent-dim) !important; }

      /* top bars + menus */
      #header, .menu-list-container, .lang-chooser, .second-level-menu, .second-level-menu-list,
      .menu-list, #footer {
        background: var(--c-panel) !important; color: var(--c-fg) !important;
        border-color: var(--c-border) !important;
      }
      .menu-list-container .current, .second-level-menu-list .current { background: var(--c-panel2) !important; }
      #header a, .menu-list a, .second-level-menu-list a, .menu-list-container a { color: var(--c-fg) !important; }

      /* round boxes / sidebar widgets / panels */
      .roundbox, .roundbox-body, .datatable, .info, .userbox, .topic, .comment-form,
      #sidebar > div, .sidebar, .roundbox.sidebox, .personal-sidebar, .bottom-links,
      .problemStatement, .problem-statement, .ttypography, .comments, .comment, .box, .diffData {
        background: var(--c-panel) !important; color: var(--c-fg) !important;
        border-color: var(--c-border) !important;
      }
      .roundbox .top, .roundbox .bottom, .roundbox .left, .roundbox .right,
      .roundbox .lt, .roundbox .rt, .roundbox .lb, .roundbox .rb {
        background: transparent !important; border-color: var(--c-border) !important;
      }
      .caption, .roundbox .caption, .header .title, .title, .section-title, h1, h2, h3, h4 {
        color: var(--c-fg) !important;
      }

      /* tables (problemset, standings, submissions, rating, friends) */
      table, .datatable table, table.problems, table.rtable, table.standings, table.user-table {
        background: transparent !important; border-color: var(--c-border) !important; color: var(--c-fg) !important;
      }
      td, th, .datatable td, .datatable th, table.problems td, table.problems th,
      table.standings td, table.standings th, table.rtable td, table.rtable th {
        border-color: var(--c-border) !important; color: var(--c-fg) !important; background: transparent !important;
      }
      tr.dark td, .datatable tr:nth-child(even) td, table.problems tr:nth-child(even) td { background: var(--c-stripe) !important; }
      .datatable tr:hover td, table.problems tr:hover td, table.standings tr:hover td { background: var(--c-hover) !important; }
      th, .datatable th { background: var(--c-panel2) !important; }

      /* problem statement */
      .problem-statement .header, .problem-statement .property-title { color: var(--c-fg) !important; }
      .sample-test, .sample-test .input, .sample-test .output, .test-example-line {
        background: var(--c-panel2) !important; color: var(--c-fg) !important; border-color: var(--c-border) !important;
      }
      .sample-test .title { color: var(--c-dim) !important; }

      /* code */
      pre, code, .prettyprint, tt, .source, .program-source {
        background: var(--c-panel2) !important; color: var(--c-fg) !important; border-color: var(--c-border) !important;
      }

      /* forms */
      input, textarea, select, .ace_editor {
        background: var(--c-panel2) !important; color: var(--c-fg) !important; border-color: var(--c-border) !important;
      }
      input::placeholder, textarea::placeholder { color: var(--c-dim) !important; }
      input[type="submit"], button, .submit, a.submit {
        background: var(--c-accent-dim) !important; color: #fff !important; border-color: var(--c-accent-dim) !important;
      }

      /* misc text */
      .ttypography, .ttypography p, .text, .notice, span.legend, .small, .contest-state-phase {
        color: var(--c-fg) !important;
      }
      .verdict-accepted { color: var(--c-ok) !important; }
      .verdict-rejected, .verdict-failed { color: var(--c-bad) !important; }
      .pagination .page-index a { background: var(--c-panel2) !important; border-color: var(--c-border) !important; }
      .pagination .page-index.active span { background: var(--c-accent-dim) !important; color: #fff !important; }
    `;
  }

  function csesCss() {
    return `
      :root{${vars(currentTheme)}}
      html, body { background: var(--c-bg) !important; color: var(--c-fg) !important; }
      .skeleton, #content, .content, #wrapper, .nav, .navlinks, .title-block, footer {
        background: transparent !important; color: var(--c-fg) !important;
      }
      a:not(.task) , a:visited:not(.task) { color: var(--c-accent) !important; }
      h1, h2, h3, h4, .title-block { color: var(--c-fg) !important; }
      .nav, .nav a, .navlinks a { color: var(--c-fg) !important; }
      .nav { border-color: var(--c-border) !important; }
      table, td, th, tr, table.list, .summary-table { border-color: var(--c-border) !important; color: var(--c-fg) !important; background: transparent !important; }
      tr:nth-child(even) td { background: var(--c-stripe) !important; }
      th { background: var(--c-panel2) !important; }
      pre, code, .code, .prettyprint { background: var(--c-panel2) !important; color: var(--c-fg) !important; border-color: var(--c-border) !important; }
      input, textarea, select { background: var(--c-panel2) !important; color: var(--c-fg) !important; border-color: var(--c-border) !important; }
      input[type="submit"], button { background: var(--c-accent-dim) !important; color: #fff !important; border-color: var(--c-accent-dim) !important; }
      .full, .narrow, .content-wrapper { background: transparent !important; }
      .task-score.full, .full { color: var(--c-ok) !important; }
      .task-score.zero { color: var(--c-bad) !important; }
      .controls a, .pager a { background: var(--c-panel2) !important; border-color: var(--c-border) !important; }
    `;
  }

  // Never let the site theme bleed into CPOS's own injected UI (editor panel,
  // analytics, launcher). Re-assert critical editor styles with high specificity
  // so the highlight overlay keeps working when site theming is on.
  function protectCss() {
    return `
      #cpos-ide-panel, #cpos-ide-panel *, #cpos-ide-launch,
      .cpos-analytics, .cpos-analytics * { box-shadow: none; }
      #cpos-ide-panel .cpos-ed-ta { color: transparent !important; background: transparent !important; border: none !important; }
      #cpos-ide-panel .cpos-ed-hl, #cpos-ide-panel .cpos-ed-hl * { background: transparent !important; }
      #cpos-ide-panel input, #cpos-ide-panel textarea, #cpos-ide-panel select,
      #cpos-ide-panel pre, #cpos-ide-panel code { border-color: var(--cpos-border, #2a2a3e) !important; }
      .cpos-analytics a, .cpos-analytics a:visited { color: var(--accent, #b794ff) !important; }
      .cpos-analytics pre, .cpos-analytics code { background: transparent !important; }
    `;
  }

  let currentTheme = (T && T.get(C ? C.DEFAULT_SITE_THEME : "github")) || { name: "GitHub Dark" };

  function apply() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = (isCf ? cfCss() : isCses ? csesCss() : "") + protectCss();
  }

  function remove() {
    const s = document.getElementById(STYLE_ID);
    if (s) s.remove();
  }

  async function sync() {
    if (!C || !T) return;
    const cfg = await C.load();
    if (!cfg.features.siteTheme) {
      remove();
      return;
    }
    currentTheme = T.get(cfg.siteThemeId || "github");
    apply();
  }

  if (C) {
    C.onChange(() => sync());
    sync();
  }
})();
