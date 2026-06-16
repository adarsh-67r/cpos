// CPOS Practice Ladders — a standalone extension page (ladder.html) opened in a
// tab from the popup. It fetches problemset.problems (rating + tags) and the
// user's user.status (solved set), then builds rating-bucketed LADDERS
// (800,900,…,3500). For each rating it lists a deterministic set of problems,
// marks solved ones green using the user's distinct solved set, and shows
// per-ladder progress (solved/total + a bar). The handle is entered by the user
// or remembered in chrome.storage.local (shared with the on-page tools), and
// the focused ladder is persisted. Dependency-free; theme via CPOS_THEMES.
// Robust to API failure and a missing handle (prompts for it). Local-first.
(function () {
  const T = self.CPOS_THEMES;
  const C = self.CPOS;

  // Reuse the same handle/status cache the content scripts use, plus ladder prefs.
  const STATUS_KEY = "cpos.cf.status";          // { handle, ts, solved:[], attempted:[] }
  const HANDLE_KEY = "cpos.ladder.handle";      // last handle entered here
  const FOCUS_KEY = "cpos.ladder.focus";        // last focused rating
  const PROBLEMS_KEY = "cpos.ladder.problems";  // { ts, problems:[{id,index,name,rating,tags}] }
  const STATUS_TTL = 10 * 60 * 1000;
  const PROBLEMS_TTL = 24 * 60 * 60 * 1000;

  const RATINGS = [];
  for (let r = 800; r <= 3500; r += 100) RATINGS.push(r);
  const PER_LADDER = 50; // problems shown per rating bucket

  // ── tiny helpers ─────────────────────────────────────────────────────────────
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  async function cfApi(method, qs) {
    const res = await fetch("https://codeforces.com/api/" + method + "?" + qs, { cache: "no-store" });
    if (!res.ok) throw new Error(method + " HTTP " + res.status);
    const json = await res.json();
    if (json.status !== "OK") throw new Error(json.comment || method + " failed");
    return json.result;
  }

  // Deterministic hash → stable per-(handle,problem) ordering, stable per day.
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function todayStamp() {
    const d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  // ── data layer ───────────────────────────────────────────────────────────────
  let problems = null;        // [{ id, index, name, rating, tags, key }]
  let solvedSet = new Set();  // distinct "contestId-INDEX"
  let activeHandle = "";
  let focusRating = null;

  async function loadProblems(force) {
    if (problems && !force) return problems;
    const stored = await C.get([PROBLEMS_KEY]);
    const rec = stored[PROBLEMS_KEY];
    if (!force && rec && rec.problems && (Date.now() - (rec.ts || 0) < PROBLEMS_TTL)) {
      problems = rec.problems;
      return problems;
    }
    const result = await cfApi("problemset.problems", "");
    const out = [];
    for (const p of (result.problems || [])) {
      if (p.contestId == null || !p.index || p.rating == null) continue;
      const key = p.contestId + "-" + String(p.index).toUpperCase();
      out.push({ id: p.contestId, index: String(p.index).toUpperCase(), name: p.name || "", rating: p.rating, tags: p.tags || [], key });
    }
    problems = out;
    // Persist a trimmed copy (drop tags to keep storage small).
    const slim = out.map((p) => ({ id: p.id, index: p.index, name: p.name, rating: p.rating, tags: [], key: p.key }));
    await C.set({ [PROBLEMS_KEY]: { ts: Date.now(), problems: slim } });
    return problems;
  }

  async function loadSolved(handle, force) {
    if (!handle) { solvedSet = new Set(); return solvedSet; }
    const stored = await C.get([STATUS_KEY]);
    const rec = stored[STATUS_KEY];
    if (!force && rec && rec.handle === handle && (Date.now() - (rec.ts || 0) < STATUS_TTL)) {
      solvedSet = new Set(rec.solved || []);
      return solvedSet;
    }
    const subs = await cfApi("user.status", "handle=" + encodeURIComponent(handle) + "&from=1&count=100000");
    const solved = new Set(), attempted = new Set();
    for (const s of subs) {
      const p = s.problem || {};
      if (p.contestId == null || !p.index) continue;
      const k = p.contestId + "-" + String(p.index).toUpperCase();
      attempted.add(k);
      if (s.verdict === "OK") solved.add(k);
    }
    await C.set({ [STATUS_KEY]: { handle, ts: Date.now(), solved: [...solved], attempted: [...attempted] } });
    solvedSet = solved;
    return solvedSet;
  }

  // Deterministic selection: for each rating bucket, sort by a stable hash of the
  // problem key salted with the handle + today's date, take PER_LADDER. Same all
  // day for a given handle; varies per handle so two people get different sets.
  function ladderFor(rating) {
    const salt = activeHandle + "|" + todayStamp() + "|" + rating;
    const inBucket = problems.filter((p) => p.rating === rating);
    inBucket.sort((a, b) => {
      const ha = hashStr(salt + "|" + a.key), hb = hashStr(salt + "|" + b.key);
      return ha - hb || (a.id - b.id) || a.index.localeCompare(b.index);
    });
    return inBucket.slice(0, PER_LADDER);
  }

  function ladderProgress(list) {
    let solved = 0;
    for (const p of list) if (solvedSet.has(p.key)) solved++;
    return { solved, total: list.length };
  }

  // ── rendering ────────────────────────────────────────────────────────────────
  function setStatus(msg, kind) {
    const s = $("cpos-ladder-status");
    if (!msg) { s.textContent = ""; s.className = "cpos-ladder-status"; return; }
    s.textContent = msg;
    s.className = "cpos-ladder-status show" + (kind ? " " + kind : "");
  }

  function renderNav() {
    const nav = $("cpos-ladder-nav");
    nav.innerHTML = "";
    nav.appendChild(el("div", "cpos-nav-head", "Ladders"));
    for (const r of RATINGS) {
      const list = ladderFor(r);
      if (!list.length) continue;
      const { solved, total } = ladderProgress(list);
      const pct = total ? Math.round((solved / total) * 100) : 0;
      const item = el("button", "cpos-nav-item" + (r === focusRating ? " active" : ""));
      item.innerHTML =
        '<span class="cpos-nav-r">' + r + "</span>" +
        '<span class="cpos-nav-bar"><span class="cpos-nav-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="cpos-nav-c' + (solved === total && total ? " done" : "") + '">' + solved + "/" + total + "</span>";
      item.addEventListener("click", () => focusOn(r));
      nav.appendChild(item);
    }
  }

  function problemUrl(p) {
    return "https://codeforces.com/problemset/problem/" + p.id + "/" + p.index;
  }

  function renderContent() {
    const c = $("cpos-ladder-content");
    c.innerHTML = "";
    if (!focusRating) focusRating = RATINGS[0];
    const list = ladderFor(focusRating);

    const head = el("div", "cpos-content-head");
    const { solved, total } = ladderProgress(list);
    const pct = total ? Math.round((solved / total) * 100) : 0;
    head.innerHTML =
      '<div class="cpos-content-title">Rating ' + focusRating +
      (activeHandle ? ' <span class="cpos-who">@' + esc(activeHandle) + "</span>" : "") + "</div>" +
      '<div class="cpos-content-prog"><span class="cpos-content-bar"><span class="cpos-content-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="cpos-content-num">' + solved + " / " + total + " solved · " + pct + "%</span></div>";
    c.appendChild(head);

    if (!list.length) {
      c.appendChild(el("div", "cpos-empty", "No problems at this rating."));
      return;
    }

    const ul = el("ul", "cpos-prob-list");
    list.forEach((p, i) => {
      const done = solvedSet.has(p.key);
      const li = el("li", "cpos-prob" + (done ? " solved" : ""));
      const tags = (p.tags || []).slice(0, 4).map((t) => '<span class="cpos-tag">' + esc(t) + "</span>").join("");
      li.innerHTML =
        '<span class="cpos-prob-idx">' + (i + 1) + "</span>" +
        '<span class="cpos-prob-mark" aria-hidden="true">' + (done ? "&#10003;" : "&#9675;") + "</span>" +
        '<a class="cpos-prob-link" href="' + problemUrl(p) + '" target="_blank" rel="noopener">' +
        '<span class="cpos-prob-id">' + p.id + p.index + "</span> " +
        '<span class="cpos-prob-name">' + esc(p.name) + "</span></a>" +
        '<span class="cpos-prob-tags">' + tags + "</span>";
      ul.appendChild(li);
    });
    c.appendChild(ul);
  }

  function renderAll() {
    renderNav();
    renderContent();
  }

  async function focusOn(r) {
    focusRating = r;
    await C.set({ [FOCUS_KEY]: r });
    renderAll();
  }

  // ── theme ──────────────────────────────────────────────────────────────────
  async function applyTheme() {
    if (!T || !C) return;
    T.applyTheme(document.body, await C.activeThemeId());
  }

  // ── handle scraping fallback (from cached status if available) ───────────────
  async function rememberedHandle() {
    const raw = await C.get([HANDLE_KEY, STATUS_KEY]);
    if (raw[HANDLE_KEY]) return raw[HANDLE_KEY];
    if (raw[STATUS_KEY] && raw[STATUS_KEY].handle) return raw[STATUS_KEY].handle;
    return "";
  }

  // ── load orchestration ───────────────────────────────────────────────────────
  let loading = false;
  async function loadAll(handle, opts) {
    opts = opts || {};
    if (loading) return;
    loading = true;
    const input = $("cpos-handle-input");
    try {
      setStatus("Loading problemset…");
      await loadProblems(opts.forceProblems);
      if (handle) {
        setStatus("Loading @" + handle + " solved status…");
        try {
          await loadSolved(handle, opts.forceStatus);
          activeHandle = handle;
          await C.set({ [HANDLE_KEY]: handle });
          setStatus("Loaded " + problems.length + " problems · @" + handle, "ok");
        } catch (e) {
          activeHandle = handle;
          solvedSet = new Set();
          setStatus("Could not load solved status for @" + handle + " (" + e.message + "). Showing ladders without progress.", "warn");
        }
      } else {
        activeHandle = "";
        solvedSet = new Set();
        setStatus("Enter your Codeforces handle to track solved progress.", "warn");
      }
      if (input && handle) input.value = handle;
      renderAll();
    } catch (e) {
      setStatus("Could not reach the Codeforces API (" + e.message + "). Check your connection and press Refresh.", "bad");
    } finally {
      loading = false;
    }
  }

  // ── init ─────────────────────────────────────────────────────────────────────
  function wire() {
    $("cpos-handle-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const h = $("cpos-handle-input").value.trim();
      if (h) loadAll(h, { forceStatus: true });
      else loadAll("", {});
    });
    $("cpos-refresh-btn").addEventListener("click", () => {
      loadAll(activeHandle || $("cpos-handle-input").value.trim(), { forceProblems: true, forceStatus: true });
    });
  }

  async function init() {
    if (!C || !T) {
      document.getElementById("cpos-ladder-status").textContent = "CPOS scripts failed to load.";
      return;
    }
    await applyTheme();
    C.onChange((changes) => { if (!changes[C.KEYS.FEATURES] || true) applyTheme(); });

    const raw = await C.get([FOCUS_KEY]);
    if (raw[FOCUS_KEY] && RATINGS.includes(raw[FOCUS_KEY])) focusRating = raw[FOCUS_KEY];

    wire();
    const handle = await rememberedHandle();
    if (handle) $("cpos-handle-input").value = handle;
    await loadAll(handle, {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
