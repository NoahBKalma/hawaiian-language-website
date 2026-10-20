// Ranking for vocab search (pure functions, no DOM). Used by vocab-search.js; tested in tests/vocab-rank.test.mjs.
// Word tiers, best first: 0 exact (the "Best match" section), 1 whole word inside a Hawaiian/English phrase,
// 2 prefix, 3 later word starts with it, 4 mid-word. Ties: shorter first, then data order.
import { normalize } from "./word-utils.js";

export const MAX_WORD_RESULTS = 300;
// Fuzzy matches are only looked for when there are fewer matches than this
export const FUZZY_BELOW = 5;
export const FUZZY_MIN_LENGTH = 4;

// Edits allowed for a query of `length` letters: none under 4, 1 for 4-6, 2 for 7+
export function maxEdits(length) {
    if (length < FUZZY_MIN_LENGTH) return 0;
    return length >= 7 ? 2 : 1;
}

// Levenshtein distance, giving up (returns max + 1) once it must exceed `max`
export function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
            if (row[j] < rowMin) rowMin = row[j];
        }
        if (rowMin > max) return max + 1;
        prev = row;
    }
    return prev[b.length];
}

// Regular English plural forms of `text` (itself included): colors/color, berries/berry, boxes/box.
// Words of 3 letters or fewer are left alone ("bus", "gas"). Irregular plurals are not handled.
export function variants(text) {
    const out = new Set([text]);
    if (text.length > 3) {
        if (text.endsWith(`ies`)) out.add(`${text.slice(0, -3)}y`);
        if (text.endsWith(`es`)) out.add(text.slice(0, -2));
        if (text.endsWith(`s`) && !text.endsWith(`ss`)) out.add(text.slice(0, -1));
    }
    return out;
}

export function sameForm(a, b) {
    const forms = variants(a);
    for (const v of variants(b)) if (forms.has(v)) return true;
    return false;
}

// Splits an English gloss into its alternatives ("beating; stroke") so an exact gloss counts as exact
// A verb gloss also counts without its "to": "to run" is an exact match for "run" (and "run" for "to run")
const stripTo = text => text.startsWith(`to `) && text.length > 3 ? text.slice(3).trim() : text;
const glossParts = eng => [...new Set(eng.split(/[;,/]/).map(g => g.trim()).filter(g => g !== ``).flatMap(g => [g, stripTo(g)]))];
const clean = text => text.replace(/[^\p{L}\p{N}]+/gu, ` `).trim();
const hasWord = (text, forms) => forms.some(f => ` ${text} `.includes(` ${f} `));

export function buildWordIndex(entries) {
    return entries.map(entry => {
        const eng = normalize(entry.english);
        const haw = normalize(entry.hawaiian);
        return {
            entry,
            haw: haw.replaceAll(` `, ``),
            hawClean: clean(haw),
            eng,
            engClean: clean(eng),
            glosses: glossParts(eng),
            engWords: eng.split(/[^\p{L}\p{N}]+/u).filter(w => w !== ``),
        };
    });
}

// Tier of a word for the normalized query `q` (`qNoSpace`: spaces removed, for Hawaiian), or null
function wordTier(w, q, qNoSpace, qForms, qBare) {
    if (w.haw === qNoSpace || w.glosses.some(g => sameForm(g, q) || sameForm(g, qBare))) return 0;
    if (hasWord(w.hawClean, [q]) || hasWord(w.engClean, qForms)) return 1;
    if (w.haw.startsWith(qNoSpace) || w.eng.startsWith(q) || w.glosses.some(g => g.startsWith(q))) return 2;
    if (w.eng.includes(` ${q}`)) return 3;
    return w.haw.includes(qNoSpace) || w.eng.includes(q) ? 4 : null;
}

function fuzzyDistance(w, qNoSpace, edits) {
    let best = edits + 1;
    for (const candidate of [w.haw, ...w.engWords]) {
        best = Math.min(best, editDistance(qNoSpace, candidate, edits));
    }
    return best;
}

// Rank words for `query`. `excludePos`: parts of speech left out. Words with the same Hawaiian and English show once.
// Returns { best, rest, fuzzy, total }: `best` are the exact matches, `rest` every other match (best first, at most
// `limit` with `fuzzy`), `fuzzy` typo rescues (only when there are few matches), `total` the full count of `rest`.
export function rankWords(index, query, excludePos = new Set(), limit = MAX_WORD_RESULTS) {
    const q = normalize(query.trim());
    if (q === ``) return { best: [], rest: [], fuzzy: [], total: 0 };
    const qNoSpace = q.replaceAll(` `, ``);
    const qForms = [...variants(q)];
    const qBare = stripTo(q);

    const seen = new Set();
    const keep = w => {
        // Raw spelling, so ʻalani (fruit) and ʻālani (color) stay separate even though they search the same
        const key = `${w.entry.hawaiian.normalize(`NFC`)}|${w.eng}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    };

    const scored = [];
    const missed = [];
    index.forEach((w, order) => {
        if (excludePos.has(w.entry.pos)) return;
        const tier = wordTier(w, q, qNoSpace, qForms, qBare);
        if (tier === null) missed.push(w);
        else scored.push({ w, tier, order, len: Math.min(w.haw.length, w.eng.length) });
    });
    scored.sort((a, b) => a.tier - b.tier || a.len - b.len || a.order - b.order);
    const best = [];
    const restAll = [];
    for (const s of scored) {
        if (!keep(s.w)) continue;
        (s.tier === 0 ? best : restAll).push(s.w);
    }

    let fuzzyAll = [];
    const edits = maxEdits(qNoSpace.length);
    if (best.length + restAll.length < FUZZY_BELOW && edits > 0) {
        fuzzyAll = missed
            .map((w, order) => ({ w, order, d: fuzzyDistance(w, qNoSpace, edits) }))
            .filter(f => f.d <= edits)
            .sort((a, b) => a.d - b.d || a.order - b.order)
            .map(f => f.w)
            .filter(keep);
    }

    const rest = restAll.slice(0, limit).map(w => w.entry);
    const fuzzy = fuzzyAll.slice(0, Math.max(0, limit - rest.length)).map(w => w.entry);
    return { best: best.slice(0, limit).map(w => w.entry), rest, fuzzy, total: restAll.length };
}

// Tier of `q` inside one normalized name: 0 exact, 1 prefix, 2 word start, 3 substring, or null
function nameTier(text, q) {
    if (text === q) return 0;
    if (text.startsWith(q)) return 1;
    if (text.includes(` ${q}`)) return 2;
    return text.includes(q) ? 3 : null;
}

// Order for names: exact, prefix, word start, substring (null tiers are dropped). `keysOf(item)` gives normalized names.
export function rankByName(items, q, keysOf) {
    return items
        .map((item, order) => {
            let best = null;
            for (const k of keysOf(item)) {
                const tier = k === `` ? null : nameTier(k, q);
                if (tier !== null && (best === null || tier < best)) best = tier;
            }
            return { item, tier: best, order };
        })
        .filter(r => r.tier !== null)
        .sort((a, b) => a.tier - b.tier || a.order - b.order)
        .map(r => r.item);
}

// Set names are compared with "&" read as "and" and the parts of "A and B" in any order, so
// "objects and tools", "Objects & Tools" and "tools and objects" are the same name.
const andForm = text => text.replace(/\s*&\s*/g, ` and `).replace(/\s+/g, ` `).trim();
const nameParts = text => andForm(text).split(` and `).map(p => p.trim()).filter(p => p !== ``).sort();

export function sameName(a, b) {
    const pa = nameParts(a);
    const pb = nameParts(b);
    return pa.length > 0 && pa.length === pb.length && pa.every((p, i) => sameForm(p, pb[i]));
}

// Sets for `query`. `setIndex` items: { set, keys: [own names], parentKeys: [category names] }, all normalized.
// `best`: the set's own name equals the query (plural-insensitive), or the query is exactly its category's name.
// `rest`: every other set whose own name contains the query.
export function rankSets(setIndex, query, excludePos = new Set()) {
    const q = andForm(normalize(query.trim()));
    if (q === ``) return { best: [], rest: [] };
    const own = [];
    const byCategory = [];
    const candidates = [];
    for (const s of setIndex) {
        if (excludePos.has(s.set.part_of_speech)) continue;
        if (s.keys.some(k => k !== `` && sameName(k, q))) own.push(s);
        else if (s.parentKeys.some(k => sameName(k, q))) byCategory.push(s);
        else candidates.push(s);
    }
    return {
        best: [...own, ...byCategory].map(s => s.set),
        rest: rankByName(candidates, q, s => s.keys.map(andForm)).map(s => s.set),
    };
}
