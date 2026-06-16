// CPOS problem tools — augments individual Codeforces problem pages
// (/problemset/problem/*, /contest/*/problem/*, /gym/*/problem/*) with helpers
// that CF itself does not provide, all additive and theme-aware:
//   · a tidy RATING badge near the title (from problemset.problems, cached in
//     chrome.storage.local with a timestamp so we don't refetch every page)
//   · a TAG HIDER / training mode — tags hidden by default behind a "Reveal"
//     control (reveal-all and reveal-one-by-one); rating can also be hidden
//     until clicked so practice isn't biased. The hidden/shown preference
//     persists in storage.
//   · a clearly-CPOS "Copy" button on every sample-test input block (classic
//     <pre> and the modern per-line .test-example-line format), never breaking
//     CF's own copier.
//   · a lightweight "similar problems" mini-list (same primary tag, ±100 rating).
// Read-only: fetches the public CF API, injects ONE strip under #cpos-cf-tools
// and small per-block copy buttons. Never touches capture/submit. Toggle from
// the CPOS popup (feature "problemTools").
(function () {
  const ROOT_ID = "cpos-cf-tools";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  if (!C) return;

  const FEATURE = "problemTools";
  const PREF_KEY = "cpos.cf.problemPrefs";        // { tagsHidden, ratingHidden }
  const CACHE_KEY = "cpos.cf.problemset";         // { ts, problems: { "id-index": {rating,tags,name} } }
  const CACHE_TTL = 12 * 60 * 60 * 1000;          // 12h — problemset rarely changes

  // [minRating, title, color]. Mirrors Codeforces' tier palette (as in profile.js).
  const RANKS = [
    [0, "—", "#9aa0a6"], [800, "Newbie", "#9aa0a6"], [1200, "Pupil", "#42c267"],
    [1400, "Specialist", "#41b5b3"], [1600, "Expert", "#7aa2f7"], [1900, "Cand. Master", "#c77dff"],
    [2100, "Master", "#f0a13e"], [2300, "Int. Master", "#f0a13e"], [2400, "Grandmaster", "#ff5b5b"],
    [2600, "Int. GM", "#ff3333"], [3000, "Legendary GM", "#ff0000"]
  ];
  function ratingColor(r) {
    if (r == null) return "var(--dim)";
    let c = RANKS[0][2];
    for (const [thr, , col] of RANKS) if (r >= thr) c = col;
    return c;
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // ── identify the problem on this page ───────────────────────────────────────
  // Returns { contestId, index, key } or null. Handles problemset, contest, gym.
  function problemId() {
    const p = location.pathname;
    let m = p.match(/^\/problemset\/problem\/(\d+)\/([^/]+)/);
    if (m) return { contestId: Number(m[1]), index: decodeURIComponent(m[2]).toUpperCase(), key: m[1] + "-" + decodeURIComponent(m[2]).toUpperCase() };
    m = p.match(/^\/(?:contest|gym)\/(\d+)\/problem\/([^/]+)/);
    if (m) return { contestId: Number(m[1]), index: decodeURIComponent(m[2]).toUpperCase(), key: m[1] + "-" + decodeURIComponent(m[2]).toUpperCase() };
    return null;
  }

  async function cfApi(method, qs) {
    const res = await fetch(`https://codeforces.com/api/${method}?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(method + " HTTP " + res.status);
    const json = await res.json();
    if (json.status !== "OK") throw new Error(json.comment || method + " failed");
    return json.result;
  }

  // ── problemset cache: one big fetch, reused across all problem pages ─────────
  let psCache = null; // { byKey: Map, list: [{key,contestId,index,rating,tags,name}] }
  async function loadProblemset() {
    if (psCache) return psCache;
    const stored = await C.get([CACHE_KEY]);
    const rec = stored[CACHE_KEY];
    if (rec && rec.problems && (Date.now() - (rec.ts || 0) < CACHE_TTL)) {
      psCache = indexProblemset(rec.problems);
      return psCache;
    }
    try {
      const result = await cfApi("problemset.problems", "");
      const problems = {};
      for (const p of result.problems || []) {
        if (p.contestId == null || !p.index) continue;
        const key = p.contestId + "-" + String(p.index).toUpperCase();
        problems[key] = { rating: p.rating ?? null, tags: p.tags || [], name: p.name || "", contestId: p.contestId, index: String(p.index).toUpperCase() };
      }
      await C.set({ [CACHE_KEY]: { ts: Date.now(), problems } });
      psCache = indexProblemset(problems);
    } catch (e) {
      // Fall back to stale cache if we have one; otherwise no data.
      if (rec && rec.problems) psCache = indexProblemset(rec.problems);
      else psCache = { byKey: new Map(), list: [] };
    }
    return psCache;
  }
  function indexProblemset(problems) {
    const byKey = new Map();
    const list = [];
    for (const [key, p] of Object.entries(problems)) {
      const entry = Object.assign({ key }, p);
      byKey.set(key, entry);
      list.push(entry);
    }
    return { byKey, list };
  }

  // ── preferences (persisted) ─────────────────────────────────────────────────
  async function getPrefs() {
    const stored = await C.get([PREF_KEY]);
    const p = stored[PREF_KEY] || {};
    return { tagsHidden: p.tagsHidden !== false, ratingHidden: p.ratingHidden === true };
  }
  async function setPrefs(patch) {
    const cur = await getPrefs();
    await C.set({ [PREF_KEY]: Object.assign(cur, patch) });
  }

  // ── theme ───────────────────────────────────────────────────────────────────
  async function applyTheme(node) { if (!T || !C || !node) return; T.applyTheme(node, await C.activeThemeId()); }

  // ── copy-sample-input buttons ───────────────────────────────────────────────
  // Modern CF renders inputs as a stack of <div class="test-example-line"> rows;
  // classic CF uses a single <pre>. We read whichever is present so the copied
  // text is exactly what would be submitted to a judge.
  function sampleInputText(inputDiv) {
    const pre = inputDiv.querySelector("pre");
    if (!pre) return "";
    const lines = pre.querySelectorAll(".test-example-line");
    if (lines.length) {
      // The very first .test-example-line is sometimes a header copy of the whole
      // block; CF marks per-row lines too. Use only rows that are themselves leaf
      // lines to avoid double-counting.
      const rows = [...lines].filter((l) => !l.querySelector(".test-example-line"));
      return rows.map((l) => l.textContent).join("\n").replace(/\n+$/, "");
    }
    return (pre.innerText || pre.textContent || "").replace(/\n+$/, "");
  }

  function addCopyButtons() {
    const inputs = document.querySelectorAll(".sample-test .input");
    inputs.forEach((inputDiv) => {
      if (inputDiv.querySelector(".cpos-cf-copy")) return;
      const btn = el("button", "cpos-cf-copy", "Copy");
      btn.type = "button";
      btn.title = "Copy sample input (CPOS)";
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const text = sampleInputText(inputDiv);
        try {
          await navigator.clipboard.writeText(text);
          flash(btn, "Copied");
        } catch {
          // Fallback for clipboard-permission edge cases.
          const ta = el("textarea");
          ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); flash(btn, "Copied"); } catch { flash(btn, "Failed"); }
          ta.remove();
        }
      });
      inputDiv.appendChild(btn);
      applyTheme(btn);
    });
  }
  function flash(btn, txt) {
    const prev = btn.textContent;
    btn.textContent = txt;
    btn.classList.add("ok");
    setTimeout(() => { btn.textContent = prev; btn.classList.remove("ok"); }, 1200);
  }
  function removeCopyButtons() {
    document.querySelectorAll(".cpos-cf-copy").forEach((b) => b.remove());
  }

  // ── the tools strip (rating + tags + reveal controls + similar) ─────────────
  function nativeTagBoxes() {
    return [...document.querySelectorAll(".tag-box")];
  }

  function titleAnchor() {
    return document.querySelector(".problem-statement .header .title") ||
      document.querySelector(".problem-statement .title") ||
      document.querySelector(".problem-statement") ||
      document.querySelector("#pageContent");
  }

  function similarHtml(ps, entry) {
    if (!entry || !ps || !ps.list.length || entry.rating == null || !entry.tags.length) return "";
    const primary = entry.tags[0];
    const pool = ps.list.filter((p) =>
      p.key !== entry.key && p.rating != null &&
      Math.abs(p.rating - entry.rating) <= 100 && p.tags.includes(primary));
    // closest rating first, cap to 6
    pool.sort((a, b) => Math.abs(a.rating - entry.rating) - Math.abs(b.rating - entry.rating));
    const picks = pool.slice(0, 6);
    if (!picks.length) return "";
    const items = picks.map((p) => {
      const url = "https://codeforces.com/problemset/problem/" + p.contestId + "/" + p.index;
      return '<a class="cpos-cf-sim-item" href="' + esc(url) + '">' +
        '<span class="r" style="color:' + ratingColor(p.rating) + '">' + p.rating + "</span>" +
        '<span class="n">' + esc(p.name || (p.contestId + p.index)) + "</span></a>";
    }).join("");
    return '<div class="cpos-cf-sim"><div class="cpos-cf-lbl">Similar · ' + esc(primary) + " ±100</div>" +
      '<div class="cpos-cf-sim-list">' + items + "</div></div>";
  }

  function build(entry, prefs, ps) {
    let root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    root = el("div", "cpos-cf-tools");
    root.id = ROOT_ID;

    const rating = entry ? entry.rating : null;
    const tags = entry ? entry.tags : [];

    // ── rating badge (optionally hidden) ──
    const ratingWrap = el("span", "cpos-cf-rating");
    if (rating == null) {
      ratingWrap.innerHTML = '<span class="cpos-cf-badge dim">rating: n/a</span>';
    } else if (prefs.ratingHidden) {
      const b = el("button", "cpos-cf-badge hidden", "★ Reveal rating");
      b.type = "button";
      b.addEventListener("click", async () => { await setPrefs({ ratingHidden: false }); rerender(); });
      ratingWrap.appendChild(b);
    } else {
      ratingWrap.innerHTML = '<span class="cpos-cf-badge" style="color:' + ratingColor(rating) +
        ';border-color:' + ratingColor(rating) + '">★ ' + rating + "</span>";
    }

    // ── tag controls ──
    const tagsWrap = el("span", "cpos-cf-tags");
    if (!tags.length) {
      tagsWrap.innerHTML = '<span class="cpos-cf-lbl">No tags</span>';
    } else if (prefs.tagsHidden) {
      const reveal = el("button", "cpos-cf-btn", "Reveal tags (" + tags.length + ")");
      reveal.type = "button";
      reveal.addEventListener("click", async () => { await setPrefs({ tagsHidden: false }); rerender(); });
      const one = el("button", "cpos-cf-btn ghost", "Reveal one");
      one.type = "button";
      // reveal-one-by-one: keep persisted pref hidden, just unveil next chip inline
      let shown = 0;
      const chipBox = el("span", "cpos-cf-chips");
      const renderOne = () => {
        chipBox.innerHTML = tags.slice(0, shown).map((t) => '<span class="cpos-cf-chip">' + esc(t) + "</span>").join("");
        if (shown >= tags.length) one.disabled = true;
      };
      one.addEventListener("click", () => { if (shown < tags.length) { shown++; renderOne(); } });
      tagsWrap.appendChild(reveal);
      tagsWrap.appendChild(one);
      tagsWrap.appendChild(chipBox);
    } else {
      const hide = el("button", "cpos-cf-btn ghost", "Hide tags");
      hide.type = "button";
      hide.addEventListener("click", async () => { await setPrefs({ tagsHidden: true }); rerender(); });
      const chips = tags.map((t) => '<span class="cpos-cf-chip">' + esc(t) + "</span>").join("");
      tagsWrap.innerHTML = '<span class="cpos-cf-chips">' + chips + "</span>";
      tagsWrap.appendChild(hide);
    }

    const head = el("span", "cpos-cf-head", '<span class="badge">CPOS</span>');
    root.appendChild(head);
    root.appendChild(ratingWrap);
    root.appendChild(tagsWrap);

    // ── similar problems (only when tags are revealed, to keep training honest) ──
    if (!prefs.tagsHidden) {
      const sim = similarHtml(ps, entry);
      if (sim) root.appendChild(el("div", "cpos-cf-sim-wrap", sim));
    }

    const anchor = titleAnchor();
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(root, anchor.nextSibling);
    else (document.querySelector("#pageContent") || document.body).prepend(root);
    applyTheme(root);

    // Hide CF's own native tags while training mode keeps ours hidden.
    setNativeTagsHidden(prefs.tagsHidden);
  }

  function setNativeTagsHidden(hidden) {
    nativeTagBoxes().forEach((tb) => { tb.style.display = hidden ? "none" : ""; });
  }

  // re-render the strip from current prefs without refetching the problemset.
  let lastEntry = null, lastPs = null;
  async function rerender() {
    const prefs = await getPrefs();
    if (!document.body) return;
    build(lastEntry, prefs, lastPs);
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────
  let observer = null;
  async function buildAll() {
    const id = problemId();
    if (!id) return;
    const prefs = await getPrefs();
    const ps = await loadProblemset();
    lastPs = ps;
    lastEntry = ps.byKey.get(id.key) || null;
    build(lastEntry, prefs, ps);
    addCopyButtons();
    // Watch for late-rendered sample blocks (CF sometimes hydrates them).
    if (!observer) {
      observer = new MutationObserver(() => {
        if (!document.getElementById(ROOT_ID)) return;
        addCopyButtons();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function remove() {
    observer?.disconnect();
    observer = null;
    document.getElementById(ROOT_ID)?.remove();
    removeCopyButtons();
    setNativeTagsHidden(false);
  }

  async function sync() {
    const on = await C.feature(FEATURE);
    if (on) buildAll().catch((e) => console.debug("CPOS problemTools:", e));
    else remove();
  }

  C.onChange((changes) => {
    if (changes[C.KEYS.FEATURES]) sync();
    else {
      const root = document.getElementById(ROOT_ID);
      if (root) applyTheme(root);
      document.querySelectorAll(".cpos-cf-copy").forEach((b) => applyTheme(b));
    }
  });
  if (document.body) sync();
  else document.addEventListener("DOMContentLoaded", () => sync());
})();
