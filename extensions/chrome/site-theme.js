// CPOS site theming — recolours Codeforces / CSES with the chosen CPOS palette.
// Pure additive CSS injection driven by chrome.storage; never touches the
// capture/submit flow, never moves/hides anything. ONLY colours/backgrounds/
// borders/accents are changed (geometry is modernize.js's job, so the two
// COMPOSE). Codeforces rating-tier handle colours are preserved.
//
// All recolouring CSS comes from CPOS_STYLE_CORE (cpos-style-core.js, loaded
// first) — the single source of truth shared with modernize.js — exhaustively
// covering header/menus, panels/round-boxes, tables, problem statement + sample
// tests, code, forms/buttons/pagination and verdict states; plus full CSES
// coverage. This file owns the <style> lifecycle for the "siteTheme" toggle and
// the protectCss() guard that keeps CPOS's own injected UI from being bled into.
// Toggle + palette come from the CPOS popup (feature "siteTheme").
(function () {
  "use strict";
  const STYLE_ID = "cpos-site-theme";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  const CORE = self.CPOS_STYLE_CORE;
  const host = location.hostname;
  const isCf = host.endsWith("codeforces.com");
  const isCses = host.endsWith("cses.fi");

  // Never let the site theme bleed into CPOS's OWN injected UI: the IDE editor
  // panel, the analytics page, the annotate overlay, and the CF-tools strip.
  // We neutralise inherited box-shadows and re-assert the editor's transparent
  // highlight overlay with high specificity so it keeps working when theming is
  // on. These selectors are siblings owned by other CPOS features.
  function protectCss() {
    return `
      #cpos-ide-panel, #cpos-ide-panel *, #cpos-ide-launch,
      .cpos-analytics, .cpos-analytics *,
      .cpos-annotate, .cpos-annotate *,
      #cpos-cf-tools, #cpos-cf-tools *,
      #cpos-standings-tools, #cpos-standings-tools *,
      #cpos-compare, #cpos-compare *,
      #cpos-analytics-root, #cpos-analytics-root * { box-shadow: none; }

      /* keep the IDE's transparent textarea + highlight overlay intact */
      #cpos-ide-panel .cpos-ed-ta {
        color: transparent !important; background: transparent !important; border: none !important;
      }
      #cpos-ide-panel .cpos-ed-hl, #cpos-ide-panel .cpos-ed-hl * { background: transparent !important; }
      #cpos-ide-panel input, #cpos-ide-panel textarea, #cpos-ide-panel select,
      #cpos-ide-panel pre, #cpos-ide-panel code {
        border-color: var(--cpos-border, #2a2a3e) !important;
      }
      .cpos-analytics a, .cpos-analytics a:visited { color: var(--accent, #b794ff) !important; }
      .cpos-analytics pre, .cpos-analytics code { background: transparent !important; }
    `;
  }

  // Default until storage resolves. The site recolour now uses the SAME single
  // chosen theme as the rest of CPOS (no separate site palette).
  let currentTheme = (T && T.get(C ? C.DEFAULT_UI_THEME : "purple")) || { name: "Purple" };

  function siteCss() {
    if (!CORE) return "";
    if (isCf) return CORE.buildThemeCf(currentTheme);
    if (isCses) return CORE.buildThemeCses(currentTheme);
    return "";
  }

  function apply() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    // protectCss() last so it wins the cascade for CPOS-owned UI.
    style.textContent = siteCss() + protectCss();
  }

  function remove() {
    document.getElementById(STYLE_ID)?.remove();
  }

  async function sync() {
    if (!C || !T) return;
    const cfg = await C.load();
    if (!cfg.features.siteTheme) {
      remove();
      return;
    }
    currentTheme = T.get(cfg.uiTheme || C.DEFAULT_UI_THEME);
    apply();
  }

  if (C) {
    // Apply the default theme immediately (sync) so the page is never unstyled
    // during the async storage read — prevents the flash of light CF colours.
    // sync() will swap to the user's chosen palette or remove if theme is off.
    apply();
    C.onChange(() => sync());
    sync();
  }
})();
