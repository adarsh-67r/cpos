// CPOS background worker — polls VS Code (:27122) and TUI (:27121) for pending
// submissions, then injects into the logged-in browser tab.

const ENDPOINTS = [
    { name: 'CPOS VS Code', baseUrl: 'http://127.0.0.1:27122' },
    { name: 'CPOS TUI', baseUrl: 'http://127.0.0.1:27121' },
];

const CF_LANGUAGE_IDS = {
    // Legacy fallbacks only — Codeforces reuses/changes ids; label matching is preferred.
    cpp: 54,
    c: 43,
    python: 31,
    pypy: 40,
    java: 60,
    kotlin: 73,
    rust: 75,
    go: 32,
    csharp: 79,
    javascript: 55,
    ruby: 67,
    haskell: 12,
    pascal: 51,
};

let handling = false;

async function fetchPending() {
    const hits = await Promise.all(
        ENDPOINTS.map(async (endpoint) => {
            try {
                const res = await fetch(`${endpoint.baseUrl}/pending-submit`);
                if (!res.ok) return null;
                const data = await res.json();
                if (!data.ok || !data.code) return null;
                return { endpoint, data };
            } catch {
                return null;
            }
        }),
    );
    return hits.find(Boolean) ?? null;
}

async function ack(endpoint) {
    try {
        await fetch(`${endpoint.baseUrl}/pending-submit/consumed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
    } catch {
        /* ignore */
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function urlsMatch(a, b) {
    try {
        const ua = new URL(a);
        const ub = new URL(b);
        return ua.hostname === ub.hostname && ua.pathname === ub.pathname;
    } catch {
        return a === b;
    }
}

// Resolve as soon as the tab has committed to the target URL (navigation started).
// We do NOT wait for "complete" — the injected script waits for its own elements,
// so this shaves the slowest part of the perceived submit latency.
async function waitForUrlCommitted(tabId, url, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const tab = await browser.tabs.get(tabId);
            const current = tab.url || tab.pendingUrl || '';
            if (current && urlsMatch(current, url)) return true;
        } catch {
            return false;
        }
        await sleep(25);
    }
    return false;
}

/** Bring Firefox forward without blocking submit (windows.update can hang on macOS). */
function bringTabToFront(tabId) {
    if (tabId == null) return;
    const task = (async () => {
        const tab = await browser.tabs.get(tabId);
        await browser.tabs.update(tab.id, { active: true });
        if (tab.windowId != null) {
            await browser.windows.update(tab.windowId, { focused: true });
        }
    })();
    void Promise.race([task, sleep(400)]).catch(() => undefined);
}

async function findOrOpenTab(url) {
    if (!url) return null;

    const tabs = await browser.tabs.query({});
    const match = tabs.find((t) => t.url && urlsMatch(t.url, url));
    if (match?.id != null) {
        bringTabToFront(match.id);
        return match;
    }

    const tab = await browser.tabs.create({ url, active: true });
    if (tab.id != null) {
        await waitForUrlCommitted(tab.id, url);
        bringTabToFront(tab.id);
    }
    return tab;
}

// Runs in the Codeforces page main world: set sourceCodeTextarea, programTypeId,
// problem field, then click .submit. Do not fire change events on selects (resets Ace).
async function cposSubmitOnPage(
    code,
    languageId,
    languageKey,
    problemIndex,
    submitByIndex,
    problemCode,
) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const LANG_RANK = {
        cpp: [
            /GNU G\+\+23/i,
            /GNU G\+\+20/i,
            /GNU G\+\+17/i,
            /G\+\+23/i,
            /G\+\+20/i,
            /G\+\+17/i,
            /G\+\+/i,
        ],
        c: [/GNU GCC C11/i, /GNU GCC C\b/i, /\bGNU C\b/i],
        python: [/^Python 3/i, /Python 3\.\d/i, /\bPython 3\b/i, /PyPy 3/i],
        pypy: [/PyPy 3/i, /PyPy/i],
        java: [/Java 21/i, /Java 17/i, /Java 11/i, /\bJava\b/i],
        kotlin: [/Kotlin/i],
        rust: [/Rust 1\.\d/i, /Rust/i],
        go: [/\bGo\b/i],
        csharp: [/\.NET[^#]*C#/i, /Mono C#/i, /C#/i],
        javascript: [/Node\.js/i, /JavaScript/i],
        ruby: [/Ruby/i],
        haskell: [/Haskell/i],
        pascal: [/PascalABC/i, /Free Pascal/i, /Delphi/i],
    };

    function pickLanguage(select) {
        if (!select || select.options.length <= 1) return;
        const ranks = LANG_RANK[languageKey] || [];
        for (const re of ranks) {
            for (const opt of select.options) {
                if (re.test(opt.textContent || '')) {
                    select.value = opt.value;
                    return;
                }
            }
        }
        if (languageId != null) {
            const want = String(languageId);
            for (const opt of select.options) {
                if (opt.value === want) {
                    select.value = opt.value;
                    return;
                }
            }
        }
    }

    function syncAce(code) {
        if (
            typeof window.ace === 'undefined' ||
            typeof window.ace.edit !== 'function'
        )
            return;
        try {
            const ed = window.ace.edit('editor');
            if (ed && typeof ed.setValue === 'function') {
                ed.setValue(code, -1);
                ed.clearSelection();
                if (typeof ed.resize === 'function') ed.resize();
            }
        } catch {
            /* ignore */
        }
    }

    function setProblemIndex(select, index) {
        if (!select || !index) return false;
        const want = String(index).toUpperCase();
        for (const opt of select.options) {
            const val = (opt.value || '').toUpperCase();
            const text = (opt.textContent || '').trim().toUpperCase();
            if (
                val === want ||
                text === want ||
                text.startsWith(`${want} `) ||
                text.startsWith(`${want}.`) ||
                text.startsWith(`${want}—`) ||
                text.startsWith(`${want}-`)
            ) {
                select.value = opt.value;
                return true;
            }
        }
        return false;
    }

    function clickSubmit() {
        const candidates = [
            document.getElementById('singlePageSubmitButton'),
            document.querySelector('input.submit[type="submit"]'),
            document.querySelector('form.submit-form input[type="submit"]'),
            document.querySelector(".submit input[type='submit']"),
            document.querySelector('button.submit'),
            document.querySelector('.submit'),
        ];
        for (const btn of candidates) {
            if (btn && !btn.disabled) {
                btn.disabled = false;
                btn.click();
                return true;
            }
        }
        const form =
            document.querySelector('form.submit-form') ||
            document.querySelector('form[action*="submit"]');
        if (form && typeof form.requestSubmit === 'function') {
            form.requestSubmit();
            return true;
        }
        return false;
    }

    for (let i = 0; i < 80; i++) {
        const sourceCodeEl = document.getElementById('sourceCodeTextarea');
        const languageEl = document.getElementsByName('programTypeId')[0];

        if (
            sourceCodeEl &&
            languageEl &&
            languageEl.options.length > 1 &&
            String(code).trim()
        ) {
            sourceCodeEl.value = code;
            syncAce(code);
            pickLanguage(languageEl);

            if (submitByIndex && problemIndex) {
                const problemIndexEl = document.getElementsByName(
                    'submittedProblemIndex',
                )[0];
                if (problemIndexEl)
                    setProblemIndex(problemIndexEl, problemIndex);
            } else if (problemCode) {
                const codeInput = document.querySelector(
                    'input[name="submittedProblemCode"]',
                );
                if (codeInput) codeInput.value = String(problemCode);
            }

            if (!sourceCodeEl.value.trim()) {
                sourceCodeEl.value = code;
                syncAce(code);
            }

            syncAce(sourceCodeEl.value || code);
            if (clickSubmit()) return { ok: true };
            return { ok: false, reason: 'submit-btn-missing' };
        }

        await sleep(60);
    }

    return { ok: false, reason: 'form-timeout' };
}

// Runs in CSES submit page MAIN world.
async function cposCsesSubmitOnPage(code, fileName, language) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const hints = {
        cpp: ['C++'],
        c: ['C'],
        python: ['Python3', 'Python 3', 'CPython'],
        java: ['Java'],
        rust: ['Rust'],
    };
    const optionStrategies = {
        cpp: { version: /(?:C\+\+\s*)?(\d{2})/i, prefer: [/C\+\+/i] },
        rust: { version: /(\d{4})/i, prefer: [/Rust/i] },
        python: { prefer: [/CPython3/i, /Python\s*3/i, /CPython/i] },
    };

    function pickBestOption(select, strategy) {
        if (!select || !strategy) return false;
        let best = null;
        let bestScore = -1;
        for (const opt of select.options) {
            const text = opt.textContent || '';
            let score = 0;
            const version = strategy.version?.exec(text);
            if (version) score += Number(version[1]) * 100;
            const prefer = strategy.prefer || [];
            for (let i = 0; i < prefer.length; i++) {
                if (prefer[i].test(text)) {
                    score += prefer.length - i;
                    break;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                best = opt;
            }
        }
        if (best && bestScore > 0) {
            select.value = best.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    }

    for (let i = 0; i < 40; i++) {
        let form = null;
        for (const f of document.querySelectorAll('form')) {
            if (f.querySelector('input[type="file"]')) {
                form = f;
                break;
            }
        }
        if (form) {
            const fileInput = form.querySelector('input[type="file"]');
            if (fileInput) {
                const file = new File([code], fileName || 'solution.cpp', {
                    type: 'text/plain',
                });
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const typeSelect =
                form.querySelector('select[name="type"]') ||
                form.querySelector('select');
            if (typeSelect && language) {
                const needles = hints[language] || [];
                for (const opt of typeSelect.options) {
                    if (
                        needles.some((n) => (opt.textContent || '').includes(n))
                    ) {
                        typeSelect.value = opt.value;
                        typeSelect.dispatchEvent(
                            new Event('change', { bubbles: true }),
                        );
                        break;
                    }
                }
                await sleep(250);
            }

            const optionSelect = form.querySelector('select[name="option"]');
            const optionStrategy = optionStrategies[language];
            if (optionSelect && optionStrategy) {
                pickBestOption(optionSelect, optionStrategy);
            }

            await sleep(200);

            for (const el of form.querySelectorAll(
                "input[type='submit'], button",
            )) {
                const text = (el.value || el.textContent || '')
                    .trim()
                    .toLowerCase();
                if (text === 'send' || text === 'submit') {
                    el.click();
                    return { ok: true };
                }
            }
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
                return { ok: true };
            }
            return { ok: false, reason: 'no-send-btn' };
        }
        await sleep(200);
    }
    return { ok: false, reason: 'cses-form-timeout' };
}

function cfSubmitFlags(pending) {
    let pathname = '';
    try {
        pathname = new URL(pending.submitUrl || '').pathname;
    } catch {
        pathname = '';
    }
    const submitByIndex =
        /\/contest\/\d+\/submit/.test(pathname) ||
        /\/gym\/\d+\/submit/.test(pathname) ||
        /\/group\/[^/]+\/contest\/\d+\/submit/.test(pathname);
    const problemIndex = pending.index || null;
    const problemCode = submitByIndex ? null : pending.id || null;
    return { submitByIndex, problemIndex, problemCode };
}

async function handleCodeforces(pending, _endpoint) {
    const tab = await findOrOpenTab(pending.submitUrl);
    if (!tab?.id) return false;

    const languageId = CF_LANGUAGE_IDS[pending.language] ?? null;
    const { submitByIndex, problemIndex, problemCode } = cfSubmitFlags(pending);

    // The injected script waits internally for the form, so a single inject usually
    // suffices. Extra attempts only cover a tab that is still mid-navigation.
    for (let attempt = 0; attempt < 10; attempt++) {
        if (attempt > 0) await sleep(100);

        let ok = false;
        try {
            const results = await browser.scripting.executeScript({
                target: { tabId: tab.id, allFrames: false },
                world: 'MAIN',
                func: cposSubmitOnPage,
                args: [
                    pending.code,
                    languageId,
                    pending.language || 'cpp',
                    problemIndex,
                    submitByIndex,
                    problemCode,
                ],
            });
            ok = results?.[0]?.result?.ok === true;
        } catch {
            ok = false;
        }

        if (ok) {
            bringTabToFront(tab.id);
            return true;
        }
    }

    return false;
}

async function handleCses(pending, _endpoint) {
    const tab = await findOrOpenTab(pending.submitUrl);
    if (!tab?.id) return false;

    const results = await browser.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        world: 'MAIN',
        func: cposCsesSubmitOnPage,
        args: [
            pending.code,
            pending.fileName || 'solution.cpp',
            pending.language || 'cpp',
        ],
    });

    const ok = results?.[0]?.result?.ok === true;
    if (ok && tab.id != null) bringTabToFront(tab.id);
    return ok;
}

async function pollOnce() {
    if (handling) return;
    const found = await fetchPending();
    if (!found) return;

    handling = true;
    try {
        const { data: pending } = found;
        const platform = String(pending.platform || '').toLowerCase();
        let ok = false;
        if (platform === 'codeforces' || platform === 'cf') {
            ok = await handleCodeforces(pending, found.endpoint);
        } else if (platform === 'cses') {
            ok = await handleCses(pending, found.endpoint);
        }
        if (ok) void ack(found.endpoint);
    } finally {
        handling = false;
    }
}

browser.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === 'cpos-cf-submit') {
        const tabId = sender.tab?.id;
        if (!tabId) {
            return Promise.resolve({ ok: false, reason: 'no-tab' });
        }
        return browser.scripting
            .executeScript({
                target: { tabId, allFrames: false },
                world: 'MAIN',
                func: cposSubmitOnPage,
                args: [
                    msg.code,
                    msg.languageId ?? null,
                    msg.language || 'cpp',
                    msg.problemIndex ?? null,
                    msg.submitByIndex === true,
                    msg.problemCode ?? msg.problemId ?? null,
                ],
            })
            .then((results) => {
                return (
                    results?.[0]?.result || {
                        ok: false,
                        reason: 'empty-result',
                    }
                );
            })
            .catch((error) => {
                return { ok: false, reason: String(error) };
            });
    }
    if (msg?.type === 'cpos-poll-submit') {
        return pollOnce().then(() => ({ ok: true }));
    }
});

// --- Keep the MV3 service worker hot so submit pickup is near-instant --------
// Keep the background script warm so submit pickup stays near-instant.
function keepAlivePing() {
    try {
        browser.runtime.getPlatformInfo().catch(() => undefined);
    } catch {
        /* ignore */
    }
}

setInterval(keepAlivePing, 20000);

if (browser.alarms) {
    browser.alarms.create('cpos-revive', { periodInMinutes: 0.5 });
    browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'cpos-revive') pollOnce();
    });
}

if (browser.runtime.onStartup)
    browser.runtime.onStartup.addListener(() => pollOnce());
if (browser.runtime.onInstalled)
    browser.runtime.onInstalled.addListener(() => pollOnce());

setInterval(pollOnce, 150);
pollOnce();
