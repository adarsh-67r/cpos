// CPOS favorites/bookmarks — content script on Codeforces problem pages
// (/problemset/problem/*, /contest/*/problem/*, /gym/*/problem/*). Adds a ★
// toggle button near the problem title; clicking saves/removes the problem
// (id, name, rating, url) to a favorites list in chrome.storage.local. Reflects
// saved state on load. Read-only w.r.t. the site; never touches capture/submit.
// Injected UI lives under "cpos-" ids/classes. Toggle from the CPOS popup
// (feature "favorites").
(function () {
  const C = self.CPOS;
  const T = self.CPOS_THEMES;
  if (!C) return;

  const BTN_ID = "cpos-fav-btn";
  const K_FAV = "cpos.fav.list"; // array of { id, contestId, index, name, rating, url, addedAt }

  function get(keys) { return new Promise((res) => chrome.storage.local.get(keys, (v) => res(v || {}))); }
  function set(obj) { return new Promise((res) => chrome.storage.local.set(obj, () => res())); }

  // ── identify the problem from the URL ───────────────────────────────────────
  // /problemset/problem/<contestId>/<index>
  // /contest/<contestId>/problem/<index>
  // /gym/<contestId>/problem/<index>
  function parseProblem() {
    const p = location.pathname;
    let m = p.match(/^\/problemset\/problem\/(\d+)\/([^/?#]+)/);
    if (m) return { contestId: m[1], index: m[2], kind: "problemset" };
    m = p.match(/^\/contest\/(\d+)\/problem\/([^/?#]+)/);
    if (m) return { contestId: m[1], index: m[2], kind: "contest" };
    m = p.match(/^\/gym\/(\d+)\/problem\/([^/?#]+)/);
    if (m) return { contestId: m[1], index: m[2], kind: "gym" };
    return null;
  }

  const idOf = (pr) => pr.contestId + "-" + pr.index;

  // Title node: CF renders ".problem-statement .header .title" e.g. "A. Watermelon".
  function problemName(pr) {
    const t = document.querySelector(".problem-statement .header .title");
    let name = t ? t.textContent.trim() : "";
    // strip leading "A. " index prefix if present
    name = name.replace(/^[A-Za-z0-9]{1,3}\.\s*/, "");
    return name || (pr.contestId + pr.index);
  }

  // Rating: shown as a tag like "*1200" in the sidebar tags, or via problem-tags.
  function problemRating() {
    const tags = document.querySelectorAll(".tag-box, .problem-tags .tag-box");
    for (const tag of tags) {
      const m = (tag.textContent || "").match(/\*\s*(\d{3,4})/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function titleNode() {
    return document.querySelector(".problem-statement .header .title");
  }

  // ── theme ───────────────────────────────────────────────────────────────────
  async function applyBtnTheme(node) {
    if (!T) return;
    try { T.applyTheme(node, await (C.activePageThemeId ? C.activePageThemeId() : C.activeThemeId())); } catch (e) { /* ignore */ }
  }

  async function isFav(id) {
    const list = (await get([K_FAV]))[K_FAV] || [];
    return list.some((f) => f.id === id);
  }

  async function toggleFav(pr) {
    const id = idOf(pr);
    const data = (await get([K_FAV]))[K_FAV] || [];
    const idx = data.findIndex((f) => f.id === id);
    if (idx >= 0) {
      data.splice(idx, 1);
      await set({ [K_FAV]: data });
      return false;
    }
    data.unshift({
      id,
      contestId: pr.contestId,
      index: pr.index,
      name: problemName(pr),
      rating: problemRating(),
      url: location.origin + location.pathname,
      addedAt: Date.now()
    });
    await set({ [K_FAV]: data });
    return true;
  }

  function paint(btn, on) {
    btn.classList.toggle("cpos-fav-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Remove from CPOS favorites" : "Add to CPOS favorites";
    btn.querySelector(".cpos-fav-star").textContent = on ? "★" : "☆";
  }

  async function build() {
    const pr = parseProblem();
    if (!pr) return;
    const title = titleNode();
    if (!title || document.getElementById(BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.className = "cpos-fav-btn";
    btn.type = "button";
    btn.innerHTML = '<span class="cpos-fav-star">☆</span><span class="cpos-fav-lbl">Favorite</span>';
    await applyBtnTheme(btn);

    const on = await isFav(idOf(pr));
    paint(btn, on);

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const nowOn = await toggleFav(pr);
      paint(btn, nowOn);
    });

    title.appendChild(btn);
  }

  function remove() { document.getElementById(BTN_ID)?.remove(); }

  async function sync() {
    const on = await C.feature("favorites");
    if (on) build().catch((e) => console.debug("CPOS favorites:", e));
    else remove();
  }

  C.onChange((changes) => {
    if (changes[C.KEYS.FEATURES]) sync();
    else { const btn = document.getElementById(BTN_ID); if (btn) applyBtnTheme(btn); }
    // keep star state fresh if favorites changed elsewhere (e.g. popup remove)
    if (changes[K_FAV]) {
      const btn = document.getElementById(BTN_ID);
      const pr = parseProblem();
      if (btn && pr) isFav(idOf(pr)).then((v) => paint(btn, v));
    }
  });
  sync();
})();
