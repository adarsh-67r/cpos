// CPOS contest reminders — popup UI. Self-contained IIFE that renders into the
// #cpos-contests-section container if the popup includes it. Reads/writes the
// "cpos.contests.*" storage keys and talks to the background module by message.
// Uses inherited theme CSS vars (the popup applies them to <body>).
(function () {
  const root = document.getElementById("cpos-contests-section");
  if (!root) return; // popup didn't include the section — do nothing
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;

  const FEATURE_KEY = "contestReminders";
  const FEATURES_STORE_KEY = "cpos.features";
  const K = {
    LIST: "cpos.contests.list",
    REMINDERS: "cpos.contests.reminders",
    LEAD: "cpos.contests.leadMinutes"
  };
  const DEFAULT_LEAD = 30;
  const LEAD_OPTIONS = [10, 15, 30, 60, 120];

  const store = chrome.storage.local;
  const get = (keys) => new Promise((res) => store.get(keys, (v) => res(v || {})));
  const set = (obj) => new Promise((res) => store.set(obj, () => res()));

  function sendMsg(msg) {
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage(msg, (reply) => {
          void chrome.runtime.lastError; // swallow "no receiver"
          res(reply || null);
        });
      } catch {
        res(null);
      }
    });
  }

  let state = { contests: [], reminders: {}, lead: DEFAULT_LEAD, featureOn: true, loading: true };

  async function loadState() {
    const raw = await get([K.LIST, K.REMINDERS, K.LEAD, FEATURES_STORE_KEY]);
    const list = raw[K.LIST] || {};
    const features = raw[FEATURES_STORE_KEY] || {};
    state.contests = list.contests || [];
    state.reminders = raw[K.REMINDERS] || {};
    const n = Number(raw[K.LEAD]);
    state.lead = Number.isFinite(n) && n > 0 ? n : DEFAULT_LEAD;
    state.featureOn = features[FEATURE_KEY] !== false; // default on
  }

  function fmtCountdown(startSeconds) {
    const ms = startSeconds * 1000 - Date.now();
    if (ms <= 0) return "starting";
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `in ${d}d ${h}h`;
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  }
  function fmtLocal(startSeconds) {
    try {
      return new Date(startSeconds * 1000).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render() {
    root.innerHTML = "";

    const head = el("div", "cc-head");
    head.appendChild(el("span", "cc-title", "Upcoming contests"));
    const refresh = el("button", "cc-refresh", "↻");
    refresh.title = "Refresh";
    refresh.onclick = () => doRefresh(true);
    head.appendChild(refresh);
    root.appendChild(head);

    // Global lead selector.
    const leadRow = el("div", "cc-lead");
    leadRow.appendChild(el("span", "cc-lead-label", "Remind me"));
    const sel = el("select", "cc-select");
    for (const v of LEAD_OPTIONS) {
      const o = el("option", null, v >= 60 ? `${v / 60} h before` : `${v} min before`);
      o.value = String(v);
      if (v === state.lead) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = async () => {
      state.lead = Number(sel.value);
      await set({ [K.LEAD]: state.lead });
    };
    leadRow.appendChild(sel);
    root.appendChild(leadRow);

    if (!state.featureOn) {
      root.appendChild(el("div", "cc-empty", "Contest reminders are off. Enable them above."));
      return;
    }
    if (state.loading && state.contests.length === 0) {
      root.appendChild(el("div", "cc-empty", "Loading contests…"));
      return;
    }
    if (state.contests.length === 0) {
      root.appendChild(el("div", "cc-empty", "No upcoming contests found."));
      return;
    }

    const listEl = el("div", "cc-list");
    for (const c of state.contests) {
      const item = el("div", "cc-item");

      const info = el("div", "cc-info");
      info.appendChild(el("div", "cc-name", c.name));
      const meta = el("div", "cc-meta");
      meta.appendChild(el("span", "cc-when", fmtLocal(c.startTimeSeconds)));
      meta.appendChild(el("span", "cc-cd", fmtCountdown(c.startTimeSeconds)));
      info.appendChild(meta);
      item.appendChild(info);

      const sw = el("label", "cc-sw");
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.checked = !!state.reminders[c.id];
      inp.title = "Remind me before this contest";
      inp.onchange = async () => {
        if (inp.checked) state.reminders[c.id] = true;
        else delete state.reminders[c.id];
        await set({ [K.REMINDERS]: state.reminders });
      };
      sw.appendChild(inp);
      sw.appendChild(el("span"));
      item.appendChild(sw);

      listEl.appendChild(item);
    }
    root.appendChild(listEl);
  }

  async function doRefresh(force) {
    state.loading = true;
    render();
    const reply = await sendMsg({ type: "cpos-contests-refresh", force: !!force });
    if (reply && reply.ok && Array.isArray(reply.contests)) {
      state.contests = reply.contests;
    } else {
      // Background unavailable — fall back to whatever is in storage.
      await loadState();
    }
    state.loading = false;
    render();
  }

  // React to background updates / toggles flipped elsewhere in the popup.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[K.LIST] || changes[K.REMINDERS] || changes[K.LEAD] || changes[FEATURES_STORE_KEY]) {
      loadState().then(render);
    }
  });

  (async function init() {
    await loadState();
    render();
    doRefresh(false);
  })();
})();
