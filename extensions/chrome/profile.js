// CPOS profile analytics — augments codeforces.com/profile/<handle> in place
// with a rating chart, solved-by-rating, top tags, verdicts, and languages.
// Read-only: it only fetches the public CF API and injects a panel. Never
// touches capture/submit. Toggle from the CPOS popup (feature "profile").
(function () {
  const ROOT_ID = "cpos-analytics-root";
  const T = self.CPOS_THEMES;

  function handleFromUrl() {
    const m = location.pathname.match(/^\/profile\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function ratingColor(r) {
    if (r == null) return "#8a86a3";
    if (r < 1200) return "#9aa0a6";
    if (r < 1400) return "#42c267";
    if (r < 1600) return "#41b5b3";
    if (r < 1900) return "#7aa2f7";
    if (r < 2100) return "#c77dff";
    if (r < 2400) return "#f0a13e";
    return "#ff5b5b";
  }

  async function cfApi(method, qs) {
    const res = await fetch(`https://codeforces.com/api/${method}?${qs}`, { cache: "no-store" });
    const json = await res.json();
    if (json.status !== "OK") throw new Error(json.comment || `${method} failed`);
    return json.result;
  }

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  function bars(rows, colorFn) {
    if (!rows.length) return '<div class="cpos-empty">No data yet.</div>';
    const max = Math.max(...rows.map((r) => r.value), 1);
    return (
      '<div class="cpos-bars">' +
      rows
        .map((r) => {
          const pct = Math.round((r.value / max) * 100);
          const color = colorFn ? colorFn(r) : "var(--accent)";
          return (
            '<div class="cpos-bar">' +
            '<span class="lbl" title="' + esc(r.label) + '">' + esc(r.label) + "</span>" +
            '<span class="track"><span class="fill" style="width:' + pct + "%;background:" + color + '"></span></span>' +
            '<span class="num">' + r.value + "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function ratingChart(history) {
    if (!history || history.length < 2) return '<div class="cpos-empty">Not enough rated contests.</div>';
    const W = 640, H = 180, pad = 26;
    const xs = history.map((h) => h.ratingUpdateTimeSeconds);
    const ys = history.map((h) => h.newRating);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 50;
    const px = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (W - 2 * pad);
    const py = (y) => H - pad - ((y - minY) / (maxY - minY || 1)) * (H - 2 * pad);
    const pts = history.map((h) => `${px(h.ratingUpdateTimeSeconds).toFixed(1)},${py(h.newRating).toFixed(1)}`).join(" ");
    const last = history[history.length - 1];
    const dots = history
      .map((h) => `<circle cx="${px(h.ratingUpdateTimeSeconds).toFixed(1)}" cy="${py(h.newRating).toFixed(1)}" r="2.5" fill="${ratingColor(h.newRating)}"/>`)
      .join("");
    return (
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">` +
      `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` +
      dots +
      `<text x="${pad}" y="14" fill="var(--dim)" font-size="11">min ${Math.min(...ys)}</text>` +
      `<text x="${W - pad}" y="14" fill="${ratingColor(last.newRating)}" font-size="12" text-anchor="end" font-weight="700">max ${Math.max(...ys)} · now ${last.newRating}</text>` +
      "</svg>"
    );
  }

  function computeStats(submissions) {
    const solved = new Set();
    const solvedByRating = {};
    const tagCount = {};
    const verdicts = {};
    const langs = {};
    const tagSeen = new Set(); // count each (problem,tag) once
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
      if (p.rating) solvedByRating[p.rating] = (solvedByRating[p.rating] || 0) + 1;
      for (const tag of p.tags || []) {
        const tk = key + "|" + tag;
        if (tagSeen.has(tk)) continue;
        tagSeen.add(tk);
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }
    return { solvedCount: solved.size, solvedByRating, tagCount, verdicts, langs };
  }

  function topRows(obj, n, sortByKeyNumeric) {
    let entries = Object.entries(obj).map(([label, value]) => ({ label, value }));
    if (sortByKeyNumeric) entries.sort((a, b) => Number(a.label) - Number(b.label));
    else entries.sort((a, b) => b.value - a.value);
    return sortByKeyNumeric ? entries : entries.slice(0, n);
  }

  const verdictColor = (r) => (r.label === "OK" ? "var(--ok)" : /WRONG/.test(r.label) ? "var(--bad)" : /TIME/.test(r.label) ? "var(--warn)" : "var(--accent)");

  async function applyTheme(root) {
    const raw = await new Promise((res) => chrome.storage.local.get(["cpos.ui.theme", "cpos.siteThemeId", "cpos.features"], res));
    const features = raw["cpos.features"] || {};
    const id = features.siteTheme ? raw["cpos.siteThemeId"] || "github" : raw["cpos.ui.theme"] || (T && T.DEFAULT_THEME) || "purple";
    if (T) T.applyTheme(root, id);
  }

  function insertPanel(panel) {
    const anchor = document.querySelector(".userbox") || document.querySelector("#pageContent .datatable") || document.querySelector("#pageContent");
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    } else {
      (document.querySelector("#pageContent") || document.body).prepend(panel);
    }
  }

  async function build() {
    if (document.getElementById(ROOT_ID)) return;
    const handle = handleFromUrl();
    if (!handle) return;

    const root = el("div", "cpos-analytics");
    root.id = ROOT_ID;
    const head = el("div", "cpos-head", '<span class="badge">CPOS</span> Analytics <span class="spin">· loading…</span>');
    const grid = el("div", "cpos-grid");
    root.appendChild(head);
    root.appendChild(grid);
    insertPanel(root);
    await applyTheme(root);

    try {
      const [info] = await cfApi("user.info", "handles=" + encodeURIComponent(handle));
      let history = [];
      try { history = await cfApi("user.rating", "handle=" + encodeURIComponent(handle)); } catch { /* unrated */ }
      const submissions = await cfApi("user.status", "handle=" + encodeURIComponent(handle) + "&from=1&count=100000");
      const st = computeStats(submissions);

      head.querySelector(".spin").remove();

      grid.appendChild(panel("span3", "Overview",
        '<div class="cpos-stats">' +
        stat(info.rating != null ? info.rating : "—", "rating", ratingColor(info.rating)) +
        stat(info.maxRating != null ? info.maxRating : "—", "max rating", ratingColor(info.maxRating)) +
        stat(st.solvedCount, "solved") +
        stat(submissions.length, "submissions") +
        stat(history.length, "rated contests") +
        '</div>'));

      grid.appendChild(panel("span2", "Rating history", ratingChart(history)));
      grid.appendChild(panel("", "Verdicts", bars(topRows(st.verdicts, 6), verdictColor)));
      grid.appendChild(panel("span2", "Solved by rating", bars(topRows(st.solvedByRating, 0, true), (r) => ratingColor(Number(r.label)))));
      grid.appendChild(panel("", "Languages", bars(topRows(st.langs, 5))));
      grid.appendChild(panel("span3", "Top tags solved", bars(topRows(st.tagCount, 12))));
    } catch (e) {
      head.querySelector(".spin")?.remove();
      grid.appendChild(panel("span3", "Error", '<div class="cpos-empty">Could not load analytics: ' + esc(e.message) + "</div>"));
    }
  }

  function panel(cls, title, bodyHtml) {
    return el("div", "cpos-panel " + cls, "<h4>" + esc(title) + "</h4>" + bodyHtml);
  }
  function stat(value, label, color) {
    return '<div class="cpos-stat"><b' + (color ? ' style="color:' + color + '"' : "") + ">" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }

  function remove() {
    document.getElementById(ROOT_ID)?.remove();
  }

  async function sync() {
    const raw = await new Promise((res) => chrome.storage.local.get(["cpos.features"], res));
    const on = (raw["cpos.features"] || { profile: true }).profile !== false;
    if (on) build();
    else remove();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes["cpos.features"]) sync();
    else if (changes["cpos.ui.theme"] || changes["cpos.siteThemeId"]) {
      const root = document.getElementById(ROOT_ID);
      if (root) applyTheme(root);
    }
  });

  sync();
})();
