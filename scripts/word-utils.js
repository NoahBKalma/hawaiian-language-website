// Shared helpers. Must NOT import compile-words.js (that module blocks on a top-level await fetch).

// normalizes a word by removing kahako macrons and all apostrophies
export function normalize(word) {
    // NFD: decomposed, it seperates ō int o + macron
    // NFC: composed, one unicode for both
    let final = word.normalize("NFD").toLowerCase();
    // replace removes that extra created kahakō macron character
    // also removes all versions of an apostrophe or 'okina
    return final.replace(/[̄ʻ‘’'`ʼ]/g, "");
}

// Canonical form for comparing answers: composed characters (so "a" + combining macron
// equals "ā"), trimmed, single spaces, apostrophe look-alikes turned into the ʻokina
export function canonical(text) {
    return text.normalize(`NFC`).trim().replace(/\s+/g, ` `)
        .replace(/['‘’`ʼ]/g, `ʻ`).toLowerCase();
}

// Splits an English gloss on "/" into its alternatives ("beating/stroke"); tolerates non-strings
export function splitGlosses(english) {
    if (typeof english !== `string`) return [];
    return english.split(`/`).map(g => g.trim()).filter(g => g.length > 0);
}

// Frequency level labels. Hawaiian labels are English placeholders until the professor supplies terms.
export const FREQ_LEVELS = {
    5: { en: "Most Common", haw: "Most Common" },
    4: { en: "Common", haw: "Common" },
    3: { en: "Moderate", haw: "Moderate" },
    2: { en: "Less Common", haw: "Less Common" },
    1: { en: "Rare", haw: "Rare" }
};

// DOM-safe anchor id for a set id (ids contain `/` and `&`)
export function setAnchor(id) {
    return `set-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
