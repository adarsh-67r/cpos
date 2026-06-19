// CPOS rating predictions — a "Carrot"-style predicted-delta column on
// Codeforces standings, computed with the official CF rating formula. Read-only:
// fetches the public CF API and annotates the standings table. Toggle from the
// CPOS popup (feature "carrot").
(function () {
  const COL_CLASS = "cpos-delta-cell";
  const HEAD_CLASS = "cpos-delta-head";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;

  const RATING_KEY = "cpos.carrot.ratings"; // { contestId, ts, byHandle } — pre-contest field ratings
  const RATING_TTL = 2 * 60 * 60 * 1000;    // 2h; a competitor's current rating is stable during a round
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // Public CF API. Two things matter for correctness here:
  //   1. contest.standings for non-gym contests now rejects ANY extra query
  //      parameter for non-admins ("available only via anonymous GET requests
  //      with no extra parameters"), so callers must pass only what CF allows.
  //   2. We force credentials:"omit" so the request is treated as anonymous (the
  //      logged-in session cookie is irrelevant to these public methods), and we
  //      retry on CF's rate limit ("Call limit exceeded") instead of giving up.
  async function cfApi(method, qs) {
    const url = `https://codeforces.com/api/${method}` + (qs ? `?${qs}` : "");
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      let json;
      try {
        const res = await fetch(url, { cache: "no-store", credentials: "omit" });
        if (res.status === 429 || res.status === 503) { await sleep(700 * (attempt + 1)); continue; }
        json = await res.json();
      } catch (e) {
        lastErr = e.message;
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (json.status === "OK") return json.result;
      lastErr = json.comment || `${method} failed`;
      // Only a rate limit is worth retrying; every other failure is deterministic.
      if (/limit exceeded/i.test(lastErr) && attempt < 2) { await sleep(900 * (attempt + 1)); continue; }
      throw new Error(lastErr);
    }
    throw new Error(lastErr || `${method} failed`);
  }

  // --- Codeforces rating algorithm: a faithful port of Carrot/TLE ---
  // (github.com/meooow25/carrot, adapted from TLE / Mike Mirzayanov's reference).
  // Verified to reproduce official deltas EXACTLY on contests whose field has no
  // debutants; on newcomer-heavy contests it matches Carrot (modern CF applies an
  // unpublished newcomer adjustment that the public formula can't reproduce — once
  // a contest is rated we switch to exact official deltas anyway).
  // Contestants: [{ handle, points, penalty, rating }]. Ranks are reassigned here
  // from points/penalty (CF's rating formula ranks each tied contestant by the
  // WORST position in their tie group), not taken from the API's display rank.
  function computeDeltas(contestants) {
    const n = contestants.length;
    if (!n) return new Map();

    // Rank reassignment: points desc, penalty asc; a tie group all share the rank
    // of the lowest position in the group.
    const byRank = [...Array(n).keys()].sort((a, b) =>
      contestants[b].points - contestants[a].points || contestants[a].penalty - contestants[b].penalty);
    const rankOf = new Array(n);
    let lastPts, lastPen, rank;
    for (let i = n - 1; i >= 0; i--) {
      const c = contestants[byRank[i]];
      if (c.points !== lastPts || c.penalty !== lastPen) { lastPts = c.points; lastPen = c.penalty; rank = i + 1; }
      rankOf[byRank[i]] = rank;
    }

    // Precompute the seed (expected rank) curve once over every integer rating, so
    // each lookup is O(1) instead of O(field). seed[r] = 1 + Σ_field P(other beats r).
    const LO = -500, HI = 6000;
    const buckets = new Map();
    for (const c of contestants) buckets.set(c.rating, (buckets.get(c.rating) || 0) + 1);
    const bucketArr = [...buckets.entries()];
    const seedArr = new Float64Array(HI - LO + 1);
    for (let x = LO; x <= HI; x++) {
      let s = 1;
      for (const [r, cnt] of bucketArr) s += cnt / (1 + Math.pow(10, (x - r) / 400));
      seedArr[x - LO] = s;
    }
    const seedAt = (x) => seedArr[(x < LO ? LO : x > HI ? HI : x) - LO];
    // Expected rank at rating x, with one player at `exclude` removed from the field.
    const getSeed = (x, exclude) => seedAt(x) - 1 / (1 + Math.pow(10, (x - exclude) / 400));
    // Last rating at which the (self-excluded) seed is still >= m.
    const rankToRating = (m, selfRating) => {
      let lo = 2, hi = HI;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (getSeed(mid, selfRating) < m) hi = mid;
        else lo = mid + 1;
      }
      return lo - 1;
    };

    const deltas = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = contestants[i].rating;
      const seed = getSeed(r, r);                  // expected rank, self excluded
      const midRank = Math.sqrt(rankOf[i] * seed);
      const need = rankToRating(midRank, r);
      deltas[i] = Math.trunc((need - r) / 2);
    }

    const order = [...Array(n).keys()].sort((a, b) => contestants[b].rating - contestants[a].rating);
    // Adjustment 1: shift so the total change is ~0.
    let sum = 0;
    for (let i = 0; i < n; i++) sum += deltas[i];
    const inc1 = Math.trunc(-sum / n) - 1;
    for (let i = 0; i < n; i++) deltas[i] += inc1;
    // Adjustment 2: keep the top ~4·sqrt(n) by rating stable.
    const s = Math.min(n, Math.round(4 * Math.round(Math.sqrt(n))));
    let topSum = 0;
    for (let i = 0; i < s; i++) topSum += deltas[order[i]];
    const inc2 = Math.min(Math.max(Math.trunc(-topSum / s), -10), 0);
    for (let i = 0; i < n; i++) deltas[i] += inc2;

    const out = new Map();
    for (let i = 0; i < n; i++) out.set(contestants[i].handle, deltas[i]);
    return out;
  }

  // Current (pre-contest) ratings for the whole field. Cached per-contest so
  // reopening the standings within the TTL costs zero API calls, and a transient
  // user.info failure on one chunk never silently turns the whole field into 1400s
  // (which would make every predicted delta wrong).
  async function fetchRatings(handles, id) {
    const ratings = new Map();
    let cache = {};
    try {
      const stored = C ? await C.get([RATING_KEY]) : {};
      const rec = stored[RATING_KEY];
      if (rec && rec.contestId === id && Date.now() - (rec.ts || 0) < RATING_TTL && rec.byHandle) {
        cache = rec.byHandle;
      }
    } catch { /* ignore cache read errors */ }

    const missing = [];
    for (const h of handles) {
      if (Object.prototype.hasOwnProperty.call(cache, h)) ratings.set(h, cache[h]);
      else missing.push(h);
    }

    const CHUNK = 300;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const slice = missing.slice(i, i + CHUNK);
      try {
        const infos = await cfApi("user.info", "handles=" + slice.map(encodeURIComponent).join(";"));
        infos.forEach((info, k) => {
          const handle = (info && info.handle) || slice[k];
          const r = info && info.rating != null ? info.rating : 1400;
          if (handle) { ratings.set(handle, r); cache[handle] = r; }
        });
      } catch {
        // Don't poison the cache with guesses; only fall back for display.
        for (const h of slice) if (!ratings.has(h)) ratings.set(h, 1400);
      }
      if (i + CHUNK < missing.length) await sleep(300); // stay comfortably under CF's call limit
    }

    if (C && missing.length) {
      try { await C.set({ [RATING_KEY]: { contestId: id, ts: Date.now(), byHandle: cache } }); } catch { /* best-effort */ }
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
    // CF now rejects extra params on contest.standings for non-admins, so request
    // with ONLY the contestId and filter to official single-person contestants
    // client-side (default standings are already official-only).
    const standings = await cfApi("contest.standings", "contestId=" + id);
    const contestants = [];
    const handles = [];
    for (const row of standings.rows) {
      const members = (row.party.members || []).map((m) => m.handle);
      if (members.length !== 1 || row.party.participantType !== "CONTESTANT") continue;
      const handle = members[0];
      handles.push(handle);
      contestants.push({ handle, points: row.points, penalty: row.penalty });
    }
    const ratings = await fetchRatings(handles, id);
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
