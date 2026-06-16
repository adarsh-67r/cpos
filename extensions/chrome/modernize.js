// CPOS Modernize — a deep, sleek STRUCTURAL restyle for Codeforces / CSES:
// modern system font, roomier spacing, rounded flat card-style boxes (the old
// corner-image artifacts are neutralised), cleaner table rhythm, crisp controls,
// rounded code/sample blocks. Purely typographic / structural — colours are left
// entirely to the optional site theme, so the two COMPOSE. No gradients.
//
// All CSS comes from CPOS_STYLE_CORE (cpos-style-core.js, loaded first), which
// is the single source of truth shared with site-theme.js. This file just owns
// the <style> element lifecycle for the "modernize" feature toggle.
(function () {
  "use strict";
  const STYLE_ID = "cpos-modernize";
  const C = self.CPOS;
  const CORE = self.CPOS_STYLE_CORE;
  const isCf = location.hostname.endsWith("codeforces.com");
  const isCses = location.hostname.endsWith("cses.fi");

  function css() {
    if (!CORE) return "";
    if (isCf) return CORE.buildModernizeCf();
    if (isCses) return CORE.buildModernizeCses();
    return "";
  }

  function apply() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css();
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
    // Re-apply on any feature toggle (modernize on/off). Structural only, so it
    // ignores theme/palette changes — those are site-theme.js's concern.
    C.onChange((changes) => {
      if (changes[C.KEYS.FEATURES]) sync();
    });
    sync();
  }
})();
