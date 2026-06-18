// CPOS marker-pen + notes — a lightweight text markup-highlighter for problem
// statements (Codeforces problem pages, CF blog entries, CSES task pages). The
// user selects text and applies one of a few marker colours; clicking an
// existing highlight lets them recolour it, remove it, or attach a short note
// (shown as a tooltip; a small dot marks notes). Highlights persist per-problem
// in chrome.storage.local keyed by URL path and are re-anchored on reload using
// character offsets within a stable container (tolerant: a mark that can't be
// resolved is skipped, never throws). Gated on feature "annotate"; the floating
// toolbar (#cpos-annotate-bar) and all injected spans are removed when off.
// Additive only — never touches capture/submit, never breaks selection/copy.
(function () {
  const C = self.CPOS;
  const T = self.CPOS_THEMES;
  if (!C || !T) return;

  const MARK_CLASS = "cpos-annotate";
  const NOTE_FLAG = "cpos-annotate-hasnote";
  const BAR_ID = "cpos-annotate-bar";
  const POP_ID = "cpos-annotate-pop";
  const TIP_ID = "cpos-annotate-tip";
  const STORE_PREFIX = "cpos.annotate.";

  // Four flat marker colours (translucent so underlying text stays readable).
  const COLORS = [
    { id: "y", fill: "rgba(240, 196, 96, 0.40)" },   // amber
    { id: "g", fill: "rgba(126, 231, 135, 0.34)" },  // green
    { id: "b", fill: "rgba(122, 162, 247, 0.36)" },  // blue
    { id: "p", fill: "rgba(183, 148, 255, 0.38)" }   // purple/pink
  ];
  const colorById = (id) => COLORS.find((c) => c.id === id) || COLORS[0];

  // ---- page scope ---------------------------------------------------------
  // Only build on the supported page kinds, and pick the container we anchor
  // offsets against (must be stable across reloads).
  function pageScope() {
    const host = location.hostname;
    const path = location.pathname;
    if (host.endsWith("codeforces.com")) {
      if (/\/problem\//.test(path)) {
        return { kind: "cf-problem", container: document.querySelector(".problem-statement") };
      }
      if (/\/blog\/entry\//.test(path)) {
        return { kind: "cf-blog", container: document.querySelector(".ttypography") || document.querySelector(".content") };
      }
    }
    if (host.endsWith("cses.fi") && /\/problemset\/task\//.test(path)) {
      return { kind: "cses-task", container: document.querySelector(".content .md") || document.querySelector(".content") };
    }
    return null;
  }

  let scope = null;
  let theme = null;
  let marks = [];        // [{ id, color, note, start, end }]
  let nextId = 1;
  let built = false;
  let lastRange = null;

  function storeKey() {
    return STORE_PREFIX + location.hostname + location.pathname;
  }

  // ---- storage ------------------------------------------------------------
  function loadMarks() {
    return new Promise((res) => {
      try {
        chrome.storage.local.get([storeKey()], (v) => {
          const arr = (v && v[storeKey()]) || [];
          res(Array.isArray(arr) ? arr : []);
        });
      } catch (e) { res([]); }
    });
  }
  function saveMarks() {
    try {
      const data = marks.map((m) => ({ id: m.id, color: m.color, note: m.note || "", start: m.start, end: m.end }));
      chrome.storage.local.set({ [storeKey()]: data });
    } catch (e) { /* ignore */ }
  }

  // ---- offset <-> DOM mapping --------------------------------------------
  // We measure character offsets over the visible text of the container by
  // walking text nodes in document order, skipping our own toolbar/popover and
  // skipping <script>/<style>. This is tolerant: minor DOM changes shift offsets
  // a little, and unresolved ranges are simply skipped.
  function isSkippable(node) {
    let el = node.parentElement;
    while (el) {
      if (el.id === BAR_ID || el.id === POP_ID || el.id === TIP_ID) return true;
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
      el = el.parentElement;
    }
    return false;
  }

  function textNodes() {
    const out = [];
    if (!scope || !scope.container) return out;
    const walker = document.createTreeWalker(scope.container, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        if (isSkippable(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  // Map a [start,end) char offset to a DOM Range over container text nodes.
  function offsetsToRange(start, end) {
    if (end <= start) return null;
    const nodes = textNodes();
    let pos = 0, range = null, startNode = null, startOff = 0;
    for (const node of nodes) {
      const len = node.nodeValue.length;
      const nodeStart = pos, nodeEnd = pos + len;
      if (startNode === null && start < nodeEnd) {
        startNode = node;
        startOff = start - nodeStart;
      }
      if (startNode !== null && end <= nodeEnd) {
        range = document.createRange();
        try {
          range.setStart(startNode, Math.max(0, startOff));
          range.setEnd(node, Math.max(0, end - nodeStart));
        } catch (e) { return null; }
        break;
      }
      pos = nodeEnd;
    }
    return range;
  }

  // Map a live selection Range to char offsets within the container. We measure
  // the length of the (skippable-filtered) text from the container start up to
  // each selection boundary by reusing the same text-node walk, so offsets are
  // consistent with offsetsToRange/paintMark. Boundaries that fall on element
  // nodes are resolved to the text length preceding the boundary's child index.
  function boundaryOffset(nodes, boundaryNode, boundaryOffset) {
    // Returns the cumulative skippable-filtered text length at the boundary, or
    // -1 if the boundary isn't covered by our walked text nodes.
    if (boundaryNode.nodeType === Node.TEXT_NODE) {
      let pos = 0;
      for (const node of nodes) {
        if (node === boundaryNode) return pos + Math.min(boundaryOffset, node.nodeValue.length);
        pos += node.nodeValue.length;
      }
      return -1;
    }
    // Element boundary: it sits before child at index `boundaryOffset`. Find the
    // first walked text node at/after that DOM point and return text length up to
    // it; if none, it's at the end → total length.
    const refNode = boundaryNode.childNodes[boundaryOffset] || null;
    let pos = 0;
    for (const node of nodes) {
      if (refNode && (node === refNode || refNode.contains(node) ||
          (node.compareDocumentPosition(refNode) & Node.DOCUMENT_POSITION_FOLLOWING))) {
        return pos;
      }
      pos += node.nodeValue.length;
    }
    return pos;
  }

  function rangeToOffsets(range) {
    if (!scope || !scope.container) return null;
    if (!scope.container.contains(range.commonAncestorContainer)) return null;
    const nodes = textNodes();
    const start = boundaryOffset(nodes, range.startContainer, range.startOffset);
    const end = boundaryOffset(nodes, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end <= start) return null;
    return { start, end };
  }

  // ---- applying marks to the DOM -----------------------------------------
  // Wrap each text node that intersects [start,end) in a .cpos-annotate span.
  // Returns the list of created spans (so we can restyle / unwrap later).
  function paintMark(mark) {
    const nodes = textNodes();
    let pos = 0;
    const created = [];
    for (const node of nodes) {
      const len = node.nodeValue.length;
      const nodeStart = pos, nodeEnd = pos + len;
      pos = nodeEnd;
      if (nodeEnd <= mark.start || nodeStart >= mark.end) continue;
      const from = Math.max(0, mark.start - nodeStart);
      const to = Math.min(len, mark.end - nodeStart);
      if (to <= from) continue;
      let target = node;
      // Split so the span wraps exactly the intersecting slice.
      if (from > 0) target = target.splitText(from);
      if (to - from < target.nodeValue.length) target.splitText(to - from);
      const span = document.createElement("span");
      span.className = MARK_CLASS;
      span.setAttribute("data-cpos-an-id", String(mark.id));
      const col = colorById(mark.color);
      span.style.backgroundColor = col.fill;
      if (mark.note) span.classList.add(NOTE_FLAG);
      target.parentNode.insertBefore(span, target);
      span.appendChild(target);
      created.push(span);
    }
    return created;
  }

  function spansFor(id) {
    return [...document.querySelectorAll('.' + MARK_CLASS + '[data-cpos-an-id="' + id + '"]')];
  }

  function unwrapSpan(span) {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  }

  function removeAllSpans() {
    [...document.querySelectorAll('.' + MARK_CLASS)].forEach(unwrapSpan);
  }

  // Re-anchor every stored mark. Painting one mark splits text nodes and shifts
  // later offsets, so we paint in descending start order to keep offsets valid.
  function repaintAll() {
    removeAllSpans();
    const ordered = [...marks].sort((a, b) => b.start - a.start);
    for (const m of ordered) {
      try { paintMark(m); } catch (e) { /* skip unresolved */ }
    }
  }

  // ---- theme --------------------------------------------------------------
  async function ensureTheme() {
    theme = T.get(await C.activeThemeId());
  }
  function applyThemeVars(el) {
    if (!el || !theme) return;
    el.style.setProperty("--cpos-an-bg", theme["--bg"]);
    el.style.setProperty("--cpos-an-panel", theme["--panel"]);
    el.style.setProperty("--cpos-an-fg", theme["--fg"]);
    el.style.setProperty("--cpos-an-dim", theme["--dim"]);
    el.style.setProperty("--cpos-an-border", theme["--border"]);
    el.style.setProperty("--cpos-an-accent", theme["--accent"]);
    el.style.setProperty("--cpos-an-bad", theme["--bad"]);
  }
  function restyle() {
    [BAR_ID, POP_ID, TIP_ID].forEach((id) => {
      const el = document.getElementById(id);
      if (el) applyThemeVars(el);
    });
    // note-dot colour rides on --cpos-an-accent set on the span's container; set
    // it on each span too for correctness when site-theme strips inheritance.
    document.querySelectorAll('.' + MARK_CLASS).forEach((s) => {
      if (theme) {
        s.style.setProperty("--cpos-an-accent", theme["--accent"]);
        s.style.setProperty("--cpos-an-bg", theme["--bg"]);
      }
    });
  }

  // ---- toolbar ------------------------------------------------------------
  let activeColor = COLORS[0].id;

  function buildBar() {
    if (document.getElementById(BAR_ID)) return;
    const bar = document.createElement("div");
    bar.id = BAR_ID;

    const label = document.createElement("span");
    label.className = "cpos-an-label";
    label.textContent = "Marker";
    bar.appendChild(label);

    COLORS.forEach((c) => {
      const sw = document.createElement("button");
      sw.className = "cpos-an-swatch";
      sw.type = "button";
      sw.title = "Marker colour";
      sw.style.backgroundColor = c.fill;
      sw.setAttribute("aria-pressed", c.id === activeColor ? "true" : "false");
      sw.addEventListener("click", () => {
        activeColor = c.id;
        bar.querySelectorAll(".cpos-an-swatch").forEach((b) =>
          b.setAttribute("aria-pressed", b === sw ? "true" : "false"));
        applySelection();
      });
      bar.appendChild(sw);
    });

    const sep = document.createElement("span");
    sep.className = "cpos-an-sep";
    bar.appendChild(sep);

    const markBtn = document.createElement("button");
    markBtn.className = "cpos-an-btn cpos-an-primary";
    markBtn.type = "button";
    markBtn.textContent = "Mark selection";
    markBtn.addEventListener("click", applySelection);
    bar.appendChild(markBtn);

    const hint = document.createElement("span");
    hint.className = "cpos-an-hint";
    hint.textContent = "select text first";
    bar.appendChild(hint);

    applyThemeVars(bar);
    document.body.appendChild(bar);
  }

  function removeBar() {
    document.getElementById(BAR_ID)?.remove();
  }

  // ---- create a highlight from the current selection ----------------------
  function applySelection() {
    const sel = window.getSelection();
    const range = sel && !sel.isCollapsed && sel.rangeCount > 0 ? sel.getRangeAt(0) : lastRange;
    if (!range) return;
    if (range.collapsed) return;
    const off = rangeToOffsets(range);
    if (!off) return;
    // Avoid duplicate exact overlaps: if a mark already covers this exact span,
    // just recolour it.
    const existing = marks.find((m) => m.start === off.start && m.end === off.end);
    if (existing) {
      existing.color = activeColor;
    } else {
      marks.push({ id: nextId++, color: activeColor, note: "", start: off.start, end: off.end });
    }
    sel.removeAllRanges();
    repaintAll();
    restyle();
    saveMarks();
  }

  function rememberSelection() {
    if (!built) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!scope || !scope.container || !scope.container.contains(range.commonAncestorContainer)) return;
    lastRange = range.cloneRange();
  }

  // ---- popover (recolour / note / remove) ---------------------------------
  let popMarkId = null;
  function closePopover() {
    document.getElementById(POP_ID)?.remove();
    popMarkId = null;
  }

  function openPopover(id, x, y) {
    closePopover();
    const mark = marks.find((m) => m.id === id);
    if (!mark) return;
    popMarkId = id;

    const pop = document.createElement("div");
    pop.id = POP_ID;

    // colour row
    const row = document.createElement("div");
    row.className = "cpos-an-row";
    COLORS.forEach((c) => {
      const sw = document.createElement("button");
      sw.className = "cpos-an-swatch";
      sw.type = "button";
      sw.style.backgroundColor = c.fill;
      sw.setAttribute("aria-pressed", c.id === mark.color ? "true" : "false");
      sw.addEventListener("click", () => {
        mark.color = c.id;
        row.querySelectorAll(".cpos-an-swatch").forEach((b) =>
          b.setAttribute("aria-pressed", b === sw ? "true" : "false"));
        repaintAll();
        restyle();
        saveMarks();
      });
      row.appendChild(sw);
    });
    pop.appendChild(row);

    // note textarea
    const ta = document.createElement("textarea");
    ta.placeholder = "Add a note…";
    ta.value = mark.note || "";
    pop.appendChild(ta);

    // actions
    const actions = document.createElement("div");
    actions.className = "cpos-an-actions";

    const del = document.createElement("button");
    del.className = "cpos-an-btn cpos-an-danger";
    del.type = "button";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      marks = marks.filter((m) => m.id !== id);
      closePopover();
      repaintAll();
      restyle();
      saveMarks();
    });

    const save = document.createElement("button");
    save.className = "cpos-an-btn cpos-an-primary";
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", () => {
      mark.note = ta.value.trim();
      spansFor(id).forEach((s) => s.classList.toggle(NOTE_FLAG, !!mark.note));
      closePopover();
      restyle();
      saveMarks();
    });

    actions.appendChild(del);
    actions.appendChild(save);
    pop.appendChild(actions);

    applyThemeVars(pop);
    document.body.appendChild(pop);

    // position within viewport
    const w = 240, h = pop.offsetHeight || 160;
    let px = Math.min(x, window.innerWidth - w - 12);
    let py = Math.min(y + 8, window.innerHeight - h - 12);
    px = Math.max(8, px); py = Math.max(8, py);
    pop.style.left = px + "px";
    pop.style.top = py + "px";
    ta.focus();
  }

  // ---- note tooltip on hover ----------------------------------------------
  function showTip(text, x, y) {
    hideTip();
    if (!text) return;
    const tip = document.createElement("div");
    tip.id = TIP_ID;
    tip.textContent = text;
    applyThemeVars(tip);
    document.body.appendChild(tip);
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let px = Math.min(x + 10, window.innerWidth - w - 10);
    let py = y - h - 10;
    if (py < 8) py = y + 16;
    tip.style.left = Math.max(8, px) + "px";
    tip.style.top = py + "px";
  }
  function hideTip() {
    document.getElementById(TIP_ID)?.remove();
  }

  // ---- delegated events ---------------------------------------------------
  function onClick(e) {
    const span = e.target.closest && e.target.closest('.' + MARK_CLASS);
    if (span) {
      e.preventDefault();
      e.stopPropagation();
      const id = parseInt(span.getAttribute("data-cpos-an-id"), 10);
      openPopover(id, e.clientX, e.clientY);
      return;
    }
    // click outside popover closes it
    if (popMarkId != null && !e.target.closest('#' + POP_ID)) closePopover();
  }
  function onMouseOver(e) {
    const span = e.target.closest && e.target.closest('.' + MARK_CLASS);
    if (!span) return;
    const id = parseInt(span.getAttribute("data-cpos-an-id"), 10);
    const mark = marks.find((m) => m.id === id);
    if (mark && mark.note) showTip(mark.note, e.clientX, e.clientY);
  }
  function onMouseOut(e) {
    const span = e.target.closest && e.target.closest('.' + MARK_CLASS);
    if (span) hideTip();
  }

  function bindEvents() {
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("selectionchange", rememberSelection);
  }
  function unbindEvents() {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("selectionchange", rememberSelection);
  }

  // ---- build / teardown ---------------------------------------------------
  async function build() {
    if (built) return;
    scope = pageScope();
    if (!scope || !scope.container) return;
    built = true;
    await ensureTheme();
    const stored = await loadMarks();
    marks = stored.map((m) => ({ id: m.id, color: m.color || "y", note: m.note || "", start: m.start, end: m.end }));
    nextId = marks.reduce((mx, m) => Math.max(mx, m.id + 1), 1);
    buildBar();
    bindEvents();
    repaintAll();
    restyle();
  }

  function teardown() {
    if (!built) return;
    built = false;
    closePopover();
    hideTip();
    unbindEvents();
    removeBar();
    removeAllSpans();
    marks = [];
    lastRange = null;
  }

  // ---- lifecycle ----------------------------------------------------------
  async function sync() {
    const on = await C.feature("annotate");
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
