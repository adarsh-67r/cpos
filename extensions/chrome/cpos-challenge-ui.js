// CPOS Challenge — popup UI. Renders into #cpos-challenges-section.
//
// Two delivery modes:
//   • Link (default, fully private): create a challenge → copy a link → share it.
//   • Online (opt-in, uses the free no-account ntfy.sh relay): challenge someone
//     by handle and they get a desktop notification — no URL to share. You can
//     also post/find "open" challenges in a shared lobby.
// Either way Codeforces is the referee (the background module decides the winner
// from public submissions). Reads/writes chrome.storage.local.
(function () {
  const C = self.CPOSChallenge;
  const mount = document.getElementById("cpos-challenges-section");
  if (!C || !mount || typeof chrome === "undefined" || !chrome.storage) return;

  const store = chrome.storage.local;
  const get = (keys) => new Promise((res) => store.get(keys, (v) => res(v || {})));
  const set = (obj) => new Promise((res) => store.set(obj, () => res()));
  const send = (m) => { try { chrome.runtime.sendMessage(m, () => void chrome.runtime.lastError); } catch (_) {} };

  const PROBLEMS_TTL = 24 * 60 * 60 * 1000;

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function css(e, s) { e.style.cssText = s; return e; }
  const INPUT = "padding:6px 8px;border-radius:8px;border:1px solid #d0d0da;font-size:13px;box-sizing:border-box;width:100%;";

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
    const problems = await getProblems();
    const hit = problems.find((p) => p.contestId === problem.contestId && p.index === problem.index);
    if (hit) { problem.name = hit.name || problem.name || ""; problem.rating = hit.rating || problem.rating || 0; }
    return problem;
  }

  async function loadAll() {
    const raw = await get([C.STORE_KEY, C.HANDLE_KEY, C.NOTIFY_KEY, C.ONLINE_KEY]);
    return {
      map: raw[C.STORE_KEY] || {},
      handle: raw[C.HANDLE_KEY] || "",
      notify: raw[C.NOTIFY_KEY] !== false,
      online: raw[C.ONLINE_KEY] === true
    };
  }
  async function saveChallenge(ch) {
    const raw = await get([C.STORE_KEY]);
    const m = raw[C.STORE_KEY] || {};
    m[ch.id] = ch;
    await set({ [C.STORE_KEY]: m });
  }

  const BADGE = {
    pending: ["Pending", "#f59f00"],
    active: ["In progress", "#7c5cff"],
    won: ["Won 🏆", "#2f9e44"],
    lost: ["Lost", "#e03131"],
    draw: ["Draw", "#f08c00"],
    expired: ["Expired", "#868e96"],
    declined: ["Declined", "#868e96"]
  };
  function fmtWhen(ms) {
    try { return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (_) { return ""; }
  }

  // ---- render -----------------------------------------------------------------
  async function render() {
    const { map, handle, notify, online } = await loadAll();
    mount.textContent = "";
    const root = css(el("div"), "display:flex;flex-direction:column;gap:10px;");

    // Your handle
    const hRow = css(el("div"), "display:flex;align-items:center;gap:8px;");
    hRow.appendChild(css(el("span", null, "You"), "font-size:12px;opacity:.7;min-width:26px;"));
    const hInput = el("input", { type: "text", placeholder: "your Codeforces handle", value: handle });
    css(hInput, INPUT);
    hInput.addEventListener("change", async () => { await set({ [C.HANDLE_KEY]: hInput.value.trim() }); });
    hRow.appendChild(hInput);
    root.appendChild(hRow);

    // Online toggle
    const oRow = css(el("label"), "display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;");
    const oChk = el("input", { type: "checkbox" });
    oChk.checked = online;
    oChk.addEventListener("change", async () => { await set({ [C.ONLINE_KEY]: oChk.checked }); send({ type: "cpos-challenge-poll" }); });
    oRow.appendChild(oChk);
    const oTxt = el("span");
    oTxt.appendChild(el("b", null, "Online delivery"));
    oTxt.appendChild(el("span", null, " — challenge by handle, no link. "));
    const oNote = css(el("span", null, "Uses ntfy.sh (public relay)."), "opacity:.6;");
    oTxt.appendChild(oNote);
    oRow.appendChild(oTxt);
    root.appendChild(oRow);

    // Create form
    const form = css(el("div"), "display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid #e6e6ee;border-radius:10px;");
    form.appendChild(css(el("div", null, "New challenge"), "font-weight:700;font-size:13px;"));

    const oppInput = el("input", { type: "text", placeholder: online ? "opponent handle (blank = open lobby)" : "opponent handle (optional)" });
    css(oppInput, INPUT);
    form.appendChild(oppInput);

    const probInput = el("input", { type: "text", placeholder: "problem URL or 1234A (blank = random)" });
    css(probInput, INPUT);
    form.appendChild(probInput);

    const optRow = css(el("div"), "display:flex;gap:7px;");
    const ratingInput = el("input", { type: "number", placeholder: "random rating", value: "1400", min: "800", max: "3500", step: "100" });
    css(ratingInput, INPUT);
    const durSel = css(el("select"), INPUT);
    [["30", "30 min"], ["60", "1 hour"], ["120", "2 hours"], ["1440", "1 day"]].forEach(([v, t]) => {
      const o = el("option", { value: v }, t); if (v === "60") o.selected = true; durSel.appendChild(o);
    });
    const wrap1 = css(el("div"), "flex:1;"); wrap1.appendChild(ratingInput);
    const wrap2 = css(el("div"), "flex:1;"); wrap2.appendChild(durSel);
    optRow.appendChild(wrap1); optRow.appendChild(wrap2);
    form.appendChild(optRow);

    const createBtn = css(el("button", { type: "button", class: "primary" }, online ? "Send challenge" : "Create challenge"), "padding:8px;border-radius:8px;cursor:pointer;font-weight:600;");
    form.appendChild(createBtn);
    const msg = css(el("div"), "font-size:12px;");
    form.appendChild(msg);
    const linkBox = css(el("div"), "display:none;");
    form.appendChild(linkBox);

    createBtn.addEventListener("click", async () => {
      const me = hInput.value.trim();
      if (!me) { msg.style.color = "#e03131"; msg.textContent = "Set your handle first."; return; }
      createBtn.disabled = true;
      msg.style.color = "#666"; msg.textContent = "Building…";
      try {
        let problem;
        const probRaw = probInput.value.trim();
        if (probRaw) {
          const parsed = C.parseProblem(probRaw);
          if (!parsed) { msg.style.color = "#e03131"; msg.textContent = "Use a CF problem URL or e.g. 1234A."; createBtn.disabled = false; return; }
          problem = await enrich(parsed);
        } else {
          const rating = Math.max(800, Math.min(3500, parseInt(ratingInput.value, 10) || 1400));
          problem = pickRandom(await getProblems(), rating);
          if (!problem) { msg.style.color = "#e03131"; msg.textContent = "Couldn't fetch a random problem (offline?)."; createBtn.disabled = false; return; }
        }
        const opponent = oppInput.value.trim();
        const ch = {
          id: C.makeId(), role: "out", me, opponent, problem,
          createdAt: Date.now(), durationMin: parseInt(durSel.value, 10) || 60,
          nonce: C.genNonce(), status: online ? C.STATUS.PENDING : C.STATUS.ACTIVE,
          myAcSec: null, oppAcSec: null, polled: false, notified: false, online
        };
        await saveChallenge(ch);
        if (online) {
          send({ type: "cpos-challenge-net", action: "invite", challengeId: ch.id });
          msg.style.color = "#2f9e44";
          msg.textContent = opponent ? `Sent to ${opponent} — they'll get a notification when CPOS is running.` : "Posted to the open lobby — anyone can accept.";
          showLink(linkBox, ch, "or share a direct link:");
        } else {
          showLink(linkBox, ch, "");
          msg.style.color = "#2f9e44";
          msg.textContent = opponent ? `Challenge for ${opponent} — send them this link.` : "Open challenge — share this link.";
        }
        send({ type: "cpos-challenge-poll" });
        oppInput.value = ""; probInput.value = "";
      } catch (_) {
        msg.style.color = "#e03131"; msg.textContent = "Something went wrong.";
      } finally {
        createBtn.disabled = false;
      }
    });
    root.appendChild(form);

    // Lobby browse (online only)
    if (online) {
      const lobbyBtn = css(el("button", { type: "button" }, "Find open challenges"), "padding:7px;border-radius:8px;cursor:pointer;font-size:12px;");
      const lobbyOut = css(el("div"), "display:flex;flex-direction:column;gap:6px;");
      lobbyBtn.addEventListener("click", () => browseLobby(lobbyOut, me => me, hInput, lobbyBtn));
      root.appendChild(lobbyBtn);
      root.appendChild(lobbyOut);
    }

    renderList(root, map);

    // Decided-notifications toggle
    const nRow = css(el("label"), "display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;");
    const nChk = el("input", { type: "checkbox" }); nChk.checked = notify;
    nChk.addEventListener("change", async () => { await set({ [C.NOTIFY_KEY]: nChk.checked }); });
    nRow.appendChild(nChk);
    nRow.appendChild(el("span", null, "Desktop notifications (challenge received / decided)"));
    root.appendChild(nRow);

    mount.appendChild(root);
  }

  function showLink(box, ch, label) {
    box.textContent = "";
    box.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:4px;";
    if (label) box.appendChild(css(el("div", null, label), "font-size:11px;opacity:.6;"));
    const row = css(el("div"), "display:flex;gap:6px;");
    const link = C.link(ch);
    const inp = el("input", { type: "text", readonly: "readonly", value: link });
    css(inp, INPUT + "font-size:11px;");
    inp.addEventListener("focus", () => inp.select());
    const copy = css(el("button", { type: "button" }, "Copy"), "padding:6px 10px;border-radius:8px;cursor:pointer;");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); copy.textContent = "Copied!"; setTimeout(() => (copy.textContent = "Copy"), 1500); }
      catch (_) { inp.select(); try { document.execCommand("copy"); } catch (e) {} }
    });
    row.appendChild(inp); row.appendChild(copy);
    box.appendChild(row);
  }

  async function browseLobby(out, _meFn, hInput, btn) {
    const me = hInput.value.trim();
    out.textContent = "";
    btn.disabled = true; btn.textContent = "Searching…";
    try {
      const res = await fetch(`${C.NTFY_BASE}/${C.LOBBY_TOPIC}/json?poll=1&since=6h`, { cache: "no-store" });
      const text = res.ok ? await res.text() : "";
      const seen = await get([C.STORE_KEY]);
      const have = seen[C.STORE_KEY] || {};
      const invites = [];
      for (const line of text.split("\n")) {
        const s = line.trim(); if (!s) continue;
        let ev; try { ev = JSON.parse(s); } catch (_) { continue; }
        if (!ev || ev.event !== "message") continue;
        const p = C.parseNetBody(ev.message || "");
        if (p && p.kind === "invite" && p.challenge && !have[p.challenge.id] && p.challenge.from !== me) invites.push(p.challenge);
      }
      if (!invites.length) { out.appendChild(css(el("div", null, "No open challenges right now."), "font-size:12px;opacity:.6;")); }
      for (const inv of invites.slice(0, 8)) {
        const row = css(el("div"), "display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px dashed #d8c9ff;border-radius:8px;");
        const left = css(el("div"), "flex:1;min-width:0;font-size:12px;");
        left.appendChild(css(el("div", null, C.problemLabel(inv.problem)), "font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"));
        left.appendChild(css(el("div", null, `from ${inv.from || "?"}`), "opacity:.6;"));
        row.appendChild(left);
        const acc = css(el("button", { type: "button" }, "Accept"), "padding:5px 9px;border-radius:7px;cursor:pointer;");
        acc.addEventListener("click", async () => { await acceptIncoming(inv, me); btn.disabled = false; btn.textContent = "Find open challenges"; });
        row.appendChild(acc);
        out.appendChild(row);
      }
    } catch (_) {
      out.appendChild(css(el("div", null, "Lobby unavailable right now."), "font-size:12px;opacity:.6;"));
    } finally {
      btn.disabled = false; btn.textContent = "Find open challenges";
    }
  }

  // Accept an incoming invite object (from inbox-stored or lobby): make it active
  // locally, tell the creator over ntfy, and open the problem.
  async function acceptIncoming(inv, me) {
    if (!me) return;
    const ch = {
      id: inv.id, role: "in", me, opponent: inv.from || "", problem: inv.problem,
      createdAt: inv.createdAt || Date.now(), durationMin: inv.durationMin || 60, nonce: inv.nonce || "",
      status: C.STATUS.ACTIVE, myAcSec: null, oppAcSec: null, polled: false, notified: false, online: true
    };
    await saveChallenge(ch);
    send({ type: "cpos-challenge-net", action: "accept", challengeId: ch.id });
    send({ type: "cpos-challenge-poll" });
    try { window.open(ch.problem.url, "_blank", "noopener"); } catch (_) {}
  }

  function renderList(root, map) {
    const old = root.querySelector(".cpos-chal-list");
    if (old) old.remove();
    const list = el("div", { class: "cpos-chal-list" });
    css(list, "display:flex;flex-direction:column;gap:6px;");

    const items = Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 14);
    if (!items.length) {
      list.appendChild(css(el("div", null, "No challenges yet — create one above."), "font-size:12px;opacity:.6;text-align:center;padding:6px;"));
      root.appendChild(list);
      return;
    }

    for (const ch of items) {
      const row = css(el("div"), "display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid #ececf2;border-radius:9px;");
      const left = css(el("div"), "flex:1;min-width:0;");
      const probA = el("a", { href: ch.problem.url, target: "_blank", rel: "noopener" }, C.problemLabel(ch.problem));
      css(probA, "color:#5b3fd6;font-weight:600;text-decoration:none;font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;");
      left.appendChild(probA);
      const who = ch.opponent ? `${ch.role === "out" ? "vs" : "from"} ${ch.opponent}` : (ch.role === "out" ? "open" : "open");
      left.appendChild(css(el("div", null, `${who} · ${fmtWhen(ch.createdAt)}`), "font-size:11px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"));
      row.appendChild(left);

      // Incoming pending → Accept / Decline
      if (ch.role === "in" && ch.status === C.STATUS.PENDING) {
        const acc = css(el("button", { type: "button" }, "Accept"), "padding:5px 9px;border-radius:7px;cursor:pointer;font-size:12px;");
        acc.addEventListener("click", async () => { await acceptIncoming(ch, ch.me); });
        const dec = css(el("button", { type: "button" }, "Decline"), "padding:5px 8px;border-radius:7px;cursor:pointer;font-size:12px;background:#f1f1f5;border:0;");
        dec.addEventListener("click", async () => {
          ch.status = C.STATUS.DECLINED; await saveChallenge(ch);
          if (ch.online) send({ type: "cpos-challenge-net", action: "decline", challengeId: ch.id });
        });
        row.appendChild(acc); row.appendChild(dec);
      } else {
        const [label, color] = BADGE[ch.status] || [ch.status, "#868e96"];
        row.appendChild(css(el("span", null, label), `font-size:11px;font-weight:700;color:#fff;background:${color};padding:3px 7px;border-radius:20px;white-space:nowrap;`));
      }

      const copy = css(el("button", { type: "button", title: "Copy challenge link" }, "🔗"), "border:0;background:transparent;cursor:pointer;font-size:13px;padding:2px 4px;");
      copy.addEventListener("click", async (e) => {
        e.preventDefault();
        try { await navigator.clipboard.writeText(C.link(ch)); copy.textContent = "✓"; setTimeout(() => (copy.textContent = "🔗"), 1200); } catch (_) {}
      });
      row.appendChild(copy);

      const del = css(el("button", { type: "button", title: "Remove" }, "✕"), "border:0;background:transparent;cursor:pointer;font-size:12px;color:#aaa;padding:2px 4px;");
      del.addEventListener("click", async () => {
        const raw = await get([C.STORE_KEY]); const m = raw[C.STORE_KEY] || {};
        delete m[ch.id]; await set({ [C.STORE_KEY]: m });
      });
      row.appendChild(del);
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[C.STORE_KEY] || changes[C.HANDLE_KEY] || changes[C.NOTIFY_KEY] || changes[C.ONLINE_KEY]) render();
    });
  }
  send({ type: "cpos-challenge-poll" });
  render();
})();
