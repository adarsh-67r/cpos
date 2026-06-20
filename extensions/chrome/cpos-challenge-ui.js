// CPOS Challenge — popup UI (renders into #cpos-challenges-section).
//
// Design goals: dead simple. Your authenticated Codeforces handle is used as-is
// (read-only). Online delivery is always on — challenge a friend by handle (or
// leave it blank for anyone), pick a problem or let it randomise, hit Send.
// Turning on "Accept public challenges" with a rating range auto-lists open
// matches. Codeforces decides the winner. Styled with the popup's theme tokens.
(function () {
  const C = self.CPOSChallenge;
  const mount = document.getElementById("cpos-challenges-section");
  if (!C || !mount || typeof chrome === "undefined" || !chrome.storage) return;

  const store = chrome.storage.local;
  const get = (keys) => new Promise((res) => store.get(keys, (v) => res(v || {})));
  const set = (obj) => new Promise((res) => store.set(obj, () => res()));
  const send = (m) => { try { chrome.runtime.sendMessage(m, () => void chrome.runtime.lastError); } catch (_) {} };

  const PUBLIC_KEY = "cpos.challenge.publicOn"; // accept public challenges
  const RANGE_KEY = "cpos.challenge.range";     // { min, max }
  const PROBLEMS_TTL = 24 * 60 * 60 * 1000;

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // One-time themed styles so inputs/buttons match the popup palette (no defaults).
  function ensureStyle() {
    if (document.getElementById("cpos-ch-style")) return;
    const s = el("style", { id: "cpos-ch-style" });
    s.textContent =
      "#cpos-challenges-section{display:flex;flex-direction:column;gap:9px;font-size:12px}" +
      "#cpos-challenges-section .ch-as{color:var(--dim);font-size:11px}" +
      "#cpos-challenges-section .ch-as b{color:var(--fg)}" +
      "#cpos-challenges-section input,#cpos-challenges-section select{box-sizing:border-box;width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--border);background:var(--panel-2);color:var(--fg);font:inherit;font-size:12px}" +
      "#cpos-challenges-section input:focus,#cpos-challenges-section select:focus{outline:none;border-color:var(--accent)}" +
      "#cpos-challenges-section .ch-form{display:flex;flex-direction:column;gap:7px}" +
      "#cpos-challenges-section .ch-2{display:flex;gap:7px}" +
      "#cpos-challenges-section .ch-send{width:100%;padding:9px;border:0;border-radius:9px;background:var(--accent);color:var(--accent-on);font-weight:700;font-size:13px;cursor:pointer}" +
      "#cpos-challenges-section .ch-send:hover{filter:brightness(1.06)}" +
      "#cpos-challenges-section .ch-send:disabled{opacity:.5;cursor:default;filter:none}" +
      "#cpos-challenges-section .ch-mini{padding:5px 11px;border:1px solid var(--border);border-radius:7px;background:transparent;color:var(--fg);font:inherit;font-size:12px;font-weight:600;cursor:pointer}" +
      "#cpos-challenges-section .ch-mini:hover{border-color:var(--accent);color:var(--accent)}" +
      "#cpos-challenges-section .ch-mini.solid{background:var(--accent);color:var(--accent-on);border-color:var(--accent)}" +
      "#cpos-challenges-section .ch-msg{font-size:11px;min-height:14px}" +
      "#cpos-challenges-section .ch-pub{display:flex;align-items:center;gap:8px}" +
      "#cpos-challenges-section .ch-pub .lbl{flex:1}" +
      "#cpos-challenges-section .ch-range{width:58px!important;flex:0 0 auto;text-align:center}" +
      "#cpos-challenges-section .ch-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--border);border-radius:9px}" +
      "#cpos-challenges-section .ch-row.dash{border-style:dashed}" +
      "#cpos-challenges-section .ch-row .who{flex:1;min-width:0}" +
      "#cpos-challenges-section .ch-prob{color:var(--accent);font-weight:600;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}" +
      "#cpos-challenges-section .ch-sub{color:var(--dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#cpos-challenges-section .ch-badge{font-size:10px;font-weight:700;color:#fff;padding:3px 7px;border-radius:20px;white-space:nowrap}" +
      "#cpos-challenges-section .ch-x{border:0;background:transparent;color:var(--dim);cursor:pointer;font-size:12px;padding:2px 4px}" +
      "#cpos-challenges-section .ch-empty{color:var(--dim);text-align:center;padding:4px}";
    document.head.appendChild(s);
  }

  // ---- problemset cache (random picks) ---------------------------------------
  async function getProblems() {
    const raw = await get([C.PROBLEMS_KEY]);
    const rec = raw[C.PROBLEMS_KEY];
    if (rec && rec.problems && Date.now() - (rec.ts || 0) < PROBLEMS_TTL) return rec.problems;
    try {
      const res = await fetch("https://codeforces.com/api/problemset.problems", { cache: "no-store", credentials: "omit" });
      const j = await res.json();
      if (j.status !== "OK") throw new Error("problemset failed");
      const problems = (j.result.problems || [])
        .filter((p) => p.contestId && p.index && typeof p.rating === "number")
        .map((p) => ({ contestId: p.contestId, index: p.index, name: p.name, rating: p.rating }));
      await set({ [C.PROBLEMS_KEY]: { ts: Date.now(), problems } });
      return problems;
    } catch (_) {
      return (rec && rec.problems) || [];
    }
  }
  function pickRandom(problems, rating) {
    let pool = problems.filter((p) => p.rating === rating);
    if (pool.length < 5) pool = problems.filter((p) => Math.abs(p.rating - rating) <= 100);
    if (!pool.length) pool = problems;
    if (!pool.length) return null;
    const p = pool[Math.floor(Math.random() * pool.length)];
    return { platform: "codeforces", contestId: p.contestId, index: p.index, id: `${p.contestId}${p.index}`, name: p.name || "", url: `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`, rating: p.rating };
  }
  async function enrich(problem) {
    const hit = (await getProblems()).find((p) => p.contestId === problem.contestId && p.index === problem.index);
    if (hit) { problem.name = hit.name || problem.name || ""; problem.rating = hit.rating || problem.rating || 0; }
    return problem;
  }

  async function loadAll() {
    const raw = await get([C.STORE_KEY, C.HANDLE_KEY, PUBLIC_KEY, RANGE_KEY]);
    const r = raw[RANGE_KEY] || {};
    return {
      map: raw[C.STORE_KEY] || {},
      handle: raw[C.HANDLE_KEY] || "",
      publicOn: raw[PUBLIC_KEY] === true,
      range: { min: Number(r.min) || 800, max: Number(r.max) || 3500 }
    };
  }
  async function saveChallenge(ch) {
    const raw = await get([C.STORE_KEY]);
    const m = raw[C.STORE_KEY] || {};
    m[ch.id] = ch;
    await set({ [C.STORE_KEY]: m });
  }

  const BADGE = {
    pending: ["Pending", "#f59f00"], active: ["Racing", "#7c5cff"],
    won: ["Won", "#2f9e44"], lost: ["Lost", "#e03131"], draw: ["Draw", "#f08c00"],
    expired: ["Expired", "#868e96"], declined: ["Declined", "#868e96"]
  };

  // ---- render -----------------------------------------------------------------
  async function render() {
    ensureStyle();
    const { map, handle, publicOn, range } = await loadAll();
    mount.textContent = "";

    // Who you are — the authenticated handle, read-only.
    if (handle) {
      const who = el("div", { class: "ch-as" });
      who.appendChild(document.createTextNode("Racing as "));
      who.appendChild(el("b", null, handle));
      mount.appendChild(who);
    } else {
      mount.appendChild(el("div", { class: "ch-as" }, "Open a Codeforces page so CPOS can detect your handle."));
    }

    // Create form
    const form = el("div", { class: "ch-form" });
    const oppInput = el("input", { type: "text", placeholder: "friend's handle — blank for anyone" });
    const probInput = el("input", { type: "text", placeholder: "problem link or ID — blank for random" });
    const row2 = el("div", { class: "ch-2" });
    const ratingInput = el("input", { type: "number", value: "1400", min: "800", max: "3500", step: "100", title: "difficulty for the random problem" });
    const durSel = el("select");
    [["30", "30 min"], ["60", "1 hour"], ["120", "2 hours"], ["1440", "1 day"]].forEach(([v, t]) => {
      const o = el("option", { value: v }, t); if (v === "60") o.selected = true; durSel.appendChild(o);
    });
    const ratingWrap = el("div"); ratingWrap.style.flex = "1"; ratingWrap.appendChild(ratingInput);
    const durWrap = el("div"); durWrap.style.flex = "1"; durWrap.appendChild(durSel);
    row2.appendChild(ratingWrap); row2.appendChild(durWrap);
    const sendBtn = el("button", { class: "ch-send", type: "button" }, "Send challenge");
    if (!handle) sendBtn.disabled = true;
    const msg = el("div", { class: "ch-msg" });
    form.appendChild(oppInput); form.appendChild(probInput); form.appendChild(row2); form.appendChild(sendBtn); form.appendChild(msg);
    mount.appendChild(form);

    // Rating only matters for a random problem.
    const syncRating = () => { ratingWrap.style.display = probInput.value.trim() ? "none" : ""; };
    probInput.addEventListener("input", syncRating); syncRating();

    sendBtn.addEventListener("click", async () => {
      if (!handle) return;
      sendBtn.disabled = true; msg.style.color = "var(--dim)"; msg.textContent = "Sending…";
      try {
        let problem;
        const raw = probInput.value.trim();
        if (raw) {
          const parsed = C.parseProblem(raw);
          if (!parsed) { msg.style.color = "var(--bad,#e03131)"; msg.textContent = "Use a CF problem link or e.g. 1234A."; sendBtn.disabled = false; return; }
          problem = await enrich(parsed);
        } else {
          problem = pickRandom(await getProblems(), Math.max(800, Math.min(3500, parseInt(ratingInput.value, 10) || 1400)));
          if (!problem) { msg.style.color = "var(--bad,#e03131)"; msg.textContent = "Couldn't fetch a random problem (offline?)."; sendBtn.disabled = false; return; }
        }
        const opponent = oppInput.value.trim();
        const ch = {
          id: C.makeId(), role: "out", me: handle, opponent, problem,
          createdAt: Date.now(), durationMin: parseInt(durSel.value, 10) || 60,
          nonce: C.genNonce(), status: C.STATUS.PENDING, myAcSec: null, oppAcSec: null,
          polled: false, notified: false, online: true
        };
        await saveChallenge(ch);
        send({ type: "cpos-challenge-net", action: "invite", challengeId: ch.id });
        send({ type: "cpos-challenge-poll" });
        msg.style.color = "var(--ok,#2f9e44)";
        msg.textContent = opponent
          ? `Sent to ${opponent} — ${C.INVITE_TTL_MIN} min to accept.`
          : `Open challenge posted — ${C.INVITE_TTL_MIN} min to find a taker.`;
        oppInput.value = ""; probInput.value = ""; syncRating();
      } catch (_) {
        msg.style.color = "var(--bad,#e03131)"; msg.textContent = "Something went wrong.";
      } finally {
        sendBtn.disabled = !handle;
      }
    });

    // Accept public challenges — toggle + range; turning it on auto-lists matches.
    const pubRow = el("div", { class: "ch-pub" });
    pubRow.appendChild(el("span", { class: "lbl" }, "Accept public challenges"));
    const minR = el("input", { type: "number", class: "ch-range", value: String(range.min), min: "800", max: "3500", step: "100", title: "min rating" });
    const maxR = el("input", { type: "number", class: "ch-range", value: String(range.max), min: "800", max: "3500", step: "100", title: "max rating" });
    // Must be a <label> so a click reaches the (zero-size, visually-hidden) checkbox.
    const swWrap = el("label", { class: "sw" }); const swIn = el("input", { type: "checkbox" }); if (publicOn) swIn.checked = true;
    swWrap.appendChild(swIn); swWrap.appendChild(el("span"));
    pubRow.appendChild(minR); pubRow.appendChild(el("span", null, "–")); pubRow.appendChild(maxR); pubRow.appendChild(swWrap);
    mount.appendChild(pubRow);
    const pubList = el("div", { class: "ch-form" });
    mount.appendChild(pubList);

    const persistRange = () => set({ [RANGE_KEY]: { min: parseInt(minR.value, 10) || 800, max: parseInt(maxR.value, 10) || 3500 } });
    minR.addEventListener("change", persistRange);
    maxR.addEventListener("change", persistRange);
    swIn.addEventListener("change", async () => { await set({ [PUBLIC_KEY]: swIn.checked }); await persistRange(); refreshPublic(pubList, handle, swIn.checked, parseInt(minR.value, 10) || 0, parseInt(maxR.value, 10) || 9999); });
    if (publicOn) refreshPublic(pubList, handle, true, range.min, range.max);

    // Your challenges
    renderList(mount, map);
  }

  // Fetch open lobby challenges in range and list them (accept inline). No button.
  async function refreshPublic(container, me, on, lo, hi) {
    container.textContent = "";
    if (!on) return;
    container.appendChild(el("div", { class: "ch-empty" }, "Looking for open challenges…"));
    try {
      const res = await fetch(`${C.NTFY_BASE}/${C.LOBBY_TOPIC}/json?poll=1&since=6h`, { cache: "no-store" });
      const text = res.ok ? await res.text() : "";
      const have = (await get([C.STORE_KEY]))[C.STORE_KEY] || {};
      const seen = new Set();
      const invites = [];
      for (const line of text.split("\n")) {
        const s = line.trim(); if (!s) continue;
        let ev; try { ev = JSON.parse(s); } catch (_) { continue; }
        if (!ev || ev.event !== "message") continue;
        const p = C.parseNetBody(ev.message || "");
        if (!(p && p.kind === "invite" && p.challenge)) continue;
        const inv = p.challenge;
        if (have[inv.id] || seen.has(inv.id) || inv.from === me) continue;
        const r = inv.problem.rating || 0;
        if (r && (r < lo || r > hi)) continue;
        seen.add(inv.id); invites.push(inv);
      }
      container.textContent = "";
      if (!invites.length) { container.appendChild(el("div", { class: "ch-empty" }, `No open challenges rated ${lo}–${hi}.`)); return; }
      for (const inv of invites.slice(0, 8)) {
        const row = el("div", { class: "ch-row dash" });
        const who = el("div", { class: "who" });
        who.appendChild(el("div", { class: "ch-prob", style: "color:var(--fg)" }, C.problemLabel(inv.problem)));
        who.appendChild(el("div", { class: "ch-sub" }, `from ${inv.from || "?"}`));
        row.appendChild(who);
        const acc = el("button", { class: "ch-mini solid", type: "button" }, "Accept");
        acc.addEventListener("click", () => acceptIncoming(inv, me));
        row.appendChild(acc);
        container.appendChild(row);
      }
    } catch (_) {
      container.textContent = ""; container.appendChild(el("div", { class: "ch-empty" }, "Lobby unavailable right now."));
    }
  }

  async function acceptIncoming(inv, me) {
    if (!me) return;
    await saveChallenge({
      id: inv.id, role: "in", me, opponent: inv.from || "", problem: inv.problem,
      createdAt: inv.createdAt || Date.now(), durationMin: inv.durationMin || 60, nonce: inv.nonce || "",
      status: C.STATUS.ACTIVE, myAcSec: null, oppAcSec: null, polled: false, notified: false, online: true
    });
    send({ type: "cpos-challenge-net", action: "accept", challengeId: inv.id });
    send({ type: "cpos-challenge-poll" });
    try { window.open(inv.problem.url, "_blank", "noopener"); } catch (_) {}
  }

  function fmtWhen(ms) {
    try { return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (_) { return ""; }
  }

  function renderList(root, map) {
    const items = Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
    const list = el("div", { class: "ch-form" });
    list.appendChild(el("div", { class: "ch-as" }, "Your challenges"));
    if (!items.length) { list.appendChild(el("div", { class: "ch-empty" }, "None yet.")); root.appendChild(list); return; }
    for (const ch of items) {
      const row = el("div", { class: "ch-row" });
      const who = el("div", { class: "who" });
      const a = el("a", { class: "ch-prob", href: ch.problem.url, target: "_blank", rel: "noopener" }, C.problemLabel(ch.problem));
      who.appendChild(a);
      const opp = ch.opponent ? `${ch.role === "out" ? "vs" : "from"} ${ch.opponent}` : "open";
      who.appendChild(el("div", { class: "ch-sub" }, `${opp} · ${fmtWhen(ch.createdAt)}`));
      row.appendChild(who);

      if (ch.role === "in" && ch.status === C.STATUS.PENDING) {
        const acc = el("button", { class: "ch-mini solid", type: "button" }, "Accept");
        acc.addEventListener("click", () => acceptIncoming(ch, ch.me));
        const dec = el("button", { class: "ch-mini", type: "button" }, "Decline");
        dec.addEventListener("click", async () => {
          ch.status = C.STATUS.DECLINED; await saveChallenge(ch);
          if (ch.online) send({ type: "cpos-challenge-net", action: "decline", challengeId: ch.id });
        });
        row.appendChild(acc); row.appendChild(dec);
      } else {
        const [label, color] = BADGE[ch.status] || [ch.status, "#868e96"];
        const b = el("span", { class: "ch-badge" }, label); b.style.background = color;
        row.appendChild(b);
      }
      const x = el("button", { class: "ch-x", type: "button", title: "Remove" }, "✕");
      x.addEventListener("click", async () => {
        const m = (await get([C.STORE_KEY]))[C.STORE_KEY] || {}; delete m[ch.id]; await set({ [C.STORE_KEY]: m });
      });
      row.appendChild(x);
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[C.STORE_KEY] || changes[C.HANDLE_KEY] || changes[PUBLIC_KEY] || changes[RANGE_KEY]) render();
    });
  }
  send({ type: "cpos-challenge-poll" });
  render();
})();
