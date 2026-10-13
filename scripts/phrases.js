// Vocab > Phrases page: every short-phrase set, grouped by category, with a filter.
import { short_phrases } from "/scripts/compile-words.js";
import { normalize } from "/scripts/word-utils.js";
import { escapeHtml, flashcardsHref, writingHref, typeHref } from "/scripts/vocab-shared.js";
import { t, getLang, onLangChange } from "/scripts/i18n.js";

const list = document.getElementById(`phrase-groups`);
const filterInput = document.getElementById(`phrase-filter`);
const countLabel = document.getElementById(`phrase-count`);

// Group key for sets with no parent category (shown last; the heading comes from the i18n table)
const OTHER_CATEGORY = `Other Phrases`;

// Group sets by parent category; sets without one go in a shared group at the end
const groups = new Map();
for (const set of short_phrases.values()) {
    const name = set.in_category_english || OTHER_CATEGORY;
    if (!groups.has(name)) groups.set(name, { english: name, hawaiian: set.in_category_hawaiian, sets: [] });
    groups.get(name).sets.push(set);
}
// Groups keep the order they first appear in the word data; "Other Phrases" stays last
const sortedGroups = [...groups.values()].sort((a, b) =>
    (a.english === OTHER_CATEGORY) - (b.english === OTHER_CATEGORY));

// Normalized text each set can be filtered by: its names, its category and its phrases
const searchText = new Map();
for (const set of short_phrases.values()) {
    const parts = [set.category_english, set.category_hawaiian, set.in_category_english, set.in_category_hawaiian];
    for (const w of set.words) parts.push(w.hawaiian, w.english);
    searchText.set(set.id, normalize(parts.join(`\n`)));
}

let setIndex = 0;
const isHaw = () => getLang() === `haw`;

function renderSet(set) {
    let phrases = ``;
    for (const w of set.words) {
        phrases += `
                    <li class="word-row">
                        <span class="word-haw" lang="haw">${escapeHtml(w.hawaiian)}</span>
                        <span class="word-eng">${escapeHtml(w.english)}</span>
                    </li>`;
    }
    return `
        <li class="phrase-set reveal" style="--i:${Math.min(setIndex++, 10)}" data-set-id="${escapeHtml(set.id)}">
            <div class="phrase-set-header">
                <h3 class="phrase-set-title">
                    <a href="${typeHref(set.part_of_speech, set.id)}">${escapeHtml(isHaw() && set.category_hawaiian ? set.category_hawaiian : set.category_english)}</a>
                </h3>
                <span class="phrase-set-count">${t(set.words.length === 1 ? `phrases.count.one` : `phrases.count.many`, { n: set.words.length })}</span>
                <div class="phrase-set-actions">
                    <a class="practice-link" href="${flashcardsHref(set.id)}">${t(`phrases.flashcards`)}</a>
                    <a class="practice-link" href="${writingHref(set.id)}">${t(`phrases.writing`)}</a>
                </div>
            </div>
            <details class="phrase-set-preview">
                <summary>${t(`phrases.show`)}</summary>
                <ul class="word-list">${phrases}
                </ul>
            </details>
        </li>`;
}

function groupName(group) {
    if (group.english === OTHER_CATEGORY) return t(`phrases.other`);
    return isHaw() && group.hawaiian ? group.hawaiian : group.english;
}

let setElements = [];
let groupElements = [];

function renderAll() {
    setIndex = 0;
    list.innerHTML = sortedGroups.map(group => `
    <details class="phrase-group collapsible" open>
        <summary class="phrase-group-title"><h2 class="summary-heading">${escapeHtml(groupName(group))}</h2></summary>
        <ul class="phrase-set-list">
            ${group.sets.map(renderSet).join(``)}
        </ul>
    </details>`).join(``);
    setElements = [...list.querySelectorAll(`.phrase-set`)];
    groupElements = [...list.querySelectorAll(`.phrase-group`)];
    applyFilter();
}

function applyFilter() {
    const q = normalize(filterInput.value.trim());
    let visible = 0;
    for (const el of setElements) {
        const match = q === `` || searchText.get(el.dataset.setId).includes(q);
        el.hidden = !match;
        if (match) visible++;
    }
    for (const group of groupElements) {
        group.hidden = !group.querySelector(`.phrase-set:not([hidden])`);
    }
    countLabel.textContent = visible === 0
        ? t(`phrases.none`)
        : t(`phrases.shown`, { n: visible, total: setElements.length });
}

filterInput.addEventListener(`input`, applyFilter);
renderAll();
onLangChange(renderAll);
