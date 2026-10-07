// Profile "Spaced Repetition" section: per-mode overview plus the sets the user has started. Thin DOM layer; the counting
// lives in spaced-summary.js. Loads lazily (when the section scrolls into view): one GET /review-states and the site's
// word/set data (compile-words.js, the same loader the practice pages use).
import { API_BASE_URL } from "/scripts/config.js";
import { getToken, isLoggedIn } from "/scripts/auth.js";
import { escapeHtml } from "/scripts/vocab-shared.js";
import { describeNextDue } from "/scripts/sm2.js";
import { stateMapFromWire, summarizeStates, prepareSets, buildSetRows } from "/scripts/spaced-summary.js";

const root = document.getElementById(`spaced-section`);

const MODE_INFO = {
    flashcards: { label: `Flashcards`, page: `/pages/flashcards.html`, empty: `Turn on the Spaced switch on the Flashcards page and grade a few cards.` },
    writing: { label: `Writing`, page: `/pages/writing-practice.html`, empty: `Turn on the Spaced switch on the Writing page and answer a few words.` }
};
const MODE_ORDER = [`flashcards`, `writing`];

let data = null;          // { maps: {mode: Map}, prepared, now }
let activeMode = `flashcards`;
let loadStarted = false;

function setStatus(html, { busy = false } = {}) {
    root.innerHTML = html;
    root.setAttribute(`aria-busy`, String(busy));
}

function showError(message) {
    setStatus(`
        <div class="badges-status is-error sr-error" role="alert">
            <span>${escapeHtml(message)}</span>
            <button type="button" class="btn btn-quiet btn-sm" id="spaced-retry">Try again</button>
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
        setStatus(`<p class="badges-status">Log in to see your review schedule. <a href="/pages/login.html">Log in</a></p>`);
        return;
    }
    setStatus(`<p class="badges-status">Loading your reviews&hellip;</p>`, { busy: true });
    try {
        const [body, prepared] = await Promise.all([fetchStates(), loadSets()]);
        data = { maps: {}, prepared, now: Date.now() };
        for (const mode of MODE_ORDER) data.maps[mode] = stateMapFromWire(body, mode);
        renderShell();
    } catch (e) {
        showError(`Can't load your spaced repetition right now.`);
    }
}

function renderShell() {
    root.setAttribute(`aria-busy`, `false`);
    root.innerHTML = `
        <div class="tabs sr-tabs" role="tablist" aria-label="Spaced repetition mode">
            ${MODE_ORDER.map(mode => `<button type="button" role="tab" id="spaced-tab-${mode}" class="sr-tab" aria-controls="spaced-panel" aria-selected="${mode === activeMode}" tabindex="${mode === activeMode ? 0 : -1}" data-mode="${mode}">${MODE_INFO[mode].label}</button>`).join(``)}
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
    renderPanel();
}

function selectMode(mode) {
    activeMode = mode;
    for (const tab of root.querySelectorAll(`[role="tab"]`)) {
        const on = tab.dataset.mode === mode;
        tab.setAttribute(`aria-selected`, String(on));
        tab.tabIndex = on ? 0 : -1;
    }
    root.querySelector(`#spaced-panel`).setAttribute(`aria-labelledby`, `spaced-tab-${mode}`);
    renderPanel();
}

function statTile(value, label) {
    return `<div class="sr-stat"><dt>${label}</dt><dd>${value.toLocaleString()}</dd></div>`;
}

function renderSetRow(row, info, mode) {
    const href = `${info.page}?set=${encodeURIComponent(row.id)}&minFreq=1&spaced=1`;
    const name = row.nameHaw || row.nameEng;
    const sub = row.nameHaw && row.nameEng && row.nameEng !== row.nameHaw ? `<span class="sr-set-eng">${escapeHtml(row.nameEng)}</span>` : ``;
    const when = row.due > 0
        ? `Due now`
        : row.nextDue !== null ? `Next review: ${describeNextDue(row.nextDue, data.now)}` : `Nothing scheduled`;
    return `
        <li>
            <a class="sr-set" href="${href}" aria-label="${escapeHtml(`${name}: ${row.due} due, ${row.newLeft} new left, ${row.learned} of ${row.total} learned. Open in spaced ${info.label.toLowerCase()}.`)}">
                <span class="sr-set-main">
                    <span class="sr-set-name" lang="haw">${escapeHtml(name)}</span>
                    ${sub}
                </span>
                <span class="sr-set-counts" aria-hidden="true">
                    <span class="sr-count${row.due > 0 ? ` is-due` : ``}"><strong>${row.due}</strong> due</span>
                    <span class="sr-count"><strong>${row.newLeft}</strong> new left</span>
                    <span class="sr-count"><strong>${row.learned}/${row.total}</strong> learned</span>
                </span>
                <span class="sr-set-when" aria-hidden="true">${escapeHtml(when)}</span>
            </a>
        </li>`;
}

function renderPanel() {
    const panel = root.querySelector(`#spaced-panel`);
    const info = MODE_INFO[activeMode];
    const map = data.maps[activeMode];
    const totals = summarizeStates(map, data.now);

    if (totals.total === 0) {
        panel.innerHTML = `
            <div class="sr-empty">
                <p><strong>No ${info.label.toLowerCase()} reviews yet.</strong></p>
                <p>${escapeHtml(info.empty)} Each word is then scheduled to come back right before you would forget it, and your progress shows up here.</p>
                <a class="btn btn-primary btn-sm" href="${info.page}">Go to ${escapeHtml(info.label)}</a>
            </div>`;
        return;
    }

    const rows = buildSetRows(data.prepared, map, data.now);
    const note = totals.due > 0
        ? `${totals.due.toLocaleString()} ${totals.due === 1 ? `word is` : `words are`} ready to review.`
        : `Nothing is due right now.${totals.nextDue !== null ? ` Next review: ${describeNextDue(totals.nextDue, data.now)}.` : ``}`;
    panel.innerHTML = `
        <dl class="sr-stats">
            ${statTile(totals.due, `Due now`)}
            ${statTile(totals.learning, `In learning`)}
            ${statTile(totals.graduated, `Graduated`)}
            ${statTile(totals.total, `Total scheduled`)}
        </dl>
        <p class="sr-note">${escapeHtml(note)}</p>
        <h3 class="sr-subtitle">Sets you've started</h3>
        ${rows.length > 0
            ? `<ul class="sr-sets">${rows.map(row => renderSetRow(row, info, activeMode)).join(``)}</ul>`
            : `<p class="badges-status">Your scheduled words are from other lists, so no set is shown here.</p>`}`;
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
