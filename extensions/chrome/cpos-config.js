// Shared CPOS config — one source of truth for feature flags + theme selection,
// used by the popup and every content script so defaults never drift. Loaded
// before the other scripts in each content_scripts entry.
(function (root) {
  const KEYS = {
    UI_THEME: "cpos.ui.theme",
    SITE_THEME: "cpos.siteThemeId",
    FEATURES: "cpos.features"
  };

  // Default ON for the things that should "just work" when you open a page.
  // siteTheme is opt-in (it restyles the whole site) — everything else is on.
  const DEFAULT_FEATURES = {
    profile: true,
    carrot: true,
    highlight: true,
    ide: true,
    modernize: false,
    siteTheme: false
  };
  const DEFAULT_UI_THEME = "purple";
  const DEFAULT_SITE_THEME = "github";

  const store = (chrome && chrome.storage && chrome.storage.local) || null;

  function get(keys) {
    return new Promise((res) => {
      if (!store) return res({});
      store.get(keys, (v) => res(v || {}));
    });
  }
  function set(obj) {
    return new Promise((res) => {
      if (!store) return res();
      store.set(obj, () => res());
    });
  }

  async function load() {
    const raw = await get([KEYS.UI_THEME, KEYS.SITE_THEME, KEYS.FEATURES]);
    return {
      uiTheme: raw[KEYS.UI_THEME] || DEFAULT_UI_THEME,
      siteThemeId: raw[KEYS.SITE_THEME] || DEFAULT_SITE_THEME,
      features: Object.assign({}, DEFAULT_FEATURES, raw[KEYS.FEATURES] || {})
    };
  }

  // Resolve a true/false for one feature, honoring defaults for missing keys.
  async function feature(name) {
    const cfg = await load();
    return cfg.features[name] !== false && (cfg.features[name] === true || DEFAULT_FEATURES[name]);
  }

  // The theme id a content script should paint with: the site palette when site
  // theming is on, otherwise the extension UI palette.
  async function activeThemeId() {
    const cfg = await load();
    return cfg.features.siteTheme ? cfg.siteThemeId : cfg.uiTheme;
  }

  // Write defaults once so the popup toggles reflect reality on first run.
  async function ensureDefaults() {
    const raw = await get([KEYS.FEATURES]);
    if (!raw[KEYS.FEATURES]) await set({ [KEYS.FEATURES]: DEFAULT_FEATURES });
  }

  function onChange(cb) {
    if (!chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[KEYS.FEATURES] || changes[KEYS.UI_THEME] || changes[KEYS.SITE_THEME]) {
        cb(changes);
      }
    });
  }

  root.CPOS = {
    KEYS,
    DEFAULT_FEATURES,
    DEFAULT_UI_THEME,
    DEFAULT_SITE_THEME,
    get,
    set,
    load,
    feature,
    activeThemeId,
    ensureDefaults,
    onChange
  };
})(typeof self !== "undefined" ? self : this);
