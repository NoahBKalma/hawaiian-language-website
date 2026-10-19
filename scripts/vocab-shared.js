// Helpers shared by the Vocab pages. Must NOT import compile-words.js.
import { setAnchor } from "/scripts/word-utils.js";

// Part-of-speech labels, in display order.
export const POS_LABELS = {
    nouns: { en: `Nouns`, haw: `Nā Kikino` },
    verbs: { en: `Verbs`, haw: `Nā Haʻina` },
    adjectives: { en: `Adjectives`, haw: `Nā Haʻiʻano` },
    adverbs: { en: `Adverbs`, haw: `Nā ʻAʻano` },
    short_phrases: { en: `Short Phrases`, haw: `Nā ʻŌlelo Pōkole` },
    pronouns: { en: `Pronouns`, haw: `Nā Papani` },
    prepositions: { en: `Prepositions`, haw: `Nā ʻInawaena` },
    conjunctions: { en: `Conjunctions`, haw: `Nā Kuʻi` },
    interjections: { en: `Interjections`, haw: `Nā ʻŌlelo Hoʻōho` },
};

// Singular tag shown next to a word (e.g. "noun")
export const POS_TAGS = {
    nouns: `noun`,
    verbs: `verb`,
    adjectives: `adjective`,
    adverbs: `adverb`,
    short_phrases: `phrase`,
    pronouns: `pronoun`,
    prepositions: `preposition`,
    conjunctions: `conjunction`,
    interjections: `interjection`,
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

// The quiz needs at least 3 words (MIN_WORDS in quiz-engine.js); smaller sets get no quiz link
export const QUIZ_MIN_WORDS = 3;
export function quizHref(setId) {
    return `/pages/quiz.html?set=${encodeURIComponent(setId)}`;
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
