// Shared CPOS theme tokens — loaded by the popup, the analytics page, and the
// page content scripts so everything (popup chrome + injected site themes)
// draws from one palette. Flat, no gradients; mirrors the VS Code panel / TUI.
//
// Each theme is a flat map of CSS custom properties. `applyTheme(root, id)`
// writes them onto an element's style. Site theming (Phase 3) maps a subset of
// these onto Codeforces/CSES selectors.

(function (root) {
  const THEMES = {
    purple: {
      name: "Purple",
      "--bg": "#14141f",
      "--panel": "#1b1b2b",
      "--panel-2": "#20202e",
      "--fg": "#e8e6f0",
      "--dim": "#8a86a3",
      "--border": "#2a2a3e",
      "--accent": "#b794ff",
      "--accent-dim": "#7c5cbf",
      "--accent-on": "#14141f",
      "--ok": "#7ee787",
      "--bad": "#ff7a93",
      "--warn": "#f0b860",
      "--cf": "#7aa2f7"
    },
    github: {
      name: "GitHub Dark",
      "--bg": "#0d1117",
      "--panel": "#161b22",
      "--panel-2": "#1c2128",
      "--fg": "#e6edf3",
      "--dim": "#7d8590",
      "--border": "#30363d",
      "--accent": "#6cb6ff",
      "--accent-dim": "#3b6ea5",
      "--accent-on": "#0d1117",
      "--ok": "#3fb950",
      "--bad": "#f85149",
      "--warn": "#d29922",
      "--cf": "#6cb6ff"
    },
    amber: {
      name: "Amber",
      "--bg": "#16130c",
      "--panel": "#1e1a10",
      "--panel-2": "#2a2418",
      "--fg": "#f1e9d6",
      "--dim": "#a8966c",
      "--border": "#2a2418",
      "--accent": "#f0b860",
      "--accent-dim": "#aa7c30",
      "--accent-on": "#16130c",
      "--ok": "#b8c46a",
      "--bad": "#e88a6a",
      "--warn": "#f0b860",
      "--cf": "#e0b341"
    },
    mono: {
      name: "Mono",
      "--bg": "#101010",
      "--panel": "#181818",
      "--panel-2": "#202020",
      "--fg": "#e0e0e0",
      "--dim": "#8a8a8a",
      "--border": "#2a2a2a",
      "--accent": "#e0e0e0",
      "--accent-dim": "#8a8a8a",
      "--accent-on": "#101010",
      "--ok": "#c8d4c8",
      "--bad": "#d6b0b0",
      "--warn": "#d8cba0",
      "--cf": "#cfcfcf"
    },
    light: {
      name: "Light",
      "--bg": "#f6f6fb",
      "--panel": "#ffffff",
      "--panel-2": "#eeeef4",
      "--fg": "#1c1c28",
      "--dim": "#6a6a80",
      "--border": "#d8d8e2",
      "--accent": "#6d4bd0",
      "--accent-dim": "#9a7ee0",
      "--accent-on": "#ffffff",
      "--ok": "#1a7f37",
      "--bad": "#cf222e",
      "--warn": "#9a6700",
      "--cf": "#3b5bdb"
    },
    // Flat teal/slate dark palette (no gradients), tuned for CF dark-mode contrast.
    ocean: {
      name: "Ocean",
      "--bg": "#0c1418",
      "--panel": "#111c22",
      "--panel-2": "#16242c",
      "--fg": "#dce8ec",
      "--dim": "#7e95a0",
      "--border": "#243640",
      "--accent": "#4fd1c5",
      "--accent-dim": "#2c8a82",
      "--accent-on": "#0c1418",
      "--ok": "#5bd99a",
      "--bad": "#ff8b8b",
      "--warn": "#e6c060",
      "--cf": "#6cc5e0"
    },
    // Flat rose-tinted dark palette (no gradients), warm but high-contrast.
    rose: {
      name: "Rose",
      "--bg": "#15101300",
      "--panel": "#1c1418",
      "--panel-2": "#241a1f",
      "--fg": "#f0e2e6",
      "--dim": "#a98a92",
      "--border": "#33242a",
      "--accent": "#ff8fb0",
      "--accent-dim": "#bf5d79",
      "--accent-on": "#151013",
      "--ok": "#8fd6a0",
      "--bad": "#ff7a7a",
      "--warn": "#e8b96a",
      "--cf": "#f49ac0"
    }
  };

  // Fix the typo'd bg above (kept 6-digit hex everywhere downstream expects it).
  THEMES.rose["--bg"] = "#151013";

  // Structural token defaults — the geometry scale CPOS_STYLE_CORE applies. Kept
  // here so the palette file is the single place to tweak the look. These are
  // NOT per-theme colour keys; they're shared, flat (no gradients) and read by
  // the style core's STRUCT defaults. Exposed for reference / popup use.
  const STRUCT_TOKENS = {
    "--radius-sm": "8px",
    "--radius": "12px",
    "--radius-lg": "16px",
    "--space": "16px",
    "--shadow": "0 1px 2px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
    "--font-sans":
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
    "--font-mono":
      '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  };

  const DEFAULT_THEME = "purple";

  function get(id) {
    return THEMES[id] || THEMES[DEFAULT_THEME];
  }

  function applyTheme(el, id) {
    const theme = get(id);
    for (const [key, value] of Object.entries(theme)) {
      if (key === "name") continue;
      el.style.setProperty(key, value);
    }
  }

  const api = { THEMES, DEFAULT_THEME, STRUCT_TOKENS, get, applyTheme, list: () => Object.keys(THEMES) };

  // Works both as a content-script global and (via importScripts-free) the popup.
  root.CPOS_THEMES = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
