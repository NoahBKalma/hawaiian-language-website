// Vocab > Word Bank page: search + "By Type" (default) / "By Frequency" tabs (tab kept in `?mode=`).
import * as wordsByType from "/scripts/compile-words.js";
import { POS_LABELS, setUrlParam } from "/scripts/vocab-shared.js";
import { initVocabSearch } from "/scripts/vocab-search.js";
import { t, getLang, onLangChange } from "/scripts/i18n.js";
import { initFrequencyView } from "/scripts/vocab-frequency.js";

const MODES = [`type`, `frequency`];
// Short phrases live on their own Phrases page, not in the Word Bank
const EXCLUDED_POS = [`short_phrases`];

const tabs = document.querySelectorAll(`.vocab-tab`);
const panels = document.getElementById(`word-bank-panels`);
const frequencyPanel = document.getElementById(`panel-frequency`);
const typePanel = document.getElementById(`panel-type`);

// By Type: one card per non-empty part of speech; the big title follows the site language
function renderTypeCards() {
    const haw = getLang() === `haw`;
    let html = `<ul class="type-grid">`;
    for (const [pos, label] of Object.entries(POS_LABELS)) {
        if (EXCLUDED_POS.includes(pos)) continue;
        const sets = wordsByType[pos];
        if (!sets || sets.size === 0) continue;
        let wordCount = 0;
        for (const set of sets.values()) wordCount += set.words.length;
        html += `
            <li>
                <a class="type-card" href="/pages/vocab/type.html?type=${pos}">
                    <span class="type-card-title"${haw ? ` lang="haw"` : ``}>${haw ? label.haw : label.en}</span>
                    <span class="type-card-haw"${haw ? `` : ` lang="haw"`}>${haw ? label.en : label.haw}</span>
                    <span class="type-card-meta">${t(`vocab.meta.pair`, { a: t(sets.size === 1 ? `vocab.count.set` : `vocab.count.sets`, { n: sets.size }), b: t(`vocab.count.words`, { n: wordCount }) })}</span>
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
onLangChange(renderTypeCards);
initFrequencyView(frequencyPanel, { excludePos: EXCLUDED_POS });
selectMode(new URLSearchParams(window.location.search).get(`mode`), false);

initVocabSearch({
    form: document.getElementById(`search-container`),
    input: document.getElementById(`search-bar`),
    results: document.getElementById(`search-results`),
    onToggle: active => { panels.hidden = active; },
    excludePos: EXCLUDED_POS,
});
