// CPOS profile analytics — augments codeforces.com/profile/<handle> in place.
// Read-only: fetches the public CF API and injects a panel. Never touches
// capture/submit. Each panel renders independently with explicit
// loading / empty / error states so one failure can't blank the whole thing.
// Toggle from the CPOS popup (feature "profile").
(function () {
  const ROOT_ID = "cpos-analytics-root";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;

  const RANKS = [
    [0, "Newbie", "#9aa0a6"],
    [1200, "Pupil", "#42c267"],
    [1400, "Specialist", "#41b5b3"],
    [1600, "Expert", "#7aa2f7"],
    [1900, "Candidate Master", "#c77dff"],
    [2100, "Master", "#f0a13e"],
    [2300, "Int. Master", "#f0a13e"],
    [2400, "Grandmaster", "#ff5b5b"],
    [2600, "Int. Grandmaster", "#ff3333"],
    [3000, "Legendary GM", "#ff0000"]
  ];

  function handleFromUrl() {
    const m = location.pathname.match(/^\/profile\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function ratingColor(r) {
    if (r == null) return "#8a86a3";
    let c = RANKS[0][2];
    for (const [thr, , col] of RANKS) if (r >= thr) c = col;
    return c;
  }
  function rankInfo(r) {
    if (r == null) return { name: "Unrated", lo: 0, hi: 1200, color: "#8a86a3" };
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) if (r >= RANKS[i][0]) idx = i;
    const lo = RANKS[idx][0];
    const hi = idx + 1 < RANKS.length ? RANKS[idx + 1][0] : lo + 300;
    return { name: RANKS[idx][1], lo, hi, color: RANKS[idx][2] };
  }

  async function cfApi(method, qs) {
    const res = await fetch(`https://codeforces.com/api/${method}?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(method + " HTTP " + res.status);
    const json = await res.json();
    if (json.status !== "OK") throw new Error(json.comment || method + " failed");
    return json.result;
  }

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function bars(rows, colorFn) {
    if (!rows || !rows.length) return '<div class="cpos-empty">No data.</div>';
    const max = Math.max(...rows.map((r) => r.value), 1);
    return (
      '<div class="cpos-bars">' +
      rows
        .map((r) => {
          const pct = Math.max(3, Math.round((r.value / max) * 100));
          const color = colorFn ? colorFn(r) : "var(--accent)";
          return (
            '<div class="cpos-bar">' +
            '<span class="lbl" title="' + esc(r.label) + '">' + esc(r.label) + "</span>" +
            '<span class="track"><span class="fill" style="width:' + pct + "%;background:" + color + '"></span></span>' +
            '<span class="num">' + r.value + "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function ratingChart(history) {
    if (!history || history.length < 2) return '<div class="cpos-empty">Not enough rated contests.</div>';
    const W = 680, H = 200, padL = 34, padR = 14, padT = 14, padB = 22;
    const xs = history.map((h) => h.ratingUpdateTimeSeconds);
    const ys = history.map((h) => h.newRating);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
    const px = (x) => padL + ((x - minX) / (maxX - minX || 1)) * (W - padL - padR);
    const py = (y) => H - padB - ((y - minY) / (maxY - minY || 1)) * (H - padT - padB);

    // Rating-tier background bands.
    let bands = "";
    for (let i = 0; i < RANKS.length; i++) {
      const lo = RANKS[i][0];
      const hi = i + 1 < RANKS.length ? RANKS[i + 1][0] : maxY;
      if (hi < minY || lo > maxY) continue;
      const y1 = py(Math.min(hi, maxY)), y2 = py(Math.max(lo, minY));
      bands += `<rect x="${padL}" y="${y1.toFixed(1)}" width="${(W - padL - padR).toFixed(1)}" height="${Math.max(0, y2 - y1).toFixed(1)}" fill="${RANKS[i][2]}" opacity="0.10"/>`;
    }
    const pts = history.map((h) => `${px(h.ratingUpdateTimeSeconds).toFixed(1)},${py(h.newRating).toFixed(1)}`).join(" ");
    const dots = history
      .map((h) => `<circle cx="${px(h.ratingUpdateTimeSeconds).toFixed(1)}" cy="${py(h.newRating).toFixed(1)}" r="2.6" fill="${ratingColor(h.newRating)}"><title>${esc(h.contestName)}: ${h.newRating}</title></circle>`)
      .join("");
    const last = history[history.length - 1];
    return (
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">` +
      bands +
      `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` +
      dots +
      `<text x="${padL}" y="12" fill="var(--dim)" font-size="11">peak ${Math.max(...ys)}</text>` +
      `<text x="${W - padR}" y="12" fill="${ratingColor(last.newRating)}" font-size="12" text-anchor="end" font-weight="700">now ${last.newRating}</text>` +
      "</svg>"
    );
  }

  function rankProgress(rating) {
    const info = rankInfo(rating);
    if (rating == null) return '<div class="cpos-empty">Unrated.</div>';
    const span = info.hi - info.lo || 1;
    const pct = Math.max(0, Math.min(100, Math.round(((rating - info.lo) / span) * 100)));
    const toNext = Math.max(0, info.hi - rating);
    return (
      '<div class="cpos-rank">' +
      '<div class="cpos-rank-row"><span style="color:' + info.color + ';font-weight:700">' + esc(info.name) + "</span>" +
      '<span class="cpos-dim">' + (toNext > 0 ? "+" + toNext + " to next" : "max tier") + "</span></div>" +
      '<div class="cpos-rank-track"><span class="cpos-rank-fill" style="width:' + pct + "%;background:" + info.color + '"></span></div>' +
      "</div>"
    );
  }

  function computeStats(submissions) {
    const solved = new Set();
    const solvedByRating = {}, tagCount = {}, verdicts = {}, langs = {}, byMonth = {};
    const tagSeen = new Set();
    let firstAC = 0;
    for (const s of submissions) {
      const v = s.verdict || "UNKNOWN";
      verdicts[v] = (verdicts[v] || 0) + 1;
      const lang = (s.programmingLanguage || "").replace(/\s*\(.*\)$/, "").trim() || "Unknown";
      langs[lang] = (langs[lang] || 0) + 1;
      if (v !== "OK") continue;
      const p = s.problem || {};
      const key = `${p.contestId}-${p.index}`;
      if (solved.has(key)) continue;
      solved.add(key);
      const d = new Date((s.creationTimeSeconds || 0) * 1000);
      const ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      byMonth[ym] = (byMonth[ym] || 0) + 1;
      if (!firstAC || s.creationTimeSeconds < firstAC) firstAC = s.creationTimeSeconds;
      if (p.rating) solvedByRating[p.rating] = (solvedByRating[p.rating] || 0) + 1;
      for (const tag of p.tags || []) {
        const tk = key + "|" + tag;
        if (tagSeen.has(tk)) continue;
        tagSeen.add(tk);
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }
    return { solvedCount: solved.size, solvedByRating, tagCount, verdicts, langs, byMonth, firstAC };
  }

  function topRows(obj, n, byKeyNum) {
    let e = Object.entries(obj).map(([label, value]) => ({ label, value }));
    if (byKeyNum) { e.sort((a, b) => Number(a.label) - Number(b.label)); return e; }
    e.sort((a, b) => b.value - a.value);
    return n ? e.slice(0, n) : e;
  }
  const verdictColor = (r) => (r.label === "OK" ? "var(--ok)" : /WRONG/.test(r.label) ? "var(--bad)" : /TIME|MEMORY|IDLENESS/.test(r.label) ? "var(--warn)" : "var(--accent)");
  const prettyVerdict = (v) => ({ OK: "Accepted", WRONG_ANSWER: "Wrong answer", TIME_LIMIT_EXCEEDED: "TLE", MEMORY_LIMIT_EXCEEDED: "MLE", RUNTIME_ERROR: "Runtime error", COMPILATION_ERROR: "Compile error" }[v] || v.replace(/_/g, " ").toLowerCase());

  function panel(cls, title, bodyHtml) {
    return el("div", "cpos-panel " + cls, "<h4>" + esc(title) + "</h4>" + bodyHtml);
  }
  function stat(value, label, color) {
    return '<div class="cpos-stat"><b' + (color ? ' style="color:' + color + '"' : "") + ">" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }

  async function applyTheme(root) {
    if (!T || !C) return;
    const id = await C.activeThemeId();
    T.applyTheme(root, id);
  }

  function insertPanel(node) {
    const anchor =
      document.querySelector(".userbox") ||
      document.querySelector("#pageContent .roundbox") ||
      document.querySelector("#pageContent");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
    else (document.querySelector("#pageContent") || document.body).prepend(node);
  }

  async function build() {
    if (document.getElementById(ROOT_ID)) return;
    const handle = handleFromUrl();
    if (!handle) return;

    const root = el("div", "cpos-analytics");
    root.id = ROOT_ID;
    const head = el("div", "cpos-head", '<span class="badge">CPOS</span> Analytics <span class="spin">· loading ' + esc(handle) + "…</span>");
    const grid = el("div", "cpos-grid");
    root.appendChild(head);
    root.appendChild(grid);
    insertPanel(root);
    await applyTheme(root);

    // Fetch the three sources independently so one failure degrades gracefully.
    const info = await cfApi("user.info", "handles=" + encodeURIComponent(handle)).then((r) => r[0]).catch((e) => ({ _err: e.message }));
    const history = await cfApi("user.rating", "handle=" + encodeURIComponent(handle)).catch(() => []);
    const submissions = await cfApi("user.status", "handle=" + encodeURIComponent(handle) + "&from=1&count=100000").catch((e) => ({ _err: e.message }));

    const sp = head.querySelector(".spin");
    if (sp) sp.remove();

    if (info && info._err && (!submissions || submissions._err)) {
      grid.appendChild(panel("span3", "Error", '<div class="cpos-empty">Could not reach the Codeforces API (' + esc(info._err) + "). Try reloading.</div>"));
      return;
    }

    const rating = info && !info._err ? info.rating : null;
    const maxRating = info && !info._err ? info.maxRating : null;
    const subs = Array.isArray(submissions) ? submissions : [];
    const st = computeStats(subs);

    grid.appendChild(panel("span2", "Overview",
      '<div class="cpos-stats">' +
      stat(rating != null ? rating : "—", "rating", ratingColor(rating)) +
      stat(maxRating != null ? maxRating : "—", "max", ratingColor(maxRating)) +
      stat(st.solvedCount, "solved") +
      stat(subs.length, "submissions") +
      stat(history.length, "contests") +
      "</div>"));
    grid.appendChild(panel("", "Rank progress", rankProgress(rating)));
    grid.appendChild(panel("span3", "Rating history", ratingChart(history)));
    grid.appendChild(panel("span2", "Solved by rating", bars(topRows(st.solvedByRating, 0, true), (r) => ratingColor(Number(r.label)))));
    grid.appendChild(panel("", "Verdicts", bars(topRows(st.verdicts, 6).map((r) => ({ label: prettyVerdict(r.label), value: r.value })), verdictColor)));
    grid.appendChild(panel("span2", "Top tags solved", bars(topRows(st.tagCount, 12))));
    grid.appendChild(panel("", "Languages", bars(topRows(st.langs, 6))));
    grid.appendChild(panel("span3", "Solved per month", bars(topRows(st.byMonth, 0, true).slice(-18))));
  }

  function remove() { document.getElementById(ROOT_ID)?.remove(); }

  async function sync() {
    if (!C) return;
    const on = await C.feature("profile");
    if (on) build().catch((e) => console.debug("CPOS profile:", e));
    else remove();
  }

  if (C) {
    C.onChange((changes) => {
      if (changes[C.KEYS.FEATURES]) sync();
      else {
        const root = document.getElementById(ROOT_ID);
        if (root) applyTheme(root);
      }
    });
    sync();
  }
})();
