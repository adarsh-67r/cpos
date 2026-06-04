(function () {
  const captions = {
    dashboard: "Rating, streak, progress, and what to solve next.",
    problems: "Browse the full catalog — search, filter, open. No Codeforces tab needed.",
    contests: "Upcoming and live Codeforces contests with countdowns.",
    analytics: "Rating graph, topic breakdown, and activity heatmap.",
    recommend: "Unsolved problems picked around your rating and weak tags.",
  };

  const labels = {
    dashboard: "Dashboard",
    problems: "Problems",
    contests: "Contests",
    analytics: "Analytics",
    recommend: "Recommend",
  };

  const loaded = new Set();
  const captionEl = document.getElementById("caption");
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".frame .panel");

  function injectScreen(panel) {
    const id = panel.dataset.screen;
    if (!id || loaded.has(id)) return;

    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.srcset = `img/${id}.webp`;
    source.type = "image/webp";

    const img = document.createElement("img");
    img.src = `img/${id}.png`;
    img.alt = labels[id] || id;
    img.width = 1800;
    img.height = 1166;
    img.decoding = "async";
    if (id === "dashboard") img.fetchPriority = "high";

    picture.append(source, img);
    panel.append(picture);
    panel.classList.remove("loading");
    loaded.add(id);
  }

  function showScreen(id) {
    panels.forEach((p) => {
      const on = p.dataset.screen === id;
      p.classList.toggle("active", on);
      if (on && !loaded.has(id)) {
        p.classList.add("loading");
        injectScreen(p);
      }
    });
  }

  // Load dashboard immediately; prefetch next tab after idle.
  injectScreen(document.getElementById("screen-dashboard"));

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.screen;
      if (tab.classList.contains("active")) return;

      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      showScreen(id);

      if (captionEl) {
        captionEl.classList.add("fade");
        setTimeout(() => {
          captionEl.textContent = captions[id] || "";
          captionEl.classList.remove("fade");
        }, 120);
      }
    });
  });

  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => injectScreen(document.getElementById("screen-problems")));
  }

  const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
  const heroDots = Array.from(document.querySelectorAll("[data-hero-slide]"));
  const heroTitle = document.getElementById("hero-shot-title");
  let heroIndex = 0;
  let heroTimer = null;

  function showHeroSlide(index) {
    if (!heroSlides.length) return;
    heroIndex = (index + heroSlides.length) % heroSlides.length;
    heroSlides.forEach((slide, i) => {
      const active = i === heroIndex;
      slide.classList.toggle("active", active);
      if (active && heroTitle) heroTitle.textContent = slide.dataset.title || "cpos";
    });
    heroDots.forEach((dot, i) => dot.classList.toggle("active", i === heroIndex));
  }

  function startHeroCarousel() {
    if (heroSlides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    heroTimer = window.setInterval(() => showHeroSlide(heroIndex + 1), 4200);
  }

  heroDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      if (heroTimer) window.clearInterval(heroTimer);
      showHeroSlide(Number(dot.dataset.heroSlide || 0));
      startHeroCarousel();
    });
  });

  showHeroSlide(0);
  startHeroCarousel();

  const themeToggle = document.querySelector(".theme-toggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("cpos-theme", theme);
    } catch {
      // Theme still works for the current page even if persistence is blocked.
    }
    if (themeMeta) themeMeta.setAttribute("content", theme === "light" ? "#f7f9fb" : "#08090b");
    if (themeToggle) {
      themeToggle.setAttribute(
        "aria-label",
        theme === "light" ? "Switch to dark theme" : "Switch to light theme"
      );
    }
  }

  if (themeToggle) {
    setTheme(document.documentElement.dataset.theme || "dark");
    themeToggle.addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
    });
  }

  const liveSources = {
    repo: "https://api.github.com/repos/Soham109/cpos",
    latestRelease: "https://api.github.com/repos/Soham109/cpos/releases/latest",
    vscodeDownloads: "https://badgen.net/vs-marketplace/d/sohamaggarwal.cpos-vscode",
    redditPost: "https://www.reddit.com/r/codeforces/comments/1tvjxub/i_built_a_better_cph/.json?raw_json=1",
  };

  function setLiveStat(name, value) {
    if (!value) return;
    document.querySelectorAll(`[data-live-stat="${name}"]`).forEach((el) => {
      el.textContent = value;
    });
  }

  function formatCompact(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    if (n >= 1000000) return `${trimDecimal(n / 1000000)}m`;
    if (n >= 1000) return `${trimDecimal(n / 1000)}k`;
    return String(Math.round(n));
  }

  function trimDecimal(value) {
    return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
  }

  function firstNumber(text) {
    const match = String(text || "").match(/[\d,.]+/);
    return match ? Number(match[0].replace(/,/g, "")) : NaN;
  }

  function badgeNumber(svgText) {
    const labelMatch = String(svgText || "").match(/aria-label="[^"]*?:\s*([\d,.]+)/i);
    return labelMatch ? Number(labelMatch[1].replace(/,/g, "")) : firstNumber(svgText);
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async function loadLiveStats() {
    fetchJson(liveSources.latestRelease)
      .then((release) => setLiveStat("release", release.tag_name || release.name))
      .catch(() => {});

    fetchJson(liveSources.repo)
      .then((repo) => {
        const stars = formatCompact(repo.stargazers_count);
        if (stars) setLiveStat("github-stars", stars);
      })
      .catch(() => {});

    fetchText(liveSources.vscodeDownloads)
      .then((badgeSvg) => {
        const downloads = badgeNumber(badgeSvg);
        const formatted = formatCompact(downloads);
        if (formatted) setLiveStat("vscode-downloads", formatted);
      })
      .catch(() => {});

    fetchJson(liveSources.redditPost)
      .then((listing) => {
        const score = listing?.[0]?.data?.children?.[0]?.data?.score;
        const upvotes = Math.max(Number(score) || 0, 150);
        const formatted = `${formatCompact(upvotes)}+ upvotes`;
        setLiveStat("reddit-upvotes", formatted);
        setLiveStat("reddit-summary", `18k+ views · ${formatted}`);
      })
      .catch(() => {});
  }

  loadLiveStats();

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cmd = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(cmd);
        const orig = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch {
        window.prompt("Run:", cmd);
      }
    });
  });
})();
