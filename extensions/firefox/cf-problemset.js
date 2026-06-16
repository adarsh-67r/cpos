// CPOS problemset tools — augments the Codeforces problemset list (/problemset*)
// and contest problem lists with solve-status awareness CF itself only shows in
// a limited way. All additive and theme-aware:
//   · SOLVE-STATUS row coloring — solved / attempted-unsolved / untouched, from
//     the logged-in handle (scraped from the page header) + user.status (cached).
//     Uses --ok / --warn tokens as a subtle row tint; CF's own styling is kept.
//   · a compact CPOS info strip (#cpos-cf-tools) with solved/attempted counts and
//     a minimal rating-distribution sparkline for the visible rows.
// Read-only: fetches the public CF API. Never touches capture/submit. Degrades
// gracefully when not logged in or the API is unreachable. Toggle from the CPOS
// popup (feature "problemsetTools").
(function () {
  const ROOT_ID = "cpos-cf-tools";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  if (!C) return;

  const FEATURE = "problemsetTools";
  const STATUS_KEY = "cpos.cf.status";   // { handle, ts, solved:[keys], attempted:[keys] }
  const STATUS_TTL = 10 * 60 * 1000;     // 10 min — submissions change often
  const ROW_ATTR = "data-cpos-cf-row";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function onProblemset() { return /^\/problemset(\/|$)/.test(location.pathname); }
  function onContestList() { return /^\/(?:contest|gym)\/\d+(\/|$)?$/.test(location.pathname); }

  async function cfApi(method, qs) {
    const res = await fetch(`https://codeforces.com/api/${method}?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(method + " HTTP " + res.status);
    const json = await res.json();
    if (json.status !== "OK") throw new Error(json.comment || method + " failed");
    return json.result;
  }

  // Logged-in handle from the header (top-right link to /profile/<handle>).
  function loggedInHandle() {
    const link = document.querySelector('#header a[href^="/profile/"], .lang-chooser a[href^="/profile/"], a.personal-sidebar[href^="/profile/"]');
    if (link) { const m = link.getAttribute("href").match(/\/profile\/([^/?#]+)/); if (m) return decodeURIComponent(m[1]); }
    // Fallback: any header profile link.
    const any = [...document.querySelectorAll('a[href^="/profile/"]')].find((a) => a.closest("#header, .lang-chooser"));
    if (any) { const m = any.getAttribute("href").match(/\/profile\/([^/?#]+)/); if (m) return decodeURIComponent(m[1]); }
    return null;
  }

  // ── status sets: distinct "contestId-INDEX" keys for solved + attempted ─────
  let statusSets = null; // { solved:Set, attempted:Set, handle }
  async function loadStatus(handle) {
    if (statusSets && statusSets.handle === handle) return statusSets;
    const stored = await C.get([STATUS_KEY]);
    const rec = stored[STATUS_KEY];
    if (rec && rec.handle === handle && (Date.now() - (rec.ts || 0) < STATUS_TTL)) {
      statusSets = { handle, solved: new Set(rec.solved), attempted: new Set(rec.attempted) };
      return statusSets;
    }
    try {
      const subs = await cfApi("user.status", "handle=" + encodeURIComponent(handle) + "&from=1&count=100000");
      const solved = new Set(), attempted = new Set();
      for (const s of subs) {
        const p = s.problem || {};
        if (p.contestId == null || !p.index) continue;
        const key = p.contestId + "-" + String(p.index).toUpperCase();
        attempted.add(key);
        if (s.verdict === "OK") solved.add(key);
      }
      await C.set({ [STATUS_KEY]: { handle, ts: Date.now(), solved: [...solved], attempted: [...attempted] } });
      statusSets = { handle, solved, attempted };
    } catch (e) {
      if (rec && rec.handle === handle) statusSets = { handle, solved: new Set(rec.solved), attempted: new Set(rec.attempted) };
      else statusSets = { handle, solved: new Set(), attempted: new Set() };
    }
    return statusSets;
  }

  // ── parse a problem key + rating out of a table row ─────────────────────────
  // Works for the problemset table and contest problem tables (both .problems).
  function rowKey(tr) {
    // Any cell link to /problemset/problem/<id>/<idx> or /contest|gym/<id>/problem/<idx>.
    const a = tr.querySelector('a[href*="/problem/"]');
    if (!a) return null;
    const href = a.getAttribute("href") || "";
    let m = href.match(/\/problemset\/problem\/(\d+)\/([^/?#]+)/) ||
            href.match(/\/(?:contest|gym)\/(\d+)\/problem\/([^/?#]+)/);
    if (!m) return null;
    return m[1] + "-" + decodeURIComponent(m[2]).toUpperCase();
  }
  function rowRating(tr) {
    // Problemset rows expose rating via a span title or the difficulty cell.
    const span = tr.querySelector("span[title][style*='cursor']") || tr.querySelector(".ProblemRating");
    if (span) { const v = parseInt(span.getAttribute("title") || span.textContent, 10); if (!isNaN(v)) return v; }
    return null;
  }

  function problemRows() {
    // CF problemset + contest problem lists both use table.problems.
    const tables = document.querySelectorAll("table.problems");
    const rows = [];
    tables.forEach((t) => t.querySelectorAll("tr").forEach((tr) => {
      if (tr.querySelector("th")) return;
      if (rowKey(tr)) rows.push(tr);
    }));
    return rows;
  }

  // ── apply / clear row tints ─────────────────────────────────────────────────
  function colorRows(sets) {
    let solved = 0, attempted = 0, total = 0;
    const ratings = [];
    for (const tr of problemRows()) {
      const key = rowKey(tr);
      if (!key) continue;
      total++;
      const r = rowRating(tr);
      if (r != null) ratings.push(r);
      tr.setAttribute(ROW_ATTR, "1");
      tr.classList.remove("cpos-cf-solved", "cpos-cf-attempted");
      if (sets.solved.has(key)) { tr.classList.add("cpos-cf-solved"); solved++; }
      else if (sets.attempted.has(key)) { tr.classList.add("cpos-cf-attempted"); attempted++; }
    }
    return { solved, attempted, total, ratings };
  }
  function clearRows() {
    document.querySelectorAll("[" + ROW_ATTR + "]").forEach((tr) => {
      tr.classList.remove("cpos-cf-solved", "cpos-cf-attempted");
      tr.removeAttribute(ROW_ATTR);
    });
  }

  // ── compact info strip ───────────────────────────────────────────────────────
  function sparkline(ratings) {
    if (!ratings.length) return "";
    const buckets = {};
    for (const r of ratings) { const b = Math.floor(r / 100) * 100; buckets[b] = (buckets[b] || 0) + 1; }
    const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    const max = Math.max(...keys.map((k) => buckets[k]), 1);
    const bars = keys.map((k) =>
      '<span class="cpos-cf-spark-bar" title="' + k + ": " + buckets[k] + ' shown" style="height:' +
      Math.max(8, Math.round((buckets[k] / max) * 100)) + '%"></span>').join("");
    return '<span class="cpos-cf-spark" title="rating distribution of shown problems">' + bars + "</span>";
  }

  function buildStrip(stats, handle, sets) {
    let root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    root = el("div", "cpos-cf-tools strip");
    root.id = ROOT_ID;

    const head = el("span", "cpos-cf-head", '<span class="badge">CPOS</span>');
    root.appendChild(head);

    if (handle && sets) {
      const untouched = Math.max(0, stats.total - stats.solved - stats.attempted);
      root.appendChild(el("span", "cpos-cf-stat",
        '<b style="color:var(--ok)">' + stats.solved + "</b> solved"));
      root.appendChild(el("span", "cpos-cf-stat",
        '<b style="color:var(--warn)">' + stats.attempted + "</b> attempted"));
      root.appendChild(el("span", "cpos-cf-stat",
        '<b>' + untouched + "</b> untouched"));
      root.appendChild(el("span", "cpos-cf-who", "@" + esc(handle)));
    } else {
      root.appendChild(el("span", "cpos-cf-lbl", "Sign in for solve-status coloring"));
    }
    const spark = sparkline(stats.ratings);
    if (spark) root.appendChild(el("span", "cpos-cf-spark-wrap", spark));

    // Insert above the first problems table.
    const table = document.querySelector("table.problems");
    const anchor = table ? (table.closest(".datatable") || table) : null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(root, anchor);
    else (document.querySelector("#pageContent") || document.body).prepend(root);
    applyTheme(root);
  }

  async function applyTheme(node) {
    if (!T || !C) return;
    const id = await C.activeThemeId();
    if (node) T.applyTheme(node, id);
    // Mirror --ok/--warn onto :root so the row tints (not descendants of the
    // strip) track the active palette. CSS reads --cpos-row-ok / --cpos-row-warn.
    const tokens = T.get(id);
    document.documentElement.style.setProperty("--cpos-row-ok", tokens["--ok"]);
    document.documentElement.style.setProperty("--cpos-row-warn", tokens["--warn"]);
  }
  function clearRowTokens() {
    document.documentElement.style.removeProperty("--cpos-row-ok");
    document.documentElement.style.removeProperty("--cpos-row-warn");
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────
  let observer = null;
  let lastSets = null, lastHandle = null;

  async function buildAll() {
    if (!(onProblemset() || onContestList())) return;
    const handle = loggedInHandle();
    lastHandle = handle;
    let sets = null, stats;
    if (handle) {
      sets = await loadStatus(handle);
      lastSets = sets;
      stats = colorRows(sets);
    } else {
      // Still color nothing, but compute the rating distribution for the strip.
      stats = { solved: 0, attempted: 0, total: 0, ratings: [] };
      for (const tr of problemRows()) { const r = rowRating(tr); if (r != null) stats.ratings.push(r); stats.total++; }
    }
    buildStrip(stats, handle, sets);

    if (!observer) {
      observer = new MutationObserver(() => {
        if (!document.getElementById(ROOT_ID)) return;
        if (lastSets) colorRows(lastSets);
      });
      const tbl = document.querySelector("table.problems");
      if (tbl) observer.observe(tbl, { childList: true, subtree: true });
    }
  }

  function remove() {
    observer?.disconnect();
    observer = null;
    document.getElementById(ROOT_ID)?.remove();
    clearRows();
    clearRowTokens();
  }

  async function sync() {
    const on = await C.feature(FEATURE);
    if (on) buildAll().catch((e) => console.debug("CPOS problemsetTools:", e));
    else remove();
  }

  C.onChange((changes) => {
    if (changes[C.KEYS.FEATURES]) sync();
    else { const root = document.getElementById(ROOT_ID); if (root) applyTheme(root); }
  });
  if (document.body) sync();
  else document.addEventListener("DOMContentLoaded", () => sync());
})();
