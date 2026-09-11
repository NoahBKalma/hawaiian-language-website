import { allWords } from "/scripts/compile-words.js";

let currLanguage = `hawaiian`;

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
const searchInput = document.getElementById(`search-bar`);
const resetButton = document.getElementById(`reset-button`);

// Binds switch language button to function
switchLanguageBtn.addEventListener(`click`, switchLinkLanguages);

// Fixes reset button
// There was an error after adding
// "searchInput.value = searchStr;" where reset stopped working
resetButton.addEventListener(`click`, () => {
    searchInput.value = ``;
    rebuildWordChoiceContainer();
});

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

// Check the URL for '?word=something' to load search word
const urlParams = new URLSearchParams(window.location.search);
const searchStr = urlParams.get('word');

// Holds the filtered categories + column layout for the current search,
// same roles as the wordGroups/leftSection/rightSection in word-bank-display.js
let lastCategory = null;
let wordGroups = new Map();
let leftSection = [];
let rightSection = [];

// Gets all words with search filter
function getWords(filterStr) {
    
    wordGroups = new Map();
    const filter = filterStr.toLowerCase();
    for(const [key, category] of allWords.entries()) { // go through all the categories
        console.log(category);
        const filteredCategory = category.words.filter(word =>
                                    word.hawaiian.toLowerCase().includes(filter) ||
                                    word.english.toLowerCase().includes(filter));
        if(filteredCategory.length > 0) { // only keep categories that had a match
            wordGroups.set(key, { ...category, words: filteredCategory });
        }
    }

    console.log(wordGroups);
    return wordGroups;
}

// Pushes a section to the html
function addSectionHawaiian(name, side, html) {
        let i = -1;
        if(side == `left`) i = 0;
        else if(side ==`right`) i = 1;

        let value = wordGroups.get(name);
        const isSubcategory = value.in_category_english!== ``;
        if(!isSubcategory) {
            // Add heading
            html[i] += `
                <span class="word-category-container">
                    <h2 class="word-category" lang="haw">${value.category_hawaiian}</h2>
                </span>
                <article class="words">
            `;
            lastCategory = null;
        } else {
            if(lastCategory == null) { // Add header only if it is the first entry of a subcategory
                html[i] += `
                    <span class="word-category-container">
                        <h2 class="word-category" lang="haw">${value.in_category_hawaiian}</h2>
                    </span>
                `;
                lastCategory = value.category_hawaiian;
            }
            html[i] += `
                <span class="word-subcategory-container">
                    <h3 class="word-subcategory" lang="haw">${value.category_hawaiian}</h3>
                </span>
                <article class="words">
            `;
        }
        
        // Add words regardless of category level
        for(let word of value.words) {
            html[i] += `
                <p lang="haw">${word.hawaiian}</p>
                <p>${word.english}</p>`;                    
        }
        html[i] += `</article>`

        return lastCategory;
}
function addSectionEnglish(name, side, html) {
        let i = -1;
        if(side == `left`) i = 0;
        else if(side ==`right`) i = 1;

        let value = wordGroups.get(name);
        const isSubcategory = value.in_category_english!== ``;
        if(!isSubcategory) {
            // Add heading
            html[i] += `
                <span class="word-category-container">
                    <h2 class="word-category">${value.category_english}</h2>
                </span>
                <article class="words">
            `;
            lastCategory = null;
        } else {
            if(lastCategory == null) { // Add header only if it is the first entry of a subcategory
                html[i] += `
                    <span class="word-category-container">
                        <h2 class="word-category">${value.in_category_english}</h2>
                    </span>
                `;
                lastCategory = value.category_english;
            }
            html[i] += `
                <span class="word-subcategory-container">
                    <h3 class="word-subcategory">${value.category_english}</h3>
                </span>
                <article class="words">
            `;
        }
        
        // Add words regardless of category level
        for(let word of value.words) {
            html[i] += `
                <p lang="haw">${word.hawaiian}</p>
                <p>${word.english}</p>`;                    
        }
        html[i] += `</article>`

        return lastCategory;
}

// Switch group languages
function switchLanguage(html) {
    currLanguage = currLanguage === `english` ? `hawaiian` : `english`;
    if(currLanguage == `english`) {
        // Pushes each section from the left side and right side depending on what the language setting is on
        lastCategory = null;
        for(let sectionName of leftSection) {
            lastCategory = addSectionEnglish(sectionName, `left`, html);
        }
        lastCategory = null;
        for(let sectionName of rightSection) {
            lastCategory = addSectionEnglish(sectionName, `right`, html);
        }
    } else {
        // Pushes each section from the left side and right side depending on what the language setting is on
        lastCategory = null;
        for(let sectionName of leftSection) {
            lastCategory = addSectionHawaiian(sectionName, `left`, html);
        }
        lastCategory = null;
        for(let sectionName of rightSection) {
            lastCategory = addSectionHawaiian(sectionName, `right`, html);
        }
    }    
    
    wordChoiceContainer.innerHTML = html[0]+`</div>`+html[1]+`</div></div>`;

    // Add listener to new button every time one is made
    const switchLangButton = document.querySelector(`#lang-toggle`);
    switchLangButton.addEventListener(`click`, () => {
        let freshHtml = [`
            <div id="title-header">
                <h1 id="title" class="page-title-font">Search Results</h1>
                <button id="lang-toggle">ʻŌlelo Hawaiʻi/English</button>
            </div>

            <div id="word-display">
            <div class="flex-word-container">
        `, `<div class="flex-word-container">`]; // Index 0 will be left side, index 1 will be right
        switchLanguage(freshHtml);
    });
}

// Displays categories or words if a search is entered       
if (searchStr) {
    getWords(searchStr);
    leftSection = [];
    rightSection = [];
    lastCategory = null;

    // Creates a new list with objects containing section name and sizes
    let sectionSizes = [];
    let totalWords = 0;
    for(let [key, value] of wordGroups) {
        const isSubcategory = value.in_category_english !== ``;
        totalWords += value.words.length;
        if(!isSubcategory){
            sectionSizes.push( {name: value.category_hawaiian, length: value.words.length, subcategory: false} );
            lastCategory = null;
        } else {
            if (lastCategory == null) {
                sectionSizes.push( {name: value.in_category_hawaiian, length: value.words.length, subcategory: true, children: [key]} );
                lastCategory = value.in_category_hawaiian;
            } else {
                sectionSizes[sectionSizes.length - 1].length += value.words.length;
                sectionSizes[sectionSizes.length - 1].children.push(key);
            }
        }
    }

    sectionSizes = sectionSizes.sort((a, b) => b.length-a.length);

    // Seperates each section into the left and right side, attempting to make it as equal as possible
    let leftSize = 0;
    for(let section of sectionSizes) {
        const leftIfAdded = leftSize + section.length;
        const rightIfAdded = (totalWords - leftSize) + section.length;

        if(leftIfAdded < rightIfAdded) {
            if(section.subcategory == false) {
                leftSection.push(section.name);
            } else {
                leftSection.push(...section.children);
            }
            leftSize += section.length;
        } else {
            if(section.subcategory == false) {
                rightSection.push(section.name);
            } else {
                rightSection.push(...section.children);
            }
        }
    }

    searchInput.value = searchStr;
    let htmlStr = [`
        <div id="title-header">
            <h1 id="title" class="page-title-font">Search Results</h1>
            <button id="lang-toggle">ʻŌlelo Hawaiʻi/English</button>
        </div>

        <div id="word-display">
        <div class="flex-word-container">
    `, `<div class="flex-word-container">`]; // Index 0 will be left side, index 1 will be right

    switchLanguage(htmlStr);

} else {
    rebuildWordChoiceContainer();
}

function rebuildWordChoiceContainer() {
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