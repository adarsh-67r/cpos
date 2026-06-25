// CPOS problem timer — a small, draggable, theme-aware stopwatch injected on
// Codeforces problem pages (/problemset/problem/*, /contest/*/problem/*,
// /gym/*/problem/*). It auto-starts (configurable) when you open a problem and
// PERSISTS elapsed time per-problem in chrome.storage.local, so reopening the
// same problem resumes the clock. Start / pause / reset, draggable, remembers
// its position. Additive and unobtrusive; all UI lives under id "cpos-timer".
// Never touches capture/submit. Toggle from the CPOS popup (feature
// "problemTimer").
(function () {
  const ROOT_ID = "cpos-timer";
  const T = self.CPOS_THEMES;
  const C = self.CPOS;
  if (!C) return;

  const FEATURE = "problemTimer";
  const STATE_KEY = "cpos.timer.state";   // { "<pid>": { elapsed, running, startedAt } }
  const POS_KEY = "cpos.timer.pos";        // { x, y } viewport offset (px from top-left)
  const AUTOSTART_KEY = "cpos.timer.autostart"; // bool — auto-start on open (default true)

  // ── per-problem id from the URL ────────────────────────────────────────────
  // contest/gym: /contest/1234/problem/A  ·  problemset: /problemset/problem/1234/A
  function problemId() {
    const p = location.pathname;
    let m = p.match(/^\/(?:contest|gym)\/(\d+)\/problem\/([^/?#]+)/i);
    if (m) return "cf:" + m[1] + "-" + m[2].toUpperCase();
    m = p.match(/^\/problemset\/problem\/(\d+)\/([^/?#]+)/i);
    if (m) return "cf:" + m[1] + "-" + m[2].toUpperCase();
    return null;
  }

  const PID = problemId();
  if (!PID) return;

  // ── storage helpers (namespaced cpos.timer.*) ──────────────────────────────
  async function getState() {
    const raw = await C.get([STATE_KEY]);
    return (raw[STATE_KEY] && typeof raw[STATE_KEY] === "object") ? raw[STATE_KEY] : {};
  }
  async function saveEntry(entry) {
    const all = await getState();
    all[PID] = entry;
    await C.set({ [STATE_KEY]: all });
  }
  async function getEntry() {
    const all = await getState();
    const e = all[PID];
    return e && typeof e === "object"
      ? { elapsed: e.elapsed || 0, running: !!e.running, startedAt: e.startedAt || 0 }
      : { elapsed: 0, running: false, startedAt: 0 };
  }
  async function getAutostart() {
    const raw = await C.get([AUTOSTART_KEY]);
    return raw[AUTOSTART_KEY] !== false; // default ON
  }
  async function setAutostart(v) { await C.set({ [AUTOSTART_KEY]: !!v }); }

  // ── local runtime state ────────────────────────────────────────────────────
  let baseElapsed = 0;   // ms accumulated before the current run
  let startedAt = 0;     // epoch ms when the current run began (0 = paused)
  let running = false;
  let tick = null;

  function liveMs() { return baseElapsed + (running && startedAt ? (Date.now() - startedAt) : 0); }

  function fmt(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return (h > 0 ? h + ":" + pad(m) : pad(m)) + ":" + pad(s);
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────
  let rootEl = null, timeEl = null, playBtn = null;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function render() {
    if (!rootEl) return;
    timeEl.textContent = fmt(liveMs());
    rootEl.setAttribute("data-running", running ? "1" : "0");
    playBtn.innerHTML = running ? PAUSE_SVG : PLAY_SVG;
    playBtn.title = running ? "Pause" : "Start";
    playBtn.setAttribute("aria-label", running ? "Pause" : "Start");
  }

  const PLAY_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  const RESET_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>';

  function startTick() {
    stopTick();
    tick = setInterval(render, 250);
  }
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

  async function doStart() {
    if (running) return;
    running = true;
    startedAt = Date.now();
    startTick();
    render();
    await saveEntry({ elapsed: baseElapsed, running: true, startedAt });
  }
  async function doPause() {
    if (!running) return;
    baseElapsed = liveMs();
    running = false;
    startedAt = 0;
    stopTick();
    render();
    await saveEntry({ elapsed: baseElapsed, running: false, startedAt: 0 });
  }
  async function doToggle() { running ? doPause() : doStart(); }
  async function doReset() {
    baseElapsed = 0;
    startedAt = running ? Date.now() : 0;
    render();
    await saveEntry({ elapsed: 0, running, startedAt });
  }

  // ── dragging (remembers position) ──────────────────────────────────────────
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  async function applyPos() {
    const raw = await C.get([POS_KEY]);
    const pos = raw[POS_KEY];
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      placeAt(pos.x, pos.y);
    } else {
      // default: bottom-left (bottom-right is taken by the pen launcher)
      rootEl.style.left = "16px";
      rootEl.style.bottom = "16px";
      rootEl.style.right = "auto";
      rootEl.style.top = "auto";
    }
  }
  function placeAt(x, y) {
    const w = rootEl.offsetWidth || 150, h = rootEl.offsetHeight || 40;
    x = clamp(x, 0, Math.max(0, window.innerWidth - w));
    y = clamp(y, 0, Math.max(0, window.innerHeight - h));
    rootEl.style.left = x + "px";
    rootEl.style.top = y + "px";
    rootEl.style.right = "auto";
    rootEl.style.bottom = "auto";
  }
  function wireDrag(handle) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      const r = rootEl.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      handle.setPointerCapture(e.pointerId);
      rootEl.setAttribute("data-dragging", "1");
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      placeAt(ox + dx, oy + dy);
    });
    const end = async (e) => {
      if (!dragging) return;
      dragging = false;
      rootEl.removeAttribute("data-dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) {
        const r = rootEl.getBoundingClientRect();
        await C.set({ [POS_KEY]: { x: r.left, y: r.top } });
      }
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  // ── theme ──────────────────────────────────────────────────────────────────
  async function applyTheme() {
    if (!rootEl || !T) return;
    T.applyTheme(rootEl, await (C.activePageThemeId ? C.activePageThemeId() : C.activeThemeId()));
  }

  // ── build / teardown ────────────────────────────────────────────────────────
  async function build() {
    if (document.getElementById(ROOT_ID)) return;
    if (!document.body) return;

    rootEl = el("div");
    rootEl.id = ROOT_ID;

    const grip = el("span", "cpos-timer-grip", "&#x205A;");
    grip.title = "Drag to move";

    const label = el("span", "cpos-timer-label", "Timer");

    timeEl = el("span", "cpos-timer-time", "00:00");

    playBtn = el("button", "cpos-timer-btn cpos-timer-play", PLAY_SVG);
    const resetBtn = el("button", "cpos-timer-btn cpos-timer-reset", RESET_SVG);
    resetBtn.title = "Reset";
    resetBtn.setAttribute("aria-label", "Reset");

    playBtn.addEventListener("click", (e) => { e.stopPropagation(); doToggle(); });
    resetBtn.addEventListener("click", (e) => { e.stopPropagation(); doReset(); });

    rootEl.appendChild(grip);
    rootEl.appendChild(label);
    rootEl.appendChild(timeEl);
    rootEl.appendChild(playBtn);
    rootEl.appendChild(resetBtn);
    document.body.appendChild(rootEl);

    await applyTheme();
    await applyPos();
    wireDrag(grip);

    // Restore persisted per-problem state.
    const entry = await getEntry();
    baseElapsed = entry.elapsed || 0;
    if (entry.running && entry.startedAt) {
      // Continue accruing from where it was left (across reloads / time away).
      running = true;
      startedAt = entry.startedAt;
      startTick();
    } else if (entry.running) {
      running = true;
      startedAt = Date.now();
      startTick();
    } else {
      running = false;
      startedAt = 0;
      // Auto-start only a fresh problem (no prior elapsed) when enabled.
      if (baseElapsed === 0 && (await getAutostart())) {
        await doStart();
      }
    }
    render();

    // Pause-safe persistence on unload (rebase elapsed so it resumes cleanly).
    window.addEventListener("beforeunload", () => {
      try {
        const e2 = { elapsed: liveMs(), running, startedAt: running ? Date.now() : 0 };
        // best-effort synchronous-ish write
        getState().then((all) => { all[PID] = e2; C.set({ [STATE_KEY]: all }); });
      } catch (_) {}
    });
  }

  function remove() {
    stopTick();
    document.getElementById(ROOT_ID)?.remove();
    rootEl = null;
  }

  async function sync() {
    const on = await C.feature(FEATURE);
    if (on) build().catch((e) => console.debug("CPOS timer:", e));
    else remove();
  }

  C.onChange((changes) => {
    if (changes[C.KEYS.FEATURES]) sync();
    else applyTheme();
  });

  if (document.body) sync();
  else document.addEventListener("DOMContentLoaded", sync, { once: true });
})();
