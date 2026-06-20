// CPOS Challenge — Codeforces page content script.
//   • Detects the logged-in handle and remembers it (needed to track the user's
//     own submissions for the race).
//   • When a challenge link (…/?cposc=<payload>) is opened, shows an accept /
//     decline banner. Accepting records the challenge and opens the problem so
//     CPOS captures it into VS Code / the terminal; the background module then
//     watches Codeforces for who solves first.
// Read-only w.r.t. Codeforces, feature-flagged ("challenges"), fully isolated.
(function () {
  const C = self.CPOSChallenge;
  if (!C || typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;

  const store = chrome.storage.local;
  const get = (keys) => new Promise((res) => store.get(keys, (v) => res(v || {})));
  const set = (obj) => new Promise((res) => store.set(obj, () => res()));

  async function featureOn() {
    return true; // Challenges is always on (no toggle); handle detection + link import always run.
  }

  // ---- detect + persist the logged-in handle ---------------------------------
  function detectHandle() {
    // The logged-in handle is the profile link beside the "Logout" control in the
    // top bar. Keying off Logout avoids grabbing the profile you happen to be
    // VIEWING (e.g. /profile/someone-else).
    const logout =
      document.querySelector('#header a[href*="/logout"]') ||
      document.querySelector('a[href*="action=logout"]') ||
      document.querySelector('a[href*="/logout"]');
    if (!logout) return null; // not logged in (or can't tell) — never guess
    let scope = logout.parentElement;
    for (let i = 0; i < 4 && scope; i++) {
      const a = scope.querySelector('a[href^="/profile/"]');
      if (a) {
        const m = (a.getAttribute("href") || "").match(/\/profile\/([^/?#]+)/);
        if (m) return decodeURIComponent(m[1]);
      }
      scope = scope.parentElement;
    }
    return null;
  }
  async function rememberHandle() {
    const h = detectHandle();
    if (!h) return;
    const raw = await get([C.HANDLE_KEY, "cpos.cf.handleManual"]);
    if (raw["cpos.cf.handleManual"]) return; // user set it explicitly (e.g. in VS Code) — don't override
    if (raw[C.HANDLE_KEY] !== h) await set({ [C.HANDLE_KEY]: h });
  }

  // ---- read a challenge link from the URL ------------------------------------
  function readLinkPayload() {
    try {
      const sp = new URLSearchParams(location.search);
      if (sp.get(C.LINK_PARAM)) return sp.get(C.LINK_PARAM);
      const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
      const hp = new URLSearchParams(hash);
      if (hp.get(C.LINK_PARAM)) return hp.get(C.LINK_PARAM);
    } catch (_) {}
    return null;
  }
  function stripLinkParam() {
    try {
      const url = new URL(location.href);
      url.searchParams.delete(C.LINK_PARAM);
      const clean = url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "");
      history.replaceState({}, "", clean || "/");
    } catch (_) {}
  }

  // ---- UI ---------------------------------------------------------------------
  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  function removeBanner() {
    const b = document.getElementById("cpos-chal-banner");
    if (b) b.remove();
  }

  function showBanner(dec, myHandle) {
    removeBanner();
    const card = el(
      "div",
      "position:fixed;top:16px;right:16px;z-index:2147483600;max-width:370px;" +
        "background:#1d1b29;color:#ececf4;border:1px solid #b794ff;border-radius:14px;" +
        "padding:16px 18px;box-shadow:0 10px 34px rgba(0,0,0,.45);" +
        "font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;"
    );
    card.id = "cpos-chal-banner";

    const head = el("div", "display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;margin-bottom:8px;");
    head.appendChild(el("span", "font-size:16px;", "⚔️"));
    head.appendChild(el("span", null, "CPOS Challenge"));
    card.appendChild(head);

    const fromTxt = dec.from ? dec.from : "Someone";
    card.appendChild(el("div", "margin-bottom:4px;", `${fromTxt} challenges you to:`));
    const prob = el("a", "color:#b794ff;font-weight:600;text-decoration:none;display:block;margin-bottom:6px;", C.problemLabel(dec.problem));
    prob.href = dec.problem.url;
    prob.target = "_blank";
    card.appendChild(prob);
    card.appendChild(
      el(
        "div",
        "opacity:.75;font-size:12px;margin-bottom:12px;",
        `First to get Accepted wins · ${dec.durationMin} min · verified on Codeforces`
      )
    );

    if (dec.to && myHandle && dec.to.toLowerCase() !== myHandle.toLowerCase()) {
      card.appendChild(
        el("div", "color:#ffcf6b;font-size:12px;margin-bottom:10px;", `Note: addressed to ${dec.to}. You can still accept as ${myHandle}.`)
      );
    }

    const btnRow = el("div", "display:flex;gap:8px;");
    const btnStyle =
      "flex:1;padding:8px 10px;border-radius:9px;border:0;cursor:pointer;font-weight:600;font-size:13px;";

    if (!myHandle) {
      const note = el(
        "div",
        "color:#ffcf6b;font-size:12px;margin-bottom:10px;",
        "Log in to Codeforces to accept (CPOS needs your handle to track the race)."
      );
      card.appendChild(note);
    }

    const accept = el("button", btnStyle + "background:#7c5cff;color:#fff;" + (myHandle ? "" : "opacity:.5;cursor:not-allowed;"), "Accept");
    const decline = el("button", btnStyle + "background:#2c2a3a;color:#cfcfe0;", "Decline");
    const dismiss = el("button", btnStyle + "background:transparent;color:#9a9ab0;flex:0 0 auto;padding:8px 10px;", "✕");

    accept.onclick = async () => {
      if (!myHandle) return;
      await acceptChallenge(dec, myHandle);
      stripLinkParam();
      showAccepted(dec);
    };
    decline.onclick = async () => {
      await declineChallenge(dec, myHandle);
      stripLinkParam();
      removeBanner();
    };
    dismiss.onclick = () => removeBanner();

    btnRow.appendChild(accept);
    btnRow.appendChild(decline);
    btnRow.appendChild(dismiss);
    card.appendChild(btnRow);

    (document.body || document.documentElement).appendChild(card);
  }

  function showAccepted(dec) {
    removeBanner();
    const card = el(
      "div",
      "position:fixed;top:16px;right:16px;z-index:2147483600;max-width:370px;" +
        "background:#16221a;color:#dfeede;border:1px solid #3fb950;border-radius:14px;" +
        "padding:16px 18px;box-shadow:0 10px 34px rgba(0,0,0,.45);" +
        "font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;"
    );
    card.id = "cpos-chal-banner";
    card.appendChild(el("div", "font-weight:700;font-size:14px;margin-bottom:6px;", "✅ Challenge accepted — go!"));
    card.appendChild(el("div", "margin-bottom:10px;", `Solve ${C.problemLabel(dec.problem)} and submit. CPOS will announce the winner.`));
    const open = el("a", "display:inline-block;background:#3fb950;color:#06210f;padding:8px 12px;border-radius:9px;font-weight:700;text-decoration:none;", "Open the problem →");
    open.href = dec.problem.url;
    open.target = "_blank";
    card.appendChild(open);
    (document.body || document.documentElement).appendChild(card);
    setTimeout(removeBanner, 9000);
  }

  // ---- accept / decline -------------------------------------------------------
  function challengeFromLink(dec, myHandle, status) {
    return {
      id: dec.id,
      role: "in",
      me: myHandle,
      opponent: dec.from || "",
      problem: dec.problem,
      createdAt: dec.createdAt || Date.now(),
      durationMin: dec.durationMin || 60,
      nonce: dec.nonce || "",
      status,
      myAcSec: null,
      oppAcSec: null,
      polled: false,
      notified: false,
      acceptedAt: Date.now()
    };
  }

  async function acceptChallenge(dec, myHandle) {
    const raw = await get([C.STORE_KEY]);
    const map = raw[C.STORE_KEY] || {};
    if (!map[dec.id] || map[dec.id].status === C.STATUS.DECLINED) {
      map[dec.id] = challengeFromLink(dec, myHandle, C.STATUS.ACTIVE);
      await set({ [C.STORE_KEY]: map });
    }
    // Open the problem so the existing capture flow creates the file in VS Code.
    try { window.open(dec.problem.url, "_blank", "noopener"); } catch (_) {}
    // Nudge the background module to begin polling right away.
    try { chrome.runtime.sendMessage({ type: "cpos-challenge-poll" }, () => void chrome.runtime.lastError); } catch (_) {}
  }

  async function declineChallenge(dec, myHandle) {
    const raw = await get([C.STORE_KEY]);
    const map = raw[C.STORE_KEY] || {};
    if (!map[dec.id]) {
      map[dec.id] = challengeFromLink(dec, myHandle || "", C.STATUS.DECLINED);
      await set({ [C.STORE_KEY]: map });
    }
  }

  // ---- on-page "Challenge" button (Codeforces problem pages) -----------------
  // crossed-swords icon (Lucide), tinted with the active theme's accent.
  const SWORDS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>';

  // Resolve the active CPOS theme tokens so the button/popover match the site theme.
  async function themeColors() {
    const T = self.CPOS_THEMES, CFG = self.CPOS;
    let tk = null;
    try { if (T && CFG) tk = T.get(await (CFG.activePageThemeId ? CFG.activePageThemeId() : CFG.activeThemeId())); } catch (_) {}
    const g = (k, d) => (tk && tk[k]) || d;
    return {
      accent: g("--accent", "#7c5cff"),
      accentOn: g("--accent-on", "#ffffff"),
      bg: g("--panel", g("--bg", "#1d1b29")),
      fg: g("--fg", "#ececf4"),
      dim: g("--dim", "#9a9ab0"),
      border: g("--border", "#3a3550"),
      panel2: g("--panel-2", "#2c2a3a"),
      bad: g("--bad", "#e5534b"),
      shadow: g("--shadow", "0 10px 30px rgba(0,0,0,.4)")
    };
  }

  async function toast(text) {
    const co = await themeColors();
    const old = document.getElementById("cpos-chal-toast");
    if (old) old.remove();
    const t = el(
      "div",
      "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2147483600;border-radius:10px;padding:10px 16px;" +
        "background:" + co.bg + ";color:" + co.fg + ";border:1px solid " + co.accent + ";" +
        "font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;",
      text
    );
    t.id = "cpos-chal-toast";
    (document.body || document.documentElement).appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; }, 2400);
    setTimeout(() => t.remove(), 2800);
  }

  async function createOnPageChallenge(prob, opponent) {
    const me = detectHandle();
    if (!me) { toast("Log in to Codeforces to challenge."); return; }
    const ch = {
      id: C.makeId(), role: "out", me, opponent: (opponent || "").trim(), problem: prob,
      createdAt: Date.now(), durationMin: 60, nonce: C.genNonce(), status: C.STATUS.PENDING,
      myAcSec: null, oppAcSec: null, polled: false, notified: false, online: true
    };
    const raw = await get([C.STORE_KEY]);
    const map = raw[C.STORE_KEY] || {};
    map[ch.id] = ch;
    await set({ [C.STORE_KEY]: map });
    // The background module publishes the invite (publishPending) on the next tick.
    try { chrome.runtime.sendMessage({ type: "cpos-challenge-poll" }, () => void chrome.runtime.lastError); } catch (_) {}
    toast(opponent ? `⚔️ Challenge sent to ${opponent}` : "⚔️ Open challenge posted — anyone can take it");
  }

  function closePopover() { const p = document.getElementById("cpos-chal-pop"); if (p) p.remove(); }

  async function openPopover(prob, anchor) {
    closePopover();
    const co = await themeColors();
    const r = anchor.getBoundingClientRect();
    const pop = el(
      "div",
      "position:fixed;z-index:2147483601;width:236px;border-radius:12px;padding:12px;" +
        "background:" + co.bg + ";color:" + co.fg + ";border:1px solid " + co.accent + ";" +
        "font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;"
    );
    pop.id = "cpos-chal-pop";
    pop.style.top = Math.min(window.innerHeight - 190, r.bottom + 6) + "px";
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 244, r.left)) + "px";
    const head = el("div", "font-weight:700;margin-bottom:9px;display:flex;align-items:center;gap:7px;");
    head.innerHTML = '<span style="display:inline-flex;color:' + co.accent + '">' + SWORDS + '</span><span>Challenge — ' + prob.id + '</span>';
    pop.appendChild(head);
    const bcss = "width:100%;padding:8px;border:0;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-bottom:6px;font-family:inherit;";
    const friend = el("button", bcss + "background:" + co.accent + ";color:" + co.accentOn + ";", "Challenge a friend");
    const random = el("button", bcss + "background:" + co.panel2 + ";color:" + co.fg + ";", "Random opponent");
    const inputWrap = el("div", "display:none;");
    const inp = el("input", "width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;border:1px solid " + co.border + ";background:" + co.bg + ";color:" + co.fg + ";font:inherit;");
    inp.placeholder = "friend's handle";
    const sendBtn = el("button", bcss + "background:" + co.accent + ";color:" + co.accentOn + ";margin-top:6px;margin-bottom:0;", "Send");
    inputWrap.appendChild(inp); inputWrap.appendChild(sendBtn);
    friend.onclick = () => { inputWrap.style.display = "block"; random.style.display = "none"; friend.style.display = "none"; inp.focus(); };
    random.onclick = async () => { await createOnPageChallenge(prob, ""); closePopover(); };
    sendBtn.onclick = async () => { const h = inp.value.trim(); if (!h) { inp.focus(); return; } await createOnPageChallenge(prob, h); closePopover(); };
    pop.appendChild(friend); pop.appendChild(random); pop.appendChild(inputWrap);
    (document.body || document.documentElement).appendChild(pop);
    setTimeout(() => {
      const onDoc = (e) => {
        if (!pop.contains(e.target) && e.target !== anchor) { closePopover(); document.removeEventListener("mousedown", onDoc); }
      };
      document.addEventListener("mousedown", onDoc);
    }, 0);
  }

  // Small icon button to the right of the problem title. Flips to a Cancel state
  // when you already have a live challenge out for this problem. Themed + flat.
  async function renderChallengeButton() {
    const prob = C.parseProblem(location.href);
    if (!prob) return; // not a problem page
    const titleEl = document.querySelector(".problem-statement .title") || document.querySelector(".title");
    const old = document.getElementById("cpos-chal-btn");
    if (old) old.remove();
    if (titleEl) prob.name = titleEl.textContent.replace(/^[A-Z]\d*\.\s*/, "").trim();
    prob.rating = 0;

    const map = (await get([C.STORE_KEY]))[C.STORE_KEY] || {};
    const mine = Object.keys(map).map((k) => map[k]).find((c) =>
      c && c.role === "out" && c.problem && c.problem.id === prob.id &&
      (c.status === C.STATUS.PENDING || c.status === C.STATUS.ACTIVE));

    const co = await themeColors();
    const base = "display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:10px;" +
      "width:30px;height:30px;border-radius:8px;cursor:pointer;padding:0;line-height:0;";
    const btn = el("button");
    btn.id = "cpos-chal-btn";

    if (mine) {
      btn.style.cssText = base + "background:transparent;color:" + co.bad + ";border:1px solid " + co.bad + ";";
      btn.title = "Cancel your challenge to this problem";
      btn.setAttribute("aria-label", "Cancel challenge");
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
      btn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const m = (await get([C.STORE_KEY]))[C.STORE_KEY] || {};
        delete m[mine.id];
        await set({ [C.STORE_KEY]: m });
        toast("Challenge cancelled");
      };
    } else {
      btn.style.cssText = base + "background:" + co.accent + ";color:" + co.accentOn + ";border:0;";
      btn.title = "Challenge someone to this problem";
      btn.setAttribute("aria-label", "Challenge");
      btn.innerHTML = SWORDS;
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (document.getElementById("cpos-chal-pop")) closePopover();
        else openPopover(prob, btn);
      };
    }

    if (titleEl) titleEl.appendChild(btn);
    else {
      btn.style.cssText += "position:fixed;bottom:18px;right:18px;z-index:2147483600;width:38px;height:38px;";
      (document.body || document.documentElement).appendChild(btn);
    }
  }

  // ---- entry ------------------------------------------------------------------
  async function run() {
    if (!(await featureOn())) return;
    await rememberHandle();
    renderChallengeButton().catch(() => {});

    const payload = readLinkPayload();
    if (!payload) return;
    const dec = C.decode(payload);
    if (!dec) return;

    const raw = await get([C.STORE_KEY]);
    const existing = (raw[C.STORE_KEY] || {})[dec.id];
    if (existing) { stripLinkParam(); return; } // already handled

    const myHandle = detectHandle();
    showBanner(dec, myHandle);
  }

  // Re-render the on-page button when challenges or the theme change.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[C.STORE_KEY] || changes["cpos.ui.theme"] || changes["cpos.features"] || changes["cpos.siteThemeId"]) {
        renderChallengeButton().catch(() => {});
      }
    });
  }

  run().catch(() => {});
})();
