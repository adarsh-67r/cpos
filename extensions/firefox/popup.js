// CPOS popup hub. Reads/writes feature flags + theme to chrome.storage.local;
// content scripts react to those changes live. Never touches submit/capture.
(function () {
  const T = self.CPOS_THEMES;
  const ENDPOINTS = ["http://127.0.0.1:27122", "http://127.0.0.1:27121"];

  const DEFAULTS = {
    "cpos.ui.theme": T.DEFAULT_THEME,
    "cpos.siteThemeId": "github",
    "cpos.features": { profile: true, carrot: true, highlight: true, ide: true, problemTools: true, problemsetTools: true, standingsTools: true, contestReminders: true, dailyProblem: true, favorites: true, problemTimer: true, ladder: true, profileCompare: true, annotate: false, modernize: false, siteTheme: false }
  };

  const store = chrome.storage.local;
  const get = (keys) => new Promise((res) => store.get(keys, res));
  const set = (obj) => new Promise((res) => store.set(obj, res));

  let state = {};

  async function load() {
    const raw = await get(Object.keys(DEFAULTS));
    state = {
      uiTheme: raw["cpos.ui.theme"] || DEFAULTS["cpos.ui.theme"],
      siteThemeId: raw["cpos.siteThemeId"] || DEFAULTS["cpos.siteThemeId"],
      features: Object.assign({}, DEFAULTS["cpos.features"], raw["cpos.features"] || {})
    };
  }

  function applyUiTheme() {
    T.applyTheme(document.body, state.uiTheme);
    document.body.setAttribute("data-theme", state.uiTheme);
  }

  function swatchEl(id, selected, onClick) {
    const theme = T.get(id);
    const b = document.createElement("button");
    b.className = "swatch" + (selected ? " sel" : "");
    b.title = theme.name;
    b.style.background = theme["--panel"];
    const pip = document.createElement("span");
    pip.className = "pip";
    pip.style.background = theme["--accent"];
    b.appendChild(pip);
    b.onclick = onClick;
    return b;
  }

  function renderSwatches() {
    const ui = document.getElementById("uiSwatches");
    const site = document.getElementById("siteSwatches");
    ui.innerHTML = "";
    site.innerHTML = "";
    for (const id of T.list()) {
      ui.appendChild(
        swatchEl(id, id === state.uiTheme, async () => {
          state.uiTheme = id;
          await set({ "cpos.ui.theme": id });
          applyUiTheme();
          renderSwatches();
        })
      );
      site.appendChild(
        swatchEl(id, id === state.siteThemeId, async () => {
          state.siteThemeId = id;
          await set({ "cpos.siteThemeId": id });
          renderSwatches();
        })
      );
    }
  }

  function renderToggles() {
    document.querySelectorAll("[data-feature-input]").forEach((inp) => {
      const key = inp.getAttribute("data-feature-input");
      inp.checked = !!state.features[key];
      inp.onchange = async () => {
        state.features[key] = inp.checked;
        await set({ "cpos.features": state.features });
      };
    });
  }

  async function checkConnection() {
    const dot = document.getElementById("connDot");
    const text = document.getElementById("connText");
    for (const base of ENDPOINTS) {
      try {
        const res = await fetch(`${base}/pending-submit`, { cache: "no-store" });
        if (res.ok) {
          dot.className = "dot on";
          text.textContent = base.includes("27122") ? "VS Code" : "TUI";
          return;
        }
      } catch {
        /* try next */
      }
    }
    dot.className = "dot off";
    text.textContent = "not running";
  }

  function wire() {
    document.getElementById("ver").textContent = "v" + chrome.runtime.getManifest().version;

    // Open the standalone Practice Ladders page in a new tab.
    document.getElementById("cpos-open-ladder")?.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("ladder.html") });
    });

    // Hint which site the active tab is on.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || "";
      const hint = document.getElementById("siteHint");
      if (url.includes("codeforces.com")) hint.textContent = "· on Codeforces";
      else if (url.includes("cses.fi")) hint.textContent = "· on CSES";
      else hint.textContent = "· open CF/CSES to use";
    });
  }

  (async function init() {
    await load();
    // Persist the resolved feature set so content scripts and the toggles agree
    // on first run (otherwise storage stays empty until a toggle is flipped).
    await set({ "cpos.features": state.features });
    applyUiTheme();
    renderSwatches();
    renderToggles();
    wire();
    checkConnection();
  })();
})();
