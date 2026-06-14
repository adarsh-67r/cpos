// CPOS site theming — restyles Codeforces / CSES with the chosen CPOS palette.
// Pure CSS injection driven by chrome.storage; never touches capture/submit.
// Toggle + palette are set from the CPOS popup (feature "siteTheme").
(function () {
  const STYLE_ID = "cpos-site-theme";
  const T = self.CPOS_THEMES;
  const isCf = location.hostname.endsWith("codeforces.com");

  function css(theme) {
    const v = (k) => theme[k];
    const common = `
      :root {
        --cpos-bg:${v("--bg")}; --cpos-panel:${v("--panel")}; --cpos-panel2:${v("--panel-2")};
        --cpos-fg:${v("--fg")}; --cpos-dim:${v("--dim")}; --cpos-border:${v("--border")};
        --cpos-accent:${v("--accent")};
      }
      html, body { background: var(--cpos-bg) !important; color: var(--cpos-fg) !important; }
      a, a:visited { color: var(--cpos-accent) !important; }
      input, textarea, select {
        background: var(--cpos-panel2) !important; color: var(--cpos-fg) !important;
        border-color: var(--cpos-border) !important;
      }
      pre, code, .prettyprint { background: var(--cpos-panel2) !important; color: var(--cpos-fg) !important; }
    `;

    if (isCf) {
      return common + `
        #body, #pageContent, .content-with-sidebar { background: var(--cpos-bg) !important; }
        .roundbox, .datatable, #header, #footer, #sidebar > div, .second-level-menu,
        .topic, .comment-form, .info, .userbox, table.rtable, .bottom-links {
          background: var(--cpos-panel) !important; color: var(--cpos-fg) !important;
          border-color: var(--cpos-border) !important;
        }
        .roundbox .top, .roundbox .bottom, .roundbox .lt, .roundbox .rt,
        .roundbox .lb, .roundbox .rb { background: transparent !important; border-color: var(--cpos-border) !important; }
        table.problems tr, .datatable tr, table.rtable tr { background: transparent !important; }
        table.problems td, .datatable td, table.rtable td, .datatable th, table.rtable th {
          border-color: var(--cpos-border) !important; color: var(--cpos-fg) !important;
        }
        .datatable tr:hover td, table.problems tr:hover td { background: var(--cpos-panel2) !important; }
        .caption, .title, h1, h2, h3, .header { color: var(--cpos-fg) !important; }
        .ttypography { color: var(--cpos-fg) !important; }
        #header a, .menu-list-container a, .second-level-menu-list a { color: var(--cpos-fg) !important; }
        .nav-links a, .personal-sidebar a { color: var(--cpos-accent) !important; }
      `;
    }
    // CSES
    return common + `
      .content, #content, .nav, .navlinks, .title-block, table.list, .summary-table {
        background: var(--cpos-panel) !important; color: var(--cpos-fg) !important;
        border-color: var(--cpos-border) !important;
      }
      table, td, th, tr { border-color: var(--cpos-border) !important; color: var(--cpos-fg) !important; }
      .nav a, h1, h2, h3 { color: var(--cpos-fg) !important; }
      .task-score, .difficult { color: var(--cpos-fg) !important; }
    `;
  }

  function apply(theme) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css(theme);
  }

  function remove() {
    document.getElementById(STYLE_ID)?.remove();
  }

  async function sync() {
    const raw = await new Promise((res) =>
      chrome.storage.local.get(["cpos.features", "cpos.siteThemeId"], res)
    );
    const on = (raw["cpos.features"] || {}).siteTheme === true;
    if (!on || !T) {
      remove();
      return;
    }
    apply(T.get(raw["cpos.siteThemeId"] || "github"));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes["cpos.features"] || changes["cpos.siteThemeId"])) sync();
  });

  sync();
})();
