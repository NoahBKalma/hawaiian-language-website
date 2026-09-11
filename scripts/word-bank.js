import { allWords } from "/scripts/compile-words.js";

let currLanguage = `english`;

let nounsLink = document.getElementById(`nouns`);
let verbsLink = document.getElementById(`verbs`);
let adjectivesLink = document.getElementById(`adjectives`);
let adverbsLink = document.getElementById(`adverbs`);
let shortPhrasesLink = document.getElementById(`short-phrases`);
let pronounsLink = document.getElementById(`pronouns`);
let articlesLink = document.getElementById(`articles`);
let prepositionsLink = document.getElementById(`prepositions`);
let conjunctionsLink = document.getElementById(`conjunctions`);

let switchLanguageBtn = document.getElementById(`lang-toggle`);

const wordChoiceContainer = document.getElementById(`word-choice-container`);
const searchInput = document.getElementById(`search-bar`)
const searchButton = document.getElementById(`search-button`)
const searchForm = document.getElementById('search-container');

// Binds switch language button to function
switchLanguageBtn.addEventListener(`click`, switchLinkLanguages);

// Assigns all the labels into page links
function applyLinkLabels() {
    if(currLanguage === `english`) {
        nounsLink.innerHTML = `Nouns`;
        verbsLink.innerHTML = `Verbs`;
        adjectivesLink.innerHTML = `Adjectives`;
        adverbsLink.innerHTML = `Adverbs`;
        shortPhrasesLink.innerHTML = `Short Phrases`;
        pronounsLink.innerHTML = `Pronouns`;
        articlesLink.innerHTML = `Articles`;
        prepositionsLink.innerHTML = `Prepositions`;
        conjunctionsLink.innerHTML = `Conjunctions`;
    } else {
        nounsLink.innerHTML = `Nā Papani`;
        verbsLink.innerHTML = `Nā Hehele / Nā Hamani`;
        adjectivesLink.innerHTML = `Nā ʻAʻano`;
        adverbsLink.innerHTML = `Nā ʻŌlelo ʻĒ Aʻe`;
        shortPhrasesLink.innerHTML = `Nā ʻŌlelo Pōkole`;
        pronounsLink.innerHTML = `Nā Kaʻi`;
        articlesLink.innerHTML = `Nā Pilimua`;
        prepositionsLink.innerHTML = `Nā ʻAmi`;
        conjunctionsLink.innerHTML = `Nā Huipū`;
    }
}
// Switches languages then assigns all labels
function switchLinkLanguages() {
    currLanguage = currLanguage === `english` ? `hawaiian` : `english`;
    applyLinkLabels();
}

// Finds all words that contain string given as argument
function findWords(searchStr) {
    const query = searchStr.trim().toLowerCase();
    let resultList = [];

    for (const [key, category] of allWords) {
        for (const word of category.words) {
            // checks search against hawaiian and english
            const matchesHawaiian = word.hawaiian.toLowerCase().includes(query);
            const matchesEnglish = word.english.toLowerCase().includes(query);
            // Adds it to final list if it matches anything
            if (matchesHawaiian || matchesEnglish) {
                resultList.push({
                    hawaiian: word.hawaiian,
                    english: word.english,
                    category_hawaiian: category.category_hawaiian,
                    category_english: category.category_english
                });
            }
        }
    }

    return resultList;
}

// Check the URL for '?word=something' to load search word
const urlParams = new URLSearchParams(window.location.search);
const searchStr = urlParams.get('word');

// Re-apply your HTML changes after refresh       
if (searchStr) {
    console.log(findWords(searchStr)); // ADD SEARCH FUNCTIONALITY AND DISPLAY FOUND WORDS
    wordChoiceContainer.innerHTML = ``;
} else {
    wordChoiceContainer.innerHTML = `
        <div id="title-header">
            <h1 id="title" class="page-title-font">Word Bank</h1>
            <button id="lang-toggle">ʻŌlelo Hawaiʻi/English</button>
        </div>
        <a class="page-link" href="/pages/word-bank/nouns.html" id="nouns"></a>
        <a class="page-link" href="/pages/word-bank/verbs.html" id="verbs"></a>
        <a class="page-link" href="/pages/word-bank/adjectives.html" id="adjectives"></a>
        <a class="page-link" href="/pages/word-bank/adverbs.html" id="adverbs"></a>
        <a class="page-link" href="/pages/word-bank/short_phrases.html" id="short-phrases"></a>
        <a class="page-link" href="/pages/word-bank/pronouns.html" id="pronouns"></a>
        <a class="page-link" href="/pages/word-bank/articles.html" id="articles"></a>
        <a class="page-link" href="/pages/word-bank/prepositions.html" id="prepositions"></a>
        <a class="page-link" href="/pages/word-bank/conjunctions.html" id="conjunctions"></a>
    `
    
    // Because the page was refreshed, we need to reassign all remade elements

    switchLanguageBtn = document.getElementById(`lang-toggle`);
    switchLanguageBtn.addEventListener(`click`, switchLinkLanguages);

    nounsLink = document.getElementById(`nouns`);
    verbsLink = document.getElementById(`verbs`);
    adjectivesLink = document.getElementById(`adjectives`);
    adverbsLink = document.getElementById(`adverbs`);
    shortPhrasesLink = document.getElementById(`short-phrases`);
    pronounsLink = document.getElementById(`pronouns`);
    articlesLink = document.getElementById(`articles`);
    prepositionsLink = document.getElementById(`prepositions`);
    conjunctionsLink = document.getElementById(`conjunctions`);
    applyLinkLabels();
}


applyLinkLabels();