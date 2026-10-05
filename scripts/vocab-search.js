// Vocab search, shared by the Vocab hub and the Word Bank page.
// Matches words (Hawaiian/English, ignoring ʻokina, kahakō and case) and set/category names in both languages.
import { allWordEntries, setsById } from "/scripts/compile-words.js";
import { normalize } from "/scripts/word-utils.js";
import { POS_LABELS, POS_TAGS, escapeHtml, typeHref, flashcardsHref, setUrlParam, setDisplayName } from "/scripts/vocab-shared.js";

const MAX_WORD_RESULTS = 300;

// Normalized search keys, computed once
const wordIndex = allWordEntries.map(entry => ({
    entry,
    haw: normalize(entry.hawaiian).replaceAll(` `, ``),
    eng: normalize(entry.english),
}));

const setIndex = [...setsById.values()].map(set => ({
    set,
    keys: [normalize(set.category_english), normalize(set.category_hawaiian)],
    parentKeys: [normalize(set.in_category_english), normalize(set.in_category_hawaiian)].filter(k => k !== ``),
}));

function searchVocab(query) {
    const q = normalize(query.trim());
    if (q === ``) return { sets: [], categories: [], words: [] };
    const qNoSpace = q.replaceAll(` `, ``);

    const words = wordIndex
        .filter(w => w.haw.includes(qNoSpace) || w.eng.includes(q))
        .map(w => w.entry);

    const sets = setIndex.filter(s => s.keys.some(k => k.includes(q))).map(s => s.set);

    // Categories are keyed per part of speech (e.g. "Animals" exists in nouns and short phrases),
    // and link to the first set inside them
    const categories = new Map();
    for (const s of setIndex) {
        if (!s.parentKeys.some(k => k.includes(q))) continue;
        const key = `${s.set.part_of_speech}|${s.set.in_category_english}`;
        if (!categories.has(key)) {
            categories.set(key, {
                english: s.set.in_category_english,
                hawaiian: s.set.in_category_hawaiian,
                pos: s.set.part_of_speech,
                firstSetId: s.set.id,
                setCount: 0,
            });
        }
        categories.get(key).setCount++;
    }

    return { sets, categories: [...categories.values()], words };
}

function renderCategoryChips(sets, categories) {
    if (sets.length === 0 && categories.length === 0) return ``;
    let html = `
        <details class="search-group collapsible" open>
            <summary id="search-sets-heading" class="search-group-title"><h2 class="summary-heading">Categories &amp; Sets</h2></summary>
            <ul class="chip-list">`;
    let chipIndex = 0;
    for (const cat of categories) {
        html += `
                <li class="result-chip result-chip-category reveal" style="--i:${Math.min(chipIndex++, 10)}">
                    <a class="result-chip-main" href="${typeHref(cat.pos, cat.firstSetId)}">
                        <span class="result-chip-kind">Category</span>
                        <span class="result-chip-name">${escapeHtml(cat.english)}</span>
                        <span class="result-chip-meta">${POS_LABELS[cat.pos]?.en ?? cat.pos} · ${cat.setCount} ${cat.setCount === 1 ? `set` : `sets`}</span>
                    </a>
                </li>`;
    }
    for (const set of sets) {
        html += `
                <li class="result-chip result-chip-set reveal" style="--i:${Math.min(chipIndex++, 10)}">
                    <a class="result-chip-main" href="${typeHref(set.part_of_speech, set.id)}">
                        <span class="result-chip-kind">Set</span>
                        <span class="result-chip-name">${escapeHtml(setDisplayName(set))}</span>
                        <span class="result-chip-meta">${POS_LABELS[set.part_of_speech]?.en ?? set.part_of_speech} · ${set.words.length} ${set.words.length === 1 ? `word` : `words`}</span>
                    </a>
                    <a class="result-chip-action" href="${flashcardsHref(set.id)}">Practice</a>
                </li>`;
    }
    html += `
            </ul>
        </details>`;
    return html;
}

function renderWords(words) {
    if (words.length === 0) return ``;
    const shown = words.slice(0, MAX_WORD_RESULTS);

    // Group by set, keeping first-seen order
    const groups = new Map();
    for (const w of shown) {
        if (!groups.has(w.setId)) groups.set(w.setId, []);
        groups.get(w.setId).push(w);
    }

    let html = `
        <details class="search-group collapsible" open>
            <summary id="search-words-heading" class="search-group-title"><h2 class="summary-heading">Words (${words.length})</h2></summary>`;
    if (words.length > shown.length) {
        html += `<p class="search-note">Showing the first ${shown.length} matches. Refine your search to see more.</p>`;
    }
    for (const [setId, list] of groups) {
        const set = setsById.get(setId);
        html += `
            <div class="word-result-group">
                <h3 class="word-result-set">
                    <a href="${typeHref(set.part_of_speech, setId)}">${escapeHtml(setDisplayName(set))}</a>
                    <span class="pos-tag">${POS_TAGS[set.part_of_speech] ?? set.part_of_speech}</span>
                </h3>
                <ul class="word-list">`;
        let rowIndex = 0;
        for (const w of list) {
            html += `
                    <li class="word-row reveal" style="--i:${Math.min(rowIndex++, 10)}">
                        <span class="word-haw" lang="haw">${escapeHtml(w.hawaiian)}</span>
                        <span class="word-eng">${escapeHtml(w.english)}</span>
                    </li>`;
        }
        html += `
                </ul>
            </div>`;
    }
    html += `</details>`;
    return html;
}

function renderSearchResults(query) {
    const { sets, categories, words } = searchVocab(query);
    const heading = `<h2 class="search-results-title">Results for “${escapeHtml(query.trim())}”</h2>`;
    if (sets.length === 0 && categories.length === 0 && words.length === 0) {
        return `${heading}<p class="search-empty">No words, sets or categories match. Try a different spelling — ʻokina and kahakō are optional.</p>`;
    }
    return heading + renderCategoryChips(sets, categories) + renderWords(words);
}

// Wires a search form: `?word=` in the URL is loaded on start and kept in sync.
// `onToggle(active)` lets the page hide its normal content while results are showing.
export function initVocabSearch({ form, input, results, onToggle = () => {} }) {
    function show(query) {
        if (query.trim() === ``) {
            clear();
            return;
        }
        results.innerHTML = renderSearchResults(query);
        results.hidden = false;
        setUrlParam(`word`, query.trim());
        onToggle(true);
    }

    function clear() {
        results.innerHTML = ``;
        results.hidden = true;
        setUrlParam(`word`, null);
        onToggle(false);
    }

    form.addEventListener(`submit`, event => {
        event.preventDefault();
        show(input.value);
    });

    form.addEventListener(`reset`, () => {
        // Let the input clear first
        setTimeout(clear, 0);
    });

    const initial = new URLSearchParams(window.location.search).get(`word`);
    if (initial) {
        input.value = initial;
        show(initial);
    }
}
