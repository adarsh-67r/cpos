// CPOS rating predictions — a "Carrot"-style predicted-delta column on
// Codeforces standings, computed with the official CF rating formula. Read-only:
// fetches the public CF API and annotates the standings table. Toggle from the
// CPOS popup (feature "carrot").
(function () {
  const COL_CLASS = "cpos-delta-cell";
  const HEAD_CLASS = "cpos-delta-head";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;

  // Publish the predicted-delta colours as :root custom props derived from the
  // active theme (the cells live inside CF's table, not a CPOS root, so we mirror
  // tokens onto :root the same way cf-problemset/cf-standings do). Re-derived on
  // theme change so the column tracks the chosen palette.
  async function applyTheme() {
    if (!T || !C) return;
    const tk = T.get(await (C.activePageThemeId ? C.activePageThemeId() : C.activeThemeId()));
    const root = document.documentElement.style;
    root.setProperty("--cpos-delta-up", tk["--ok"]);
    root.setProperty("--cpos-delta-down", tk["--bad"]);
    root.setProperty("--cpos-delta-zero", tk["--dim"]);
  }
  function clearTheme() {
    const root = document.documentElement.style;
    root.removeProperty("--cpos-delta-up");
    root.removeProperty("--cpos-delta-down");
    root.removeProperty("--cpos-delta-zero");
  }

  function contestId() {
    const m = location.pathname.match(/\/contest\/(\d+)\/standings/);
    return m ? m[1] : null;
  }

  async function cfApi(method, qs) {
    const res = await fetch(`https://codeforces.com/api/${method}?${qs}`, { cache: "no-store" });
    const json = await res.json();
    if (json.status !== "OK") throw new Error(json.comment || `${method} failed`);
    return json.result;
  }

  // --- Codeforces rating algorithm (bucketed by rating for O(buckets) seeds). ---
  function computeDeltas(contestants) {
    const n = contestants.length;
    if (!n) return new Map();

    // rating -> count, for fast seed sums.
    const buckets = new Map();
    for (const c of contestants) buckets.set(c.rating, (buckets.get(c.rating) || 0) + 1);
    const bucketArr = [...buckets.entries()];

    const elo = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const fullSeed = (x) => {
      let s = 1;
      for (const [rating, count] of bucketArr) s += count * elo(rating, x);
      return s;
    };
    const ratingToRank = (m) => {
      let lo = 1, hi = 8000;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (fullSeed(mid) < m) hi = mid;
        else lo = mid;
      }
      return lo;
    };

    const deltas = new Array(n);
    for (let i = 0; i < n; i++) {
      const seed = fullSeed(contestants[i].rating) - 0.5; // exclude self (~elo(r,r))
      const midRank = Math.sqrt(contestants[i].rank * seed);
      const need = ratingToRank(midRank);
      deltas[i] = Math.trunc((need - contestants[i].rating) / 2);
    }

    const order = [...Array(n).keys()].sort((a, b) => contestants[b].rating - contestants[a].rating);
    // Adjustment 1: shift so the sum is ~0.
    let sum = 0;
    for (let i = 0; i < n; i++) sum += deltas[i];
    const inc1 = Math.trunc(-sum / n) - 1;
    for (let i = 0; i < n; i++) deltas[i] += inc1;
    // Adjustment 2: keep the top ~4·sqrt(n) stable.
    const s = Math.min(n, Math.round(4 * Math.round(Math.sqrt(n))));
    let topSum = 0;
    for (let i = 0; i < s; i++) topSum += deltas[order[i]];
    const inc2 = Math.min(Math.max(Math.trunc(-topSum / s), -10), 0);
    for (let i = 0; i < n; i++) deltas[i] += inc2;

    const out = new Map();
    for (let i = 0; i < n; i++) out.set(contestants[i].handle, deltas[i]);
    return out;
  }

  async function fetchRatings(handles) {
    const ratings = new Map();
    const CHUNK = 300;
    for (let i = 0; i < handles.length; i += CHUNK) {
      const slice = handles.slice(i, i + CHUNK);
      try {
        const infos = await cfApi("user.info", "handles=" + slice.map(encodeURIComponent).join(";"));
        infos.forEach((info, k) => {
          if (info.handle) ratings.set(info.handle, info.rating != null ? info.rating : 1400);
          else if (slice[k]) ratings.set(slice[k], 1400);
        });
      } catch {
        for (const h of slice) ratings.set(h, 1400);
      }
    }
    return ratings;
  }

  async function getDeltas(id) {
    // Finished & rated → exact deltas from the official rating changes.
    try {
      const changes = await cfApi("contest.ratingChanges", "contestId=" + id);
      if (changes && changes.length) {
        const out = new Map();
        for (const c of changes) out.set(c.handle, { delta: c.newRating - c.oldRating, exact: true });
        return out;
      }
    } catch {
      /* not rated yet — predict below */
    }

    // Otherwise predict from current standings + current ratings.
    const standings = await cfApi("contest.standings", "contestId=" + id + "&showUnofficial=false");
    const contestants = [];
    const handles = [];
    for (const row of standings.rows) {
      const members = (row.party.members || []).map((m) => m.handle);
      if (members.length !== 1 || row.party.participantType !== "CONTESTANT") continue;
      const handle = members[0];
      handles.push(handle);
      contestants.push({ handle, rank: row.rank });
    }
    const ratings = await fetchRatings(handles);
    for (const c of contestants) c.rating = ratings.get(c.handle) ?? 1400;
    const deltaMap = computeDeltas(contestants);
    const out = new Map();
    for (const [h, d] of deltaMap) out.set(h, { delta: d, exact: false });
    return out;
  }

  function deltaSpan(d) {
    const span = document.createElement("span");
    const sign = d.delta > 0 ? "+" : "";
    span.textContent = sign + d.delta;
    span.style.fontWeight = "700";
    span.style.color = d.delta > 0 ? "var(--cpos-delta-up, #3fb950)"
      : d.delta < 0 ? "var(--cpos-delta-down, #f85149)"
      : "var(--cpos-delta-zero, #8a8a8a)";
    span.title = d.exact ? "official rating change" : "CPOS predicted Δ";
    return span;
  }

  function annotate(deltas) {
    const table = document.querySelector("table.standings");
    if (!table) return;
    table.querySelectorAll("." + COL_CLASS + ",." + HEAD_CLASS).forEach((e) => e.remove());

    const rows = table.querySelectorAll("tr");
    let exact = false;
    deltas.forEach((d) => { if (d.exact) exact = true; });

    rows.forEach((tr, idx) => {
      // Header row: add our column header after the first cell.
      if (idx === 0) {
        const th = document.createElement("th");
        th.className = HEAD_CLASS;
        th.textContent = exact ? "Δ" : "≈Δ";
        th.style.cssText = "text-align:center;font-weight:700;";
        const ref = tr.children[1] || tr.lastElementChild;
        if (ref) tr.insertBefore(th, ref.nextSibling);
        return;
      }
      const link = tr.querySelector("a.rated-user, a[href*='/profile/']");
      if (!link) return;
      const handle = link.textContent.trim();
      const d = deltas.get(handle);
      const td = document.createElement("td");
      td.className = COL_CLASS;
      td.style.cssText = "text-align:center;";
      if (d) td.appendChild(deltaSpan(d));
      else td.textContent = "·";
      const ref = tr.children[1] || tr.lastElementChild;
      if (ref) tr.insertBefore(td, ref.nextSibling);
    });
  }

  let ran = false;
  async function run() {
    if (ran) return;
    const id = contestId();
    if (!id) return;
    ran = true;
    try {
      await applyTheme();
      const deltas = await getDeltas(id);
      annotate(deltas);
      // Re-annotate if CF re-renders the table (e.g. live refresh).
      const table = document.querySelector("table.standings");
      if (table) {
        const obs = new MutationObserver(() => {
          if (!table.querySelector("." + COL_CLASS)) annotate(deltas);
        });
        obs.observe(table, { childList: true, subtree: true });
      }
    } catch (e) {
      ran = false;
      console.debug("CPOS carrot:", e.message);
    }
  }

  function remove() {
    document.querySelectorAll("." + COL_CLASS + ",." + HEAD_CLASS).forEach((e) => e.remove());
    clearTheme();
    ran = false;
  }

  async function sync() {
    const raw = await new Promise((res) => chrome.storage.local.get(["cpos.features"], res));
    const on = (raw["cpos.features"] || {}).carrot !== false;
    if (on) run();
    else remove();
  }

  if (C) {
    C.onChange((changes) => {
      if (changes[C.KEYS.FEATURES]) sync();
      // Theme change: re-derive the delta colours on :root if the column is up.
      else if (ran) applyTheme();
    });
  } else {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes["cpos.features"]) sync();
    });
  }

  sync();
})();
