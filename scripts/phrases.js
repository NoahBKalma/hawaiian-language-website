// Vocab > Phrases page: every short-phrase set, grouped by category, with a filter.
import { short_phrases } from "/scripts/compile-words.js";
import { normalize } from "/scripts/word-utils.js";
import { escapeHtml, flashcardsHref, writingHref, typeHref } from "/scripts/vocab-shared.js";

const list = document.getElementById(`phrase-groups`);
const filterInput = document.getElementById(`phrase-filter`);
const countLabel = document.getElementById(`phrase-count`);

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
                    <a href="${typeHref(set.part_of_speech, set.id)}">${escapeHtml(set.category_english)}</a>
                </h3>
                <span class="phrase-set-count">${set.words.length} ${set.words.length === 1 ? `phrase` : `phrases`}</span>
                <div class="phrase-set-actions">
                    <a class="practice-link" href="${flashcardsHref(set.id)}">Flashcards</a>
                    <a class="practice-link" href="${writingHref(set.id)}">Writing</a>
                </div>
            </div>
            <details class="phrase-set-preview">
                <summary>Show phrases</summary>
                <ul class="word-list">${phrases}
                </ul>
            </details>
        </li>`;
}

list.innerHTML = sortedGroups.map(group => `
    <details class="phrase-group collapsible" open>
        <summary class="phrase-group-title"><h2 class="summary-heading">${escapeHtml(group.english)}</h2></summary>
        <ul class="phrase-set-list">
            ${group.sets.map(renderSet).join(``)}
        </ul>
    </details>`).join(``);

const setElements = [...list.querySelectorAll(`.phrase-set`)];
const groupElements = [...list.querySelectorAll(`.phrase-group`)];

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
        ? `No phrase sets match.`
        : `${visible} of ${setElements.length} phrase sets`;
}

filterInput.addEventListener(`input`, applyFilter);
applyFilter();
