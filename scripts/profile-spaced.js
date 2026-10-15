// Profile "Spaced Repetition" section: per-mode overview plus the sets the user has started. Thin DOM layer; the counting
// lives in spaced-summary.js. Loads lazily (when the section scrolls into view): one GET /review-states and the site's
// word/set data (compile-words.js, the same loader the practice pages use).
import { API_BASE_URL } from "/scripts/config.js";
import { getToken, isLoggedIn } from "/scripts/auth.js";
import { escapeHtml } from "/scripts/vocab-shared.js";
import { describeNextDue } from "/scripts/sm2.js";
import { t, onLangChange } from "/scripts/i18n.js";
import { stateMapFromWire, summarizeStates, prepareSets, buildSetRows } from "/scripts/spaced-summary.js";

const root = document.getElementById(`spaced-section`);

const MODE_INFO = {
    flashcards: { page: `/pages/flashcards.html` },
    writing: { page: `/pages/writing-practice.html` }
};
const modeLabel = mode => t(`profile.spaced.mode.${mode}`);
const MODE_ORDER = [`flashcards`, `writing`];

let data = null;          // { maps: {mode: Map}, prepared, now }
let activeMode = `flashcards`;
let loadStarted = false;
let notice = null;        // one-off message after a delete: { text, error }, shown once by renderPanel
let view = null;         // what the section shows: loggedOut | loading | error | ready (repainted when the site language changes)

function setStatus(html, { busy = false } = {}) {
    root.innerHTML = html;
    root.setAttribute(`aria-busy`, String(busy));
}

function showError() {
    const message = t(`profile.spaced.error`);
    setStatus(`
        <div class="badges-status is-error sr-error" role="alert">
            <span>${escapeHtml(message)}</span>
            <button type="button" class="btn btn-quiet btn-sm" id="spaced-retry">${t(`profile.spaced.retry`)}</button>
        </div>`);
    root.querySelector(`#spaced-retry`).addEventListener(`click`, () => { loadStarted = false; start(); });
}

async function fetchStates() {
    const response = await fetch(`${API_BASE_URL}/review-states`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error(`review-states ${response.status}`);
    return response.json();
}

async function loadSets() {
    const { setsById } = await import(`/scripts/compile-words.js`);
    if (!setsById || setsById.size === 0) throw new Error(`no set data`);
    return prepareSets([...setsById.values()].map(set => ({
        id: set.id,
        nameHaw: set.category_hawaiian,
        nameEng: set.category_english,
        words: set.words
    })));
}

async function start() {
    if (loadStarted) return;
    loadStarted = true;
    if (!isLoggedIn()) {
        view = `loggedOut`;
        paint();
        return;
    }
    view = `loading`;
    paint();
    try {
        const [body, prepared] = await Promise.all([fetchStates(), loadSets()]);
        data = { maps: {}, prepared, now: Date.now() };
        for (const mode of MODE_ORDER) data.maps[mode] = stateMapFromWire(body, mode);
        view = `ready`;
        paint();
    } catch (e) {
        view = `error`;
        paint();
    }
}

function paint() {
    if (view === `loggedOut`) setStatus(`<p class="badges-status">${t(`profile.spaced.loggedOut-html`)}</p>`);
    else if (view === `loading`) setStatus(`<p class="badges-status">${t(`profile.loading.reviews`)}</p>`, { busy: true });
    else if (view === `error`) showError();
    else if (view === `ready`) renderShell();
}
onLangChange(paint);

function renderShell() {
    root.setAttribute(`aria-busy`, `false`);
    root.innerHTML = `
        <div class="tabs sr-tabs" role="tablist" aria-label="${t(`profile.spaced.tabs.aria`)}">
            ${MODE_ORDER.map(mode => `<button type="button" role="tab" id="spaced-tab-${mode}" class="sr-tab" aria-controls="spaced-panel" aria-selected="${mode === activeMode}" tabindex="${mode === activeMode ? 0 : -1}" data-mode="${mode}">${modeLabel(mode)}</button>`).join(``)}
        </div>
        <div id="spaced-panel" class="sr-panel" role="tabpanel" tabindex="-1" aria-labelledby="spaced-tab-${activeMode}"></div>`;
    const tabs = [...root.querySelectorAll(`[role="tab"]`)];
    tabs.forEach((tab, i) => {
        tab.addEventListener(`click`, () => selectMode(tab.dataset.mode));
        tab.addEventListener(`keydown`, event => {
            const last = tabs.length - 1;
            let target = null;
            if (event.key === `ArrowRight`) target = i === last ? 0 : i + 1;
            else if (event.key === `ArrowLeft`) target = i === 0 ? last : i - 1;
            else if (event.key === `Home`) target = 0;
            else if (event.key === `End`) target = last;
            if (target === null) return;
            event.preventDefault();
            selectMode(tabs[target].dataset.mode);
            tabs[target].focus();
        });
    });
    root.querySelector(`#spaced-panel`).addEventListener(`click`, event => {
        const button = event.target.closest(`.sr-set-delete`);
        if (button) deleteSet(button);
    });
    renderPanel();
}

function selectMode(mode) {
    activeMode = mode;
    notice = null;
    for (const tab of root.querySelectorAll(`[role="tab"]`)) {
        const on = tab.dataset.mode === mode;
        tab.setAttribute(`aria-selected`, String(on));
        tab.tabIndex = on ? 0 : -1;
    }
    root.querySelector(`#spaced-panel`).setAttribute(`aria-labelledby`, `spaced-tab-${mode}`);
    renderPanel();
    root.querySelector(`#spaced-panel`).focus({ preventScroll: true });   // the clicked row is gone; keep keyboard users in the panel
}

function statTile(value, label) {
    return `<div class="sr-stat"><dt>${label}</dt><dd>${value.toLocaleString()}</dd></div>`;
}

function renderSetRow(row, info, mode) {
    const href = `${info.page}?set=${encodeURIComponent(row.id)}&minFreq=1&spaced=1`;
    const name = row.nameHaw || row.nameEng;
    const sub = row.nameHaw && row.nameEng && row.nameEng !== row.nameHaw ? `<span class="sr-set-eng">${escapeHtml(row.nameEng)}</span>` : ``;
    const when = row.due > 0
        ? t(`profile.spaced.dueNow`)
        : row.nextDue !== null ? t(`profile.spaced.nextReview`, { when: describeNextDue(row.nextDue, data.now) }) : t(`profile.spaced.nothingScheduled`);
    const deleteLabel = escapeHtml(t(`profile.spaced.delete.aria`, { name, mode: modeLabel(mode).toLowerCase() }));
    return `
        <li class="sr-set-item">
            <a class="sr-set" href="${href}" aria-label="${escapeHtml(t(`profile.spaced.set.aria`, { name, due: row.due, newLeft: row.newLeft, learned: row.learned, total: row.total, mode: modeLabel(mode).toLowerCase() }))}">
                <span class="sr-set-main">
                    <span class="sr-set-name" lang="haw">${escapeHtml(name)}</span>
                    ${sub}
                </span>
                <span class="sr-set-counts" aria-hidden="true">
                    <span class="sr-count${row.due > 0 ? ` is-due` : ``}">${t(`profile.spaced.count.due-html`, { n: row.due })}</span>
                    <span class="sr-count">${t(`profile.spaced.count.newLeft-html`, { n: row.newLeft })}</span>
                    <span class="sr-count">${t(`profile.spaced.count.learned-html`, { n: `${row.learned}/${row.total}` })}</span>
                </span>
                <span class="sr-set-when" aria-hidden="true">${escapeHtml(when)}</span>
            </a>
            <button type="button" class="sr-set-delete" data-set-id="${escapeHtml(row.id)}" data-tip="${escapeHtml(t(`profile.spaced.delete.tip`))}" aria-label="${deleteLabel}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
        </li>`;
}

// Deleting one set's schedules: the server stores schedules per word, so we send this set's word keys for the active mode only.
async function deleteSet(button) {
    const mode = activeMode;
    const set = data.prepared.find(s => s.id === button.dataset.setId);
    if (!set) return;
    const name = set.nameHaw || set.nameEng;
    const modeName = modeLabel(mode).toLowerCase();
    if (!confirm(t(`profile.spaced.delete.confirm`, { name, mode: modeName }))) return;
    button.disabled = true;
    try {
        const response = await fetch(`${API_BASE_URL}/review-states`, {
            method: `DELETE`,
            headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": `application/json` },
            body: JSON.stringify({ mode, word_keys: set.keys })
        });
        if (!response.ok) throw new Error(`delete ${response.status}`);
        for (const key of set.keys) data.maps[mode].delete(key);
        notice = { text: t(`profile.spaced.delete.done`, { name, mode: modeName }), error: false };
    } catch (e) {
        notice = { text: t(`profile.spaced.delete.error`), error: true };
    }
    renderPanel();
}

function renderPanel() {
    const panel = root.querySelector(`#spaced-panel`);
    const info = MODE_INFO[activeMode];
    const map = data.maps[activeMode];
    const totals = summarizeStates(map, data.now);
    const noticeHtml = notice
        ? `<p class="badges-status sr-notice${notice.error ? ` is-error` : ``}" role="${notice.error ? `alert` : `status`}">${escapeHtml(notice.text)}</p>`
        : ``;
    notice = null;

    if (totals.total === 0) {
        panel.innerHTML = `
            ${noticeHtml}
            <div class="sr-empty">
                <p>${t(`profile.spaced.none-html`, { mode: modeLabel(activeMode).toLowerCase() })}</p>
                <p>${escapeHtml(t(`profile.spaced.empty.after`, { hint: t(`profile.spaced.empty.${activeMode}`) }))}</p>
                <a class="btn btn-primary btn-sm" href="${info.page}">${escapeHtml(t(`profile.spaced.goTo`, { mode: modeLabel(activeMode) }))}</a>
            </div>`;
        return;
    }

    const rows = buildSetRows(data.prepared, map, data.now);
    const note = totals.due > 0
        ? t(totals.due === 1 ? `profile.spaced.ready.one` : `profile.spaced.ready.many`, { n: totals.due.toLocaleString() })
        : totals.nextDue !== null ? t(`profile.spaced.nothingDueNext`, { when: describeNextDue(totals.nextDue, data.now) }) : t(`profile.spaced.nothingDue`);
    panel.innerHTML = `
        ${noticeHtml}
        <dl class="sr-stats">
            ${statTile(totals.due, t(`profile.spaced.stat.due`))}
            ${statTile(totals.learning, t(`profile.spaced.stat.learning`))}
            ${statTile(totals.graduated, t(`profile.spaced.stat.graduated`))}
            ${statTile(totals.total, t(`profile.spaced.stat.total`))}
        </dl>
        <p class="sr-note">${escapeHtml(note)}</p>
        <h3 class="sr-subtitle">${t(`profile.spaced.started`)}</h3>
        ${rows.length > 0
            ? `<ul class="sr-sets">${rows.map(row => renderSetRow(row, info, activeMode)).join(``)}</ul>`
            : `<p class="badges-status">${t(`profile.spaced.otherLists`)}</p>`}`;
}

if (root) {
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
        }, { rootMargin: `200px` });
        observer.observe(root);
    } else {
        start();
    }
}
