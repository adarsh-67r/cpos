// CPOS freehand drawing — a pen + marker you can scribble straight onto a
// problem statement (Codeforces problem / CF blog / CSES task). The ink is
// painted on a <canvas> laid absolutely over the statement container, so it
// scrolls WITH the page and stays glued to the spot you drew on. The canvas is
// pointer-events:none whenever no tool is armed, so links/buttons on the page
// stay fully clickable; arming a tool flips it to capture strokes.
//
// One floating launcher (#cpos-draw-bar, bottom-right) starts collapsed as a
// single pen icon; clicking it expands a tray with three tools: a freehand Pen,
// an Eraser, and a Marker that highlights SELECTED statement text (driven by the
// annotate engine, self.CPOS_ANNOTATE — same colours-on-selection behaviour the
// old standalone marker bar had). Strokes persist per-problem in
// chrome.storage.local keyed by URL path. Gated on feature "draw"; everything
// injected is removed when off. Additive only — never touches capture/submit.
(function () {
  const C = self.CPOS;
  const T = self.CPOS_THEMES;
  if (!C || !T) return;

  const LAYER_ID = "cpos-draw-layer";
  const BAR_ID = "cpos-draw-bar";
  const STORE_PREFIX = "cpos.draw.";

  // Ink colours — flat, few, matching the marker/notes palette. Pen draws them
  // solid; the marker draws them translucent (alpha from TOOLS, applied once at
  // stroke time so overlapping marker segments don't compound).
  const COLORS = [
    { id: "ink", stroke: "#1b1b2b" }, // near-black ink
    { id: "r", stroke: "#ff5d6c" },   // red
    { id: "b", stroke: "#4d8dff" },   // blue
    { id: "g", stroke: "#33b86b" },   // green
    { id: "y", stroke: "#f0b429" }    // amber
  ];
  const colorById = (id) => COLORS.find((c) => c.id === id) || COLORS[0];

  // Freehand pen nib. The "Marker" tool isn't a canvas nib — it highlights
  // selected statement text through the annotate engine (self.CPOS_ANNOTATE).
  const TOOLS = { pen: { width: 2.4, alpha: 1 } };
  const ERASE_RADIUS = 14;

  // Inline 16px line-icons, same grid/stroke as the popup set for consistency.
  const ICONS = {
    pen: '<path d="m2.8 13.2 1-3.1 6.7-6.7a1.45 1.45 0 0 1 2.05 2.05L5.85 12.2 2.8 13.2Z"/><path d="m9.6 4.4 2 2"/>',
    marker: '<path d="M4 13.4h5.2"/><path d="M6.4 11.2 11 6.6l1.6 1.6-4.6 4.6H6.4v-1.6Z"/><path d="m10.4 7.2 1.3-1.3a1 1 0 0 1 1.4 0l.2.2a1 1 0 0 1 0 1.4l-1.3 1.3Z"/>',
    eraser: '<path d="m4.4 12.4 6.1-6.1a1.3 1.3 0 0 1 1.85 0l1.1 1.1a1.3 1.3 0 0 1 0 1.85l-4 4H6.4l-2-2Z"/><path d="M6.4 13.2h7"/>',
    done: '<path d="m3.4 8.4 3 3 6.2-7"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
  }

  // ---- page scope ---------------------------------------------------------
  // Mirror annotate.js: only the supported statement pages, anchored to a
  // container that's stable across reloads.
  function pageScope() {
    const host = location.hostname;
    const path = location.pathname;
    if (host.endsWith("codeforces.com")) {
      if (/\/problem\//.test(path)) {
        return { container: document.querySelector(".problem-statement") };
      }
      if (/\/blog\/entry\//.test(path)) {
        return { container: document.querySelector(".ttypography") || document.querySelector(".content") };
      }
    }
    if (host.endsWith("cses.fi") && /\/problemset\/task\//.test(path)) {
      return { container: document.querySelector(".content .md") || document.querySelector(".content") };
    }
    return null;
  }

  let scope = null;
  let theme = null;
  let built = false;
  let strokes = [];        // [{ tool, color, size, points: [[x,y], ...] }]
  let activeTool = null;   // null = idle; "pen" | "marker" | "eraser"
  let activeColor = COLORS[0].id;
  let expanded = false;
  let drawing = false;
  let cur = null;          // stroke being drawn
  let canvas = null, ctx = null, bar = null, dpr = 1;

  function storeKey() {
    return STORE_PREFIX + location.hostname + location.pathname;
  }

  // ---- storage ------------------------------------------------------------
  function loadStrokes() {
    return new Promise((res) => {
      try {
        chrome.storage.local.get([storeKey()], (v) => {
          const arr = (v && v[storeKey()]) || [];
          res(Array.isArray(arr) ? arr : []);
        });
      } catch (e) { res([]); }
    });
  }
  function saveStrokes() {
    try {
      const data = strokes.map((s) => ({ tool: s.tool, color: s.color, size: s.size, points: s.points }));
      chrome.storage.local.set({ [storeKey()]: data });
    } catch (e) { /* ignore */ }
  }

  // ---- canvas geometry ----------------------------------------------------
  // Sit the canvas exactly over the statement in document (not viewport) coords,
  // so it scrolls with the page. Stroke points are container-relative px.
  // ponytail: container-relative px (stable while scrolling + per-reload at the
  // same layout); drifts if the statement is re-flowed to a very different
  // width — store normalised coords if that ever matters.
  function layoutCanvas() {
    if (!canvas || !scope || !scope.container) return;
    const r = scope.container.getBoundingClientRect();
    const cssW = Math.max(1, r.width), cssH = Math.max(1, r.height);
    dpr = window.devicePixelRatio || 1;
    canvas.style.left = (r.left + window.scrollX) + "px";
    canvas.style.top = (r.top + window.scrollY) + "px";
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    redraw();
  }

  // Measure against the canvas's OWN box, not the container's — they're meant to
  // coincide, but any positioning offset between them would otherwise show up as
  // a constant gap between the cursor and the ink. clientX/Y are viewport coords
  // and the canvas rect tracks scroll, so this stays exact while scrolling.
  function pointFor(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // ---- rendering ----------------------------------------------------------
  function drawStroke(s) {
    if (!s.points.length) return;
    const t = TOOLS[s.tool] || TOOLS.pen;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = t.alpha;
    ctx.strokeStyle = colorById(s.color).stroke;
    ctx.lineWidth = s.size || t.width;
    ctx.beginPath();
    ctx.moveTo(s.points[0][0], s.points[0][1]);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0], s.points[i][1]);
    if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.01, s.points[0][1] + 0.01); // a tap = a dot
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Full clear+repaint each frame. Required for the translucent marker (drawing
  // a half-finished stroke incrementally would compound its alpha); also the
  // simplest correct thing. ponytail: O(strokes) per move — fine at annotation
  // scale; redraw only a dirty rect if a page ever accrues thousands of strokes.
  function redraw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(s);
    if (cur) drawStroke(cur);
  }

  // ---- pointer drawing ----------------------------------------------------
  function eraseAt(p) {
    const before = strokes.length;
    strokes = strokes.filter((s) =>
      !s.points.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) <= ERASE_RADIUS + (s.size || 2) / 2));
    if (strokes.length !== before) redraw();
  }
  // ponytail: stroke-level erase (removes a whole stroke if the eraser touches
  // it) — predictable and one filter; swap for destination-out if partial
  // rub-out is ever asked for.

  function onDown(e) {
    if (activeTool !== "pen" && activeTool !== "eraser") return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
    drawing = true;
    const p = pointFor(e);
    if (activeTool === "eraser") { eraseAt(p); return; }
    cur = { tool: "pen", color: activeColor, size: TOOLS.pen.width, points: [p] };
    redraw();
  }
  function onMove(e) {
    if (!drawing) return;
    const p = pointFor(e);
    if (activeTool === "eraser") { eraseAt(p); return; }
    if (!cur) return;
    cur.points.push(p);
    redraw();
  }
  function onUp() {
    if (!drawing) return;
    drawing = false;
    if (activeTool === "eraser") { saveStrokes(); return; }
    if (cur && cur.points.length) strokes.push(cur);
    cur = null;
    redraw();
    saveStrokes();
  }

  // ---- toolbar ------------------------------------------------------------
  function iconBtn(name, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cpos-dr-btn";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = svg(name);
    return b;
  }
  function sep() {
    const s = document.createElement("span");
    s.className = "cpos-dr-sep";
    return s;
  }

  function setTool(t) {
    activeTool = t;
    // Only the freehand tools capture the canvas; "marker" must leave the page
    // selectable so the user can highlight the text underneath it.
    const armed = t === "pen" || t === "eraser";
    if (canvas) {
      canvas.style.pointerEvents = armed ? "auto" : "none";
      canvas.classList.toggle("cpos-dr-drawing", armed);
    }
    renderBar();
  }

  // Ink swatches for the freehand pen.
  function penSwatches() {
    COLORS.forEach((c) => {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "cpos-dr-swatch";
      sw.title = "Ink colour";
      sw.style.backgroundColor = c.stroke;
      sw.setAttribute("aria-pressed", c.id === activeColor ? "true" : "false");
      sw.addEventListener("click", () => {
        activeColor = c.id;
        if (activeTool !== "pen") setTool("pen"); // picking a colour arms the pen
        else renderBar();
      });
      bar.appendChild(sw);
    });
  }

  // Marker swatches highlight the SELECTED statement text via the annotate
  // engine — pick a colour and it paints whatever is selected.
  function markerSwatches() {
    const AN = self.CPOS_ANNOTATE;
    if (!AN || !AN.isReady()) {
      const note = document.createElement("span");
      note.className = "cpos-dr-hint";
      note.textContent = "highlighter loading…";
      bar.appendChild(note);
      return;
    }
    AN.COLORS.forEach((c) => {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "cpos-dr-swatch";
      sw.title = "Highlight selected text";
      sw.style.backgroundColor = c.fill;
      sw.setAttribute("aria-pressed", c.id === AN.getActiveColor() ? "true" : "false");
      sw.addEventListener("click", () => {
        AN.setActiveColor(c.id);
        AN.applySelection();
        renderBar();
      });
      bar.appendChild(sw);
    });
    const hint = document.createElement("span");
    hint.className = "cpos-dr-hint";
    hint.textContent = "select text, then pick a colour";
    bar.appendChild(hint);
  }

  function clearAll() {
    if (!strokes.length) return;
    if (!window.confirm("Clear all drawings on this problem?")) return;
    strokes = [];
    redraw();
    saveStrokes();
  }

  function renderBar() {
    if (!bar) return;
    bar.innerHTML = "";
    bar.classList.toggle("cpos-dr-open", expanded);

    if (!expanded) {
      const launch = iconBtn("pen", "Draw on this problem");
      launch.classList.add("cpos-dr-launch");
      launch.addEventListener("click", () => { expanded = true; renderBar(); });
      bar.appendChild(launch);
      return;
    }

    [["pen", "Pen"], ["marker", "Marker"], ["eraser", "Eraser"]].forEach(([id, label]) => {
      const b = iconBtn(id, label);
      b.classList.toggle("cpos-dr-on", activeTool === id);
      b.addEventListener("click", () => setTool(activeTool === id ? null : id));
      bar.appendChild(b);
    });

    bar.appendChild(sep());

    // Colours mean different things per tool: ink for the pen, highlight for the
    // text marker.
    if (activeTool === "marker") markerSwatches();
    else penSwatches();

    bar.appendChild(sep());

    // Clear only makes sense for freehand ink (highlights are removed per-mark
    // via their own click popover), so hide it in marker mode.
    if (activeTool !== "marker") {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "cpos-dr-btn cpos-dr-danger";
      clear.title = "Erase all freehand drawings";
      clear.textContent = "Clear";
      clear.addEventListener("click", clearAll);
      bar.appendChild(clear);
    }

    const done = iconBtn("done", "Done");
    done.addEventListener("click", () => { setTool(null); expanded = false; renderBar(); });
    bar.appendChild(done);
  }

  // ---- theme --------------------------------------------------------------
  async function ensureTheme() {
    theme = T.get(await C.activeThemeId());
  }
  function restyle() {
    if (!bar || !theme) return;
    bar.style.setProperty("--cpos-dr-panel", theme["--panel"]);
    bar.style.setProperty("--cpos-dr-bg", theme["--bg"]);
    bar.style.setProperty("--cpos-dr-fg", theme["--fg"]);
    bar.style.setProperty("--cpos-dr-dim", theme["--dim"]);
    bar.style.setProperty("--cpos-dr-border", theme["--border"]);
    bar.style.setProperty("--cpos-dr-accent", theme["--accent"]);
    bar.style.setProperty("--cpos-dr-bad", theme["--bad"]);
  }

  // ---- resize -------------------------------------------------------------
  let resizeRAF = 0;
  function onResize() {
    if (resizeRAF) return;
    resizeRAF = requestAnimationFrame(() => { resizeRAF = 0; layoutCanvas(); });
  }

  // ---- build / teardown ---------------------------------------------------
  function buildLayer() {
    canvas = document.createElement("canvas");
    canvas.id = LAYER_ID;
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
  }
  function buildBar() {
    bar = document.createElement("div");
    bar.id = BAR_ID;
    document.body.appendChild(bar);
    renderBar();
  }

  async function build() {
    if (built) return;
    scope = pageScope();
    if (!scope || !scope.container) return;
    built = true;
    await ensureTheme();
    const stored = await loadStrokes();
    strokes = stored.map((s) => ({
      tool: s.tool || "pen",
      color: s.color || "ink",
      size: s.size,
      points: Array.isArray(s.points) ? s.points : []
    }));
    buildLayer();
    buildBar();
    window.addEventListener("resize", onResize);
    layoutCanvas();
    restyle();
  }

  function teardown() {
    if (!built) return;
    built = false;
    window.removeEventListener("resize", onResize);
    if (resizeRAF) { cancelAnimationFrame(resizeRAF); resizeRAF = 0; }
    canvas?.remove(); canvas = null; ctx = null;
    bar?.remove(); bar = null;
    strokes = []; activeTool = null; expanded = false; drawing = false; cur = null;
  }

  // ---- lifecycle ----------------------------------------------------------
  async function sync() {
    const on = await C.feature("draw");
    if (on) await build();
    else teardown();
  }

  C.onChange((changes) => {
    if (changes[C.KEYS.FEATURES]) sync();
    else { ensureTheme().then(restyle); }
  });

  if (document.body) sync();
  else document.addEventListener("DOMContentLoaded", () => sync());
})();
