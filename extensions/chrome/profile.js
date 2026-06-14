// CPOS profile analytics — augments codeforces.com/profile/<handle> in place
// with charts Codeforces does NOT already show (it has its own rating graph, so
// we don't repeat it): an activity heatmap, solved-by-rating and index
// histograms, verdict and language donuts, and top tags. Read-only: fetches the
// public CF API and injects a panel. Never touches capture/submit.
// Toggle from the CPOS popup (feature "profile").
(function () {
  const ROOT_ID = "cpos-analytics-root";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;

  const RANKS = [
    [0, "Newbie", "#9aa0a6"], [1200, "Pupil", "#42c267"], [1400, "Specialist", "#41b5b3"],
    [1600, "Expert", "#7aa2f7"], [1900, "Candidate Master", "#c77dff"], [2100, "Master", "#f0a13e"],
    [2300, "Int. Master", "#f0a13e"], [2400, "Grandmaster", "#ff5b5b"], [2600, "Int. Grandmaster", "#ff3333"],
    [3000, "Legendary GM", "#ff0000"]
  ];
  const PALETTE = ["#7aa2f7", "#c792ea", "#7ee787", "#f0b860", "#ff7a93", "#56d4dd", "#e0af68", "#bb9af7", "#9ece6a", "#f7768e"];

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

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());

  function bars(rows, colorFn) {
    if (!rows || !rows.length) return '<div class="cpos-empty">No data.</div>';
    const max = Math.max(...rows.map((r) => r.value), 1);
    return '<div class="cpos-bars">' + rows.map((r) => {
      const pct = Math.max(3, Math.round((r.value / max) * 100));
      const color = colorFn ? colorFn(r) : "var(--accent)";
      return '<div class="cpos-bar"><span class="lbl" title="' + esc(r.label) + '">' + esc(r.label) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + pct + "%;background:" + color + '"></span></span>' +
        '<span class="num">' + r.value + "</span></div>";
    }).join("") + "</div>";
  }

  function donut(rows, colorFn) {
    const total = rows.reduce((s, r) => s + r.value, 0);
    if (!total) return '<div class="cpos-empty">No data.</div>';
    const R = 46, CIRC = 2 * Math.PI * R;
    let off = 0;
    const segs = rows.map((r, i) => {
      const len = (r.value / total) * CIRC;
      const seg = '<circle r="' + R + '" cx="60" cy="60" fill="none" stroke="' + (colorFn ? colorFn(r, i) : PALETTE[i % PALETTE.length]) +
        '" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + " " + (CIRC - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) +
        '" transform="rotate(-90 60 60)"><title>' + esc(r.label) + ": " + r.value + "</title></circle>";
      off += len;
      return seg;
    }).join("");
    const legend = rows.map((r, i) => '<div class="cpos-leg"><span class="dot" style="background:' + (colorFn ? colorFn(r, i) : PALETTE[i % PALETTE.length]) + '"></span>' +
      '<span class="ll">' + esc(r.label) + '</span><b>' + r.value + "</b></div>").join("");
    return '<div class="cpos-donut-wrap"><svg viewBox="0 0 120 120" class="cpos-donut">' + segs +
      '<text x="60" y="58" text-anchor="middle" font-size="17" font-weight="700" fill="var(--fg)">' + total + "</text>" +
      '<text x="60" y="74" text-anchor="middle" font-size="8" fill="var(--dim)">total</text></svg>' +
      '<div class="cpos-legend">' + legend + "</div></div>";
  }

  function heatmap(byDay) {
    const WEEKS = 26;
    const today = new Date();
    const total = WEEKS * 7;
    // Align the last column so today lands on its real weekday.
    const trailing = 6 - today.getDay();
    const cells = [];
    let maxC = 1, sum = 0;
    for (let i = total - 1; i >= 0; i--) {
      const offset = i - trailing; // 0 = today
      if (offset < 0) { cells.push({ blank: true }); continue; }
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      const c = byDay[ymd(d)] || 0;
      maxC = Math.max(maxC, c);
      sum += c;
      cells.push({ c, date: ymd(d) });
    }
    const cellHtml = cells.map((cell) => {
      if (cell.blank) return '<span class="cpos-hc blank"></span>';
      const c = cell.c;
      const lvl = c === 0 ? 0 : c >= maxC * 0.66 ? 4 : c >= maxC * 0.33 ? 3 : c >= maxC * 0.12 ? 2 : 1;
      return '<span class="cpos-hc l' + lvl + '" title="' + cell.date + ": " + c + ' submissions"></span>';
    }).join("");
    return '<div class="cpos-heatwrap"><div class="cpos-heat">' + cellHtml + "</div>" +
      '<div class="cpos-heat-foot"><span>' + sum + ' submissions · 26 weeks</span><span class="cpos-heat-legend">less ' +
      '<span class="cpos-hc l0"></span><span class="cpos-hc l1"></span><span class="cpos-hc l2"></span><span class="cpos-hc l3"></span><span class="cpos-hc l4"></span> more</span></div></div>';
  }

  function rankProgress(rating) {
    const info = rankInfo(rating);
    if (rating == null) return '<div class="cpos-empty">Unrated.</div>';
    const span = info.hi - info.lo || 1;
    const pct = Math.max(0, Math.min(100, Math.round(((rating - info.lo) / span) * 100)));
    const toNext = Math.max(0, info.hi - rating);
    return '<div class="cpos-rank"><div class="cpos-rank-row"><span style="color:' + info.color + ';font-weight:700">' + esc(info.name) + "</span>" +
      '<span class="cpos-dim">' + (toNext > 0 ? "+" + toNext + " to next" : "max tier") + "</span></div>" +
      '<div class="cpos-rank-track"><span class="cpos-rank-fill" style="width:' + pct + "%;background:" + info.color + '"></span></div></div>';
  }

  function computeStats(submissions) {
    const solved = new Set();
    const solvedByRating = {}, tagCount = {}, verdicts = {}, langs = {}, byDay = {}, byIndex = {};
    const tagSeen = new Set();
    let acCount = 0;
    for (const s of submissions) {
      const v = s.verdict || "UNKNOWN";
      verdicts[v] = (verdicts[v] || 0) + 1;
      const lang = (s.programmingLanguage || "").replace(/\s*\(.*\)$/, "").trim() || "Unknown";
      langs[lang] = (langs[lang] || 0) + 1;
      if (s.creationTimeSeconds) byDay[ymd(new Date(s.creationTimeSeconds * 1000))] = (byDay[ymd(new Date(s.creationTimeSeconds * 1000))] || 0) + 1;
      if (v !== "OK") continue;
      acCount++;
      const p = s.problem || {};
      const key = `${p.contestId}-${p.index}`;
      if (solved.has(key)) continue;
      solved.add(key);
      if (p.rating) solvedByRating[p.rating] = (solvedByRating[p.rating] || 0) + 1;
      const letter = (p.index || "?").charAt(0).toUpperCase();
      byIndex[letter] = (byIndex[letter] || 0) + 1;
      for (const tag of p.tags || []) {
        const tk = key + "|" + tag;
        if (tagSeen.has(tk)) continue;
        tagSeen.add(tk);
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }
    const accept = submissions.length ? Math.round((acCount / submissions.length) * 100) : 0;
    return { solvedCount: solved.size, solvedByRating, tagCount, verdicts, langs, byDay, byIndex, accept };
  }

  function topRows(obj, n, byKeyNum, keyMap) {
    let e = Object.entries(obj).map(([label, value]) => ({ label: keyMap ? keyMap(label) : label, value }));
    if (byKeyNum) { e.sort((a, b) => Number(a.label) - Number(b.label)); return e; }
    e.sort((a, b) => b.value - a.value);
    return n ? e.slice(0, n) : e;
  }
  const verdictColor = (r) => (/^AC|Accepted|OK/.test(r.label) ? "var(--ok)" : /WRONG|WA/.test(r.label) ? "var(--bad)" : /TIME|MEM|IDLE|TLE|MLE/.test(r.label) ? "var(--warn)" : "var(--accent)");
  const prettyVerdict = (v) => ({ OK: "Accepted", WRONG_ANSWER: "Wrong answer", TIME_LIMIT_EXCEEDED: "TLE", MEMORY_LIMIT_EXCEEDED: "MLE", RUNTIME_ERROR: "Runtime error", COMPILATION_ERROR: "Compile error", IDLENESS_LIMIT_EXCEEDED: "ILE" }[v] || String(v).replace(/_/g, " ").toLowerCase());

  function panel(cls, title, bodyHtml) { return el("div", "cpos-panel " + cls, "<h4>" + esc(title) + "</h4>" + bodyHtml); }
  function stat(value, label, color) { return '<div class="cpos-stat"><b' + (color ? ' style="color:' + color + '"' : "") + ">" + esc(value) + "</b><span>" + esc(label) + "</span></div>"; }

  async function applyTheme(root) { if (!T || !C) return; T.applyTheme(root, await C.activeThemeId()); }
  function insertPanel(node) {
    const anchor = document.querySelector(".userbox") || document.querySelector("#pageContent .roundbox") || document.querySelector("#pageContent");
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

    const info = await cfApi("user.info", "handles=" + encodeURIComponent(handle)).then((r) => r[0]).catch((e) => ({ _err: e.message }));
    const submissions = await cfApi("user.status", "handle=" + encodeURIComponent(handle) + "&from=1&count=100000").catch((e) => ({ _err: e.message }));
    head.querySelector(".spin")?.remove();

    if ((!info || info._err) && (!submissions || submissions._err)) {
      grid.appendChild(panel("span3", "Error", '<div class="cpos-empty">Could not reach the Codeforces API. Try reloading.</div>'));
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
      stat(st.accept + "%", "accepted", "var(--ok)") +
      "</div>"));
    grid.appendChild(panel("", "Rank", rankProgress(rating)));
    grid.appendChild(panel("span3", "Submission activity", heatmap(st.byDay)));
    grid.appendChild(panel("span2", "Solved by rating", bars(topRows(st.solvedByRating, 0, true), (r) => ratingColor(Number(r.label)))));
    grid.appendChild(panel("", "Verdicts", donut(topRows(st.verdicts, 7).map((r) => ({ label: prettyVerdict(r.label), value: r.value })), verdictColor)));
    grid.appendChild(panel("span2", "Top tags solved", bars(topRows(st.tagCount, 12))));
    grid.appendChild(panel("", "Languages", donut(topRows(st.langs, 6))));
    grid.appendChild(panel("span3", "Solved by problem index", bars(topRows(st.byIndex, 0, false).sort((a, b) => a.label.localeCompare(b.label)), (r) => PALETTE[(r.label.charCodeAt(0) - 65) % PALETTE.length])));
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
      else { const root = document.getElementById(ROOT_ID); if (root) applyTheme(root); }
    });
    sync();
  }
})();
