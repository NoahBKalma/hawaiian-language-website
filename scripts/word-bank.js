// Vocab > Word Bank page: search + "By Frequency" / "By Type" tabs (tab kept in `?mode=`).
import * as wordsByType from "/scripts/compile-words.js";
import { POS_LABELS, setUrlParam } from "/scripts/vocab-shared.js";
import { initVocabSearch } from "/scripts/vocab-search.js";
import { initFrequencyView } from "/scripts/vocab-frequency.js";

const MODES = [`frequency`, `type`];

const tabs = document.querySelectorAll(`.vocab-tab`);
const panels = document.getElementById(`word-bank-panels`);
const frequencyPanel = document.getElementById(`panel-frequency`);
const typePanel = document.getElementById(`panel-type`);

// By Type: one card per non-empty part of speech (articles has no data, so it's hidden)
function renderTypeCards() {
    let html = `<ul class="type-grid">`;
    for (const [pos, label] of Object.entries(POS_LABELS)) {
        const sets = wordsByType[pos];
        if (!sets || sets.size === 0) continue;
        let wordCount = 0;
        for (const set of sets.values()) wordCount += set.words.length;
        html += `
            <li>
                <a class="type-card" href="/pages/vocab/type.html?type=${pos}">
                    <span class="type-card-title">${label.en}</span>
                    <span class="type-card-haw" lang="haw">${label.haw}</span>
                    <span class="type-card-meta">${sets.size} ${sets.size === 1 ? `set` : `sets`} · ${wordCount} words</span>
                </a>
            </li>`;
    }
    html += `</ul>`;
    typePanel.innerHTML = html;
}

function selectMode(mode, updateUrl = true) {
    if (!MODES.includes(mode)) mode = MODES[0];
    tabs.forEach(tab => {
        const active = tab.dataset.mode === mode;
        tab.setAttribute(`aria-selected`, String(active));
        tab.tabIndex = active ? 0 : -1;
    });
    frequencyPanel.hidden = mode !== `frequency`;
    typePanel.hidden = mode !== `type`;
    if (updateUrl) setUrlParam(`mode`, mode);
}

tabs.forEach((tab, i) => {
    tab.addEventListener(`click`, () => selectMode(tab.dataset.mode));
    // Arrow keys move between tabs
    tab.addEventListener(`keydown`, event => {
        if (event.key !== `ArrowRight` && event.key !== `ArrowLeft`) return;
        const next = tabs[(i + (event.key === `ArrowRight` ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        selectMode(next.dataset.mode);
    });
});

renderTypeCards();
initFrequencyView(frequencyPanel);
selectMode(new URLSearchParams(window.location.search).get(`mode`), false);

initVocabSearch({
    form: document.getElementById(`search-container`),
    input: document.getElementById(`search-bar`),
    results: document.getElementById(`search-results`),
    onToggle: active => { panels.hidden = active; },
});
