(function () {
  const captions = {
    dashboard: "Rating, streak, progress, and what to solve next.",
    problems: "Browse the full catalog — search, filter, open. No Codeforces tab needed.",
    contests: "Upcoming and live Codeforces contests with countdowns.",
    analytics: "Rating graph, topic breakdown, and activity heatmap.",
    recommend: "30 unsolved problems picked for your weak tags.",
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
