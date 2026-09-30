// Helpers shared by the Vocab pages. Must NOT import compile-words.js.
import { setAnchor } from "/scripts/word-utils.js";

// Part-of-speech labels, in display order. Articles has no data and is hidden wherever empty.
export const POS_LABELS = {
    nouns: { en: `Nouns`, haw: `Nā Papani` },
    verbs: { en: `Verbs`, haw: `Nā Hehele / Nā Hamani` },
    adjectives: { en: `Adjectives`, haw: `Nā ʻAʻano` },
    adverbs: { en: `Adverbs`, haw: `Nā ʻŌlelo ʻĒ Aʻe` },
    short_phrases: { en: `Short Phrases`, haw: `Nā ʻŌlelo Pōkole` },
    pronouns: { en: `Pronouns`, haw: `Nā Kaʻi` },
    articles: { en: `Articles`, haw: `Nā Pilimua` },
    prepositions: { en: `Prepositions`, haw: `Nā ʻAmi` },
    conjunctions: { en: `Conjunctions`, haw: `Nā Huipū` },
};

// Singular tag shown next to a word (e.g. "noun")
export const POS_TAGS = {
    nouns: `noun`,
    verbs: `verb`,
    adjectives: `adjective`,
    adverbs: `adverb`,
    short_phrases: `phrase`,
    pronouns: `pronoun`,
    articles: `article`,
    prepositions: `preposition`,
    conjunctions: `conjunction`,
};

export function escapeHtml(str) {
    return String(str ?? ``)
        .replaceAll(`&`, `&amp;`)
        .replaceAll(`<`, `&lt;`)
        .replaceAll(`>`, `&gt;`)
        .replaceAll(`"`, `&quot;`)
        .replaceAll(`'`, `&#39;`);
}

// Link to a type page, optionally anchored at one set
export function typeHref(pos, setId) {
    const base = `/pages/vocab/type.html?type=${encodeURIComponent(pos)}`;
    return setId ? `${base}#${setAnchor(setId)}` : base;
}

export function flashcardsHref(setId) {
    return `/pages/flashcards.html?set=${encodeURIComponent(setId)}`;
}

export function writingHref(setId) {
    return `/pages/writing-practice.html?set=${encodeURIComponent(setId)}`;
}

// Set (or delete, when value is empty) one query param without reloading or touching the others
export function setUrlParam(name, value) {
    const url = new URL(window.location.href);
    if (value === null || value === undefined || value === ``) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    // Keep list params readable (?levels=5,4 rather than 5%2C4)
    history.replaceState(null, ``, url.pathname + url.search.replaceAll(`%2C`, `,`) + url.hash);
}

// Full display name of a set, e.g. "Animals › Birds"
export function setDisplayName(set, lang = `en`) {
    const name = lang === `haw` ? set.category_hawaiian : set.category_english;
    const parent = lang === `haw` ? set.in_category_hawaiian : set.in_category_english;
    return parent ? `${parent} › ${name}` : name;
}
