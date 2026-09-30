// Vocab hub: pathway cards + global search.
import { initVocabSearch } from "/scripts/vocab-search.js";

const pathways = document.getElementById(`vocab-pathways`);

initVocabSearch({
    form: document.getElementById(`search-container`),
    input: document.getElementById(`search-bar`),
    results: document.getElementById(`search-results`),
    onToggle: active => { pathways.hidden = active; },
});
