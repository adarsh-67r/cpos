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
    const link =
      document.querySelector('#header a[href^="/profile/"]') ||
      document.querySelector('.lang-chooser a[href^="/profile/"]');
    if (!link) return null;
    const m = (link.getAttribute("href") || "").match(/\/profile\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  async function rememberHandle() {
    const h = detectHandle();
    if (!h) return;
    const raw = await get([C.HANDLE_KEY]);
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
  function toast(text) {
    const old = document.getElementById("cpos-chal-toast");
    if (old) old.remove();
    const t = el(
      "div",
      "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2147483600;" +
        "background:#1d1b29;color:#ececf4;border:1px solid #7c5cff;border-radius:10px;padding:10px 16px;" +
        "font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.4);",
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

  function openPopover(prob, anchor) {
    closePopover();
    const r = anchor.getBoundingClientRect();
    const pop = el(
      "div",
      "position:fixed;z-index:2147483601;width:236px;background:#1d1b29;color:#ececf4;border:1px solid #7c5cff;" +
        "border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;"
    );
    pop.id = "cpos-chal-pop";
    pop.style.top = Math.min(window.innerHeight - 190, r.bottom + 6) + "px";
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 244, r.left)) + "px";
    pop.appendChild(el("div", "font-weight:700;margin-bottom:9px;", "⚔️ Challenge — " + prob.id));
    const bcss = "width:100%;padding:8px;border:0;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-bottom:6px;";
    const friend = el("button", bcss + "background:#7c5cff;color:#fff;", "Challenge a friend");
    const random = el("button", bcss + "background:#2c2a3a;color:#cfcfe0;", "Random opponent");
    const inputWrap = el("div", "display:none;");
    const inp = el("input", "width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;border:1px solid #3a3550;background:#15131f;color:#ececf4;font:inherit;");
    inp.placeholder = "friend's handle";
    const sendBtn = el("button", bcss + "background:#7c5cff;color:#fff;margin-top:6px;margin-bottom:0;", "Send");
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

  function injectChallengeButton() {
    const prob = C.parseProblem(location.href);
    if (!prob) return; // not a problem page
    if (document.getElementById("cpos-chal-btn")) return;
    const titleEl = document.querySelector(".problem-statement .title") || document.querySelector(".title");
    prob.name = titleEl ? titleEl.textContent.replace(/^[A-Z]\d*\.\s*/, "").trim() : "";
    prob.rating = 0;
    const btn = el(
      "button",
      "display:inline-flex;align-items:center;gap:5px;margin-left:10px;vertical-align:middle;" +
        "background:#7c5cff;color:#fff;border:0;border-radius:7px;padding:4px 10px;font-weight:600;font-size:12px;cursor:pointer;",
      "⚔ Challenge"
    );
    btn.id = "cpos-chal-btn";
    btn.onclick = (e) => {
      e.preventDefault();
      if (document.getElementById("cpos-chal-pop")) closePopover();
      else openPopover(prob, btn);
    };
    const header = document.querySelector(".problem-statement .header");
    if (titleEl && titleEl.parentNode) {
      titleEl.parentNode.insertBefore(btn, titleEl.nextSibling);
    } else if (header) {
      header.appendChild(btn);
    } else {
      btn.style.cssText += "position:fixed;bottom:18px;right:18px;z-index:2147483600;padding:8px 14px;border-radius:9px;box-shadow:0 6px 20px rgba(0,0,0,.35);";
      (document.body || document.documentElement).appendChild(btn);
    }
  }

  // ---- entry ------------------------------------------------------------------
  async function run() {
    if (!(await featureOn())) return;
    await rememberHandle();
    try { injectChallengeButton(); } catch (_) {}

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

  run().catch(() => {});
})();
