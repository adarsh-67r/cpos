// CPOS contest reminders — background module. Loaded into the MV3 service worker
// via importScripts('cpos-contests.js') (Chrome) or as a background.scripts entry
// (Firefox). It owns its own chrome.alarms / chrome.notifications / onMessage
// listeners and never touches the submit-pickup logic in background.js.
//
// Local-first: the only network call is the public Codeforces contest.list API.
// Everything is cached in chrome.storage.local under the "cpos.contests.*" keys.
(function () {
  // This file is only ever loaded in a background context — the MV3 service
  // worker on Chrome (via importScripts) and the background page on Firefox (via
  // background.scripts). Both expose chrome.alarms + chrome.notifications, which
  // content scripts do not, so this also no-ops harmlessly anywhere else. (We
  // deliberately avoid a ServiceWorkerGlobalScope check, which would be false on
  // Firefox's background page and would disable the feature there.)
  if (typeof chrome === "undefined" || !chrome.alarms || !chrome.notifications || !chrome.storage || !chrome.storage.local) return;

  const FEATURE_KEY = "contestReminders";
  const FEATURES_STORE_KEY = "cpos.features"; // shared CPOS feature map
  const K = {
    LIST: "cpos.contests.list", // { contests:[...], fetchedAt:ms }
    REMINDERS: "cpos.contests.reminders", // { [contestId]: true }
    LEAD: "cpos.contests.leadMinutes" // number
  };
  const DEFAULT_LEAD = 30;
  const REFRESH_ALARM = "cpos.contests.refresh";
  const REFRESH_PERIOD_MIN = 60;
  const REMINDER_PREFIX = "cpos.contests.remind."; // + contestId
  const CF_URL = "https://codeforces.com/api/contest.list?gym=false";
  const ICON = "icons/icon128.png";
  const STALE_MS = 6 * 60 * 60 * 1000; // serve cache up to 6h before forcing refetch

  const store = chrome.storage.local;
  const get = (keys) => new Promise((res) => store.get(keys, (v) => res(v || {})));
  const set = (obj) => new Promise((res) => store.set(obj, () => res()));

  // ---- feature flag (mirror cpos-config defaults; default ON) ---------------
  async function featureEnabled() {
    const raw = await get([FEATURES_STORE_KEY]);
    const f = raw[FEATURES_STORE_KEY] || {};
    return f[FEATURE_KEY] !== false; // default on
  }

  // ---- fetch + cache --------------------------------------------------------
  async function getCachedList() {
    const raw = await get([K.LIST]);
    return raw[K.LIST] || null;
  }

  // Normalize to the small shape the popup needs; keep only upcoming contests.
  function pickUpcoming(apiResult) {
    if (!Array.isArray(apiResult)) return [];
    return apiResult
      .filter(
        (c) =>
          c &&
          c.phase === "BEFORE" &&
          typeof c.startTimeSeconds === "number" &&
          typeof c.durationSeconds === "number"
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        startTimeSeconds: c.startTimeSeconds,
        durationSeconds: c.durationSeconds
      }))
      .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
      .slice(0, 30);
  }

  // Returns { contests, fetchedAt, fromCache }. On API failure, falls back to
  // whatever is cached so the UI is never empty just because we're offline.
  async function refreshList(force) {
    const cached = await getCachedList();
    const now = Date.now();
    if (!force && cached && now - (cached.fetchedAt || 0) < STALE_MS) {
      return { ...cached, fromCache: true };
    }
    try {
      const res = await fetch(CF_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json.status !== "OK") throw new Error(json.comment || "CF status not OK");
      const contests = pickUpcoming(json.result);
      const payload = { contests, fetchedAt: now };
      await set({ [K.LIST]: payload });
      await rescheduleAll();
      return { ...payload, fromCache: false };
    } catch (e) {
      // Network/API failure — keep the cache, surface what we have.
      if (cached) return { ...cached, fromCache: true, error: String(e) };
      return { contests: [], fetchedAt: 0, fromCache: true, error: String(e) };
    }
  }

  // ---- reminder scheduling --------------------------------------------------
  async function getReminders() {
    const raw = await get([K.REMINDERS]);
    return raw[K.REMINDERS] || {};
  }
  async function getLead() {
    const raw = await get([K.LEAD]);
    const n = Number(raw[K.LEAD]);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_LEAD;
  }

  // Clear every reminder alarm we own, then (re)create the ones still valid.
  async function rescheduleAll() {
    if (!chrome.alarms) return;
    // Clear existing reminder alarms (leave REFRESH_ALARM + other scripts alone).
    const all = await new Promise((res) => chrome.alarms.getAll((a) => res(a || [])));
    await Promise.all(
      all
        .filter((a) => a.name.startsWith(REMINDER_PREFIX))
        .map((a) => new Promise((res) => chrome.alarms.clear(a.name, () => res())))
    );

    if (!(await featureEnabled())) return; // no scheduling while feature is off

    const [list, reminders, lead] = await Promise.all([
      getCachedList(),
      getReminders(),
      getLead()
    ]);
    const contests = (list && list.contests) || [];
    const now = Date.now();
    for (const c of contests) {
      if (!reminders[c.id]) continue;
      const fireAt = c.startTimeSeconds * 1000 - lead * 60 * 1000;
      if (fireAt <= now) continue; // too late to remind
      chrome.alarms.create(REMINDER_PREFIX + c.id, { when: fireAt });
    }
  }

  function fmtLocal(startSeconds) {
    try {
      return new Date(startSeconds * 1000).toLocaleString();
    } catch {
      return "";
    }
  }

  async function fireReminder(contestId) {
    if (!chrome.notifications) return;
    if (!(await featureEnabled())) return;
    const list = await getCachedList();
    const contest = ((list && list.contests) || []).find((c) => String(c.id) === String(contestId));
    if (!contest) return;
    const lead = await getLead();
    chrome.notifications.create(REMINDER_PREFIX + contestId, {
      type: "basic",
      iconUrl: chrome.runtime.getURL(ICON),
      title: "Contest starting soon",
      message: `${contest.name}\nStarts ${fmtLocal(contest.startTimeSeconds)} (in ~${lead} min)`,
      priority: 2
    });
  }

  // ---- listeners (our own; coexist with background.js) ----------------------
  if (chrome.alarms) {
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MIN });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (!alarm || !alarm.name) return;
      if (alarm.name === REFRESH_ALARM) {
        void refreshList(true);
      } else if (alarm.name.startsWith(REMINDER_PREFIX)) {
        void fireReminder(alarm.name.slice(REMINDER_PREFIX.length));
      }
      // Any other alarm name belongs to another script — ignore it.
    });
  }

  // Reschedule whenever reminders / lead / feature flag change.
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[K.REMINDERS] || changes[K.LEAD] || changes[FEATURES_STORE_KEY]) {
        void rescheduleAll();
      }
    });
  }

  // Open the contest on click.
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener((notifId) => {
      if (!notifId || !notifId.startsWith(REMINDER_PREFIX)) return;
      const id = notifId.slice(REMINDER_PREFIX.length);
      if (chrome.tabs) chrome.tabs.create({ url: `https://codeforces.com/contest/${id}` });
      chrome.notifications.clear(notifId);
    });
  }

  // Popup commands. Only handle our own message types; return true only when we
  // intend to respond asynchronously so other listeners keep working.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return; // not ours
    if (msg.type === "cpos-contests-refresh") {
      refreshList(msg.force === true).then((r) => sendResponse({ ok: true, ...r }));
      return true;
    }
    if (msg.type === "cpos-contests-get") {
      getCachedList().then((list) =>
        sendResponse({ ok: true, contests: (list && list.contests) || [], fetchedAt: (list && list.fetchedAt) || 0 })
      );
      return true;
    }
    // Unknown type — not ours; let other listeners handle it.
  });

  // Warm the cache + schedule on load and on the usual lifecycle events.
  void refreshList(false);
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => void refreshList(true));
  if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(() => void refreshList(true));
})();
