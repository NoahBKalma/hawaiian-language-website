// Vocab search, shared by the Vocab hub and the Word Bank page.
// Matches words (Hawaiian/English, ignoring ʻokina, kahakō, case and regular English plurals) and set names in both
// languages. "Best match" holds the exact word and set matches; everything else sits under "Other results".
import { allWordEntries, setsById } from "/scripts/compile-words.js";
import { normalize, FREQ_LEVELS } from "/scripts/word-utils.js";
import { POS_LABELS, escapeHtml, typeHref, flashcardsHref, writingHref, quizHref, QUIZ_MIN_WORDS, setUrlParam, setDisplayName } from "/scripts/vocab-shared.js";
import { t, getLang, hasKey, onLangChange } from "/scripts/i18n.js";
import { buildWordIndex, rankWords, rankSets } from "/scripts/vocab-rank.js";

// Lists under "Other results" show this many items; the rest sit behind a "Show more" toggle
const PREVIEW_COUNT = 5;

const posLabel = pos => POS_LABELS[pos]?.[getLang()] ?? pos;
const posTag = pos => hasKey(`vocab.posTag.${pos}`) ? t(`vocab.posTag.${pos}`) : pos;
const countLabel = (n, one, many) => t(n === 1 ? one : many, { n });

// Normalized search keys, computed once
const wordIndex = buildWordIndex(allWordEntries);

const setIndex = [...setsById.values()].map(set => ({
    set,
    keys: [normalize(set.category_english), normalize(set.category_hawaiian)],
    parentKeys: [normalize(set.in_category_english), normalize(set.in_category_hawaiian)].filter(k => k !== ``),
}));

// `excludePos`: parts of speech left out of the results (the Word Bank leaves out short phrases)
function searchVocab(query, excludePos) {
    const words = rankWords(wordIndex, query, excludePos);
    const sets = rankSets(setIndex, query, excludePos);
    return {
        bestWords: words.best,
        bestSets: sets.best,
        otherWords: words.rest,
        otherTotal: words.total,
        similar: words.fuzzy,
        otherSets: sets.rest,
    };
}

const actionLinks = set => `
        <a class="set-act" href="${flashcardsHref(set.id)}">${escapeHtml(t(`header.nav.flashcards`))}</a>
        <a class="set-act" href="${writingHref(set.id)}">${escapeHtml(t(`header.nav.writing`))}</a>${set.words.length >= QUIZ_MIN_WORDS ? `
        <a class="set-act" href="${quizHref(set.id)}">${escapeHtml(t(`vocab.set.quiz`))}</a>` : ``}`;

const previewList = set => `<ul class="word-list">${set.words.map(w => `
            <li class="word-row">
                <span class="word-haw" lang="haw">${escapeHtml(w.hawaiian)}</span>
                <span class="word-eng">${escapeHtml(w.english)}</span>
            </li>`).join(``)}
        </ul>`;

const setMeta = set => escapeHtml(t(`vocab.meta.pair`, { a: posLabel(set.part_of_speech), b: countLabel(set.words.length, `vocab.count.word`, `vocab.count.words`) }));

function renderSetRow(set, index) {
    return `
            <details class="set-acc reveal" style="--i:${Math.min(index, 10)}">
                <summary>
                    <span class="set-acc-name">${escapeHtml(setDisplayName(set, getLang()))}</span>
                    <span class="set-acc-meta">${setMeta(set)}</span>
                </summary>
                <div class="set-acc-body">
                    <div class="set-actions">${actionLinks(set)}
                        <a class="set-act" href="${typeHref(set.part_of_speech, set.id)}">${escapeHtml(t(`vocab.res.openSet`))}</a>
                    </div>
                    ${previewList(set)}
                </div>
            </details>`;
}

// Frequency level (5 = most common, 1 = rare) at the very end of a word row
const freqTag = w => FREQ_LEVELS[w.frequency] ? `
                    <span class="word-freq" title="${escapeHtml(t(`wordBank.freq.chipTitle`, { n: w.frequency, name: FREQ_LEVELS[w.frequency][getLang()] }))}">${escapeHtml(t(`vocab.res.freq`, { n: w.frequency }))}</span>` : ``;

function renderWordRows(words, offset) {
    return words.map((w, i) => {
        const set = setsById.get(w.setId);
        return `
                <li class="word-row reveal" style="--i:${Math.min(offset + i, 10)}">
                    <span class="word-haw" lang="haw">${escapeHtml(w.hawaiian)}</span>
                    <span class="word-eng">${escapeHtml(w.english)}</span>
                    <span class="word-set"><a href="${typeHref(set.part_of_speech, w.setId)}">${escapeHtml(setDisplayName(set, getLang()))}</a> <span class="pos-tag">${escapeHtml(posTag(set.part_of_speech))}</span></span>${freqTag(w)}
                </li>`;
    }).join(``);
}

// Shows `limit` items, then the rest inside a plain <details> toggle (no script needed). `limit` Infinity shows all.
function withMore(items, limit, renderItems) {
    const head = items.slice(0, limit);
    const tail = items.slice(limit);
    let html = renderItems(head, 0);
    if (tail.length > 0) {
        html += `
            <details class="more-results">
                <summary class="more-toggle"><span class="more-closed">${escapeHtml(t(`vocab.res.showMore`, { n: tail.length }))}</span><span class="more-open">${escapeHtml(t(`vocab.res.showFewer`))}</span></summary>
                ${renderItems(tail, limit)}
            </details>`;
    }
    return html;
}

const wordBlock = (words, limit) => words.length === 0 ? `` : `
            <div class="word-results">${withMore(words, limit, (items, offset) => `<ul class="word-list">${renderWordRows(items, offset)}</ul>`)}</div>`;

const setBlock = (sets, limit) => sets.length === 0 ? `` : `
            <div class="set-acc-list">${withMore(sets, limit, (items, offset) => items.map((set, i) => renderSetRow(set, offset + i)).join(``))}</div>`;

const subhead = text => `<h3 class="result-subhead">${escapeHtml(text)}</h3>`;

function renderSection(id, title, body) {
    return `
        <details class="search-group collapsible" open>
            <summary id="${id}" class="search-group-title"><h2 class="summary-heading">${escapeHtml(title)}</h2></summary>${body}
        </details>`;
}

function renderSearchResults(query, excludePos) {
    const { bestWords, bestSets, otherWords, otherTotal, similar, otherSets } = searchVocab(query, excludePos);
    const heading = `<h2 class="search-results-title">${escapeHtml(t(`vocab.res.title`, { q: query.trim() }))}</h2>`;
    const hasBest = bestWords.length + bestSets.length > 0;
    const hasOther = otherWords.length + similar.length + otherSets.length > 0;
    if (!hasBest && !hasOther) {
        return `${heading}<p class="search-empty">${escapeHtml(t(`vocab.res.empty`))}</p>`;
    }

    let html = heading;
    if (!hasBest) html += `<p class="search-no-exact">${escapeHtml(t(`vocab.res.noExact`))}</p>`;
    if (hasBest) {
        html += renderSection(`search-best-heading`, t(`vocab.res.best`), wordBlock(bestWords, Infinity) + setBlock(bestSets, Infinity));
    }
    if (hasOther) {
        let body = ``;
        if (otherWords.length > 0) {
            body += subhead(t(`vocab.res.words`, { n: otherTotal }));
            if (otherTotal > otherWords.length) body += `<p class="search-note">${escapeHtml(t(`vocab.res.note`, { n: otherWords.length }))}</p>`;
            body += wordBlock(otherWords, PREVIEW_COUNT);
        }
        if (similar.length > 0) body += subhead(t(`vocab.res.similar`)) + wordBlock(similar, PREVIEW_COUNT);
        if (otherSets.length > 0) body += subhead(t(`vocab.res.sets`, { n: otherSets.length })) + setBlock(otherSets, PREVIEW_COUNT);
        html += renderSection(`search-other-heading`, t(`vocab.res.other`), body);
    }
    return html;
}

// Wires a search form: `?word=` in the URL is loaded on start and kept in sync.
// `onToggle(active)` lets the page hide its normal content while results are showing.
export function initVocabSearch({ form, input, results, onToggle = () => {}, excludePos = [] }) {
    const excluded = new Set(excludePos);
    let shownQuery = null;

    function show(query) {
        if (query.trim() === ``) {
            clear();
            return;
        }
        shownQuery = query;
        results.innerHTML = renderSearchResults(query, excluded);
        results.hidden = false;
        setUrlParam(`word`, query.trim());
        onToggle(true);
    }

    function clear() {
        shownQuery = null;
        results.innerHTML = ``;
        results.hidden = true;
        setUrlParam(`word`, null);
        onToggle(false);
    }

    // Results hold interface text and set names, so redraw them in the new language
    onLangChange(() => { if (shownQuery !== null) results.innerHTML = renderSearchResults(shownQuery, excluded); });

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
