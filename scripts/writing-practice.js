import { adjectives, adverbs, articles, conjunctions, nouns, prepositions, pronouns, short_phrases, verbs } from "../scripts/compile-words.js";

const allWordsByType = new Map([
    [`adjectives`, adjectives],
    [`adverbs`, adverbs],
    [`articles`, articles],
    [`conjunctions`, conjunctions],
    [`nouns`, nouns],
    [`prepositions`, prepositions],
    [`pronouns`, pronouns],
    [`short_phrases`, short_phrases],
    [`verbs`, verbs]
]);

const setTitle = document.getElementById(`set-title`);

