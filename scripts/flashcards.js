// Puts all words into map by word type
import { adjectives, adverbs, articles, conjunctions, nouns, prepositions, pronouns, short_phrases, verbs } from "../scripts/compile-words.js";
import { isLoggedIn } from "./auth.js";

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

const setTitle = document.getElementById(`category-title`);

const wordListContainer = document.getElementById(`word-list`);
const wordList = document.getElementById(`word-list-entries`);

const wordLangToggleButton = document.getElementById(`lang-toggle-word-list`);
const setLangToggleButton = document.getElementById(`lang-toggle-sets`);

const otherSets = document.getElementById(`other-sets`);
const cardContainer = document.getElementById(`card-container`);
const fullscreenButton = document.getElementById(`fullscreen-button`);

// Flashcard variables
const progressBar = document.getElementById(`progress-bar`);
const numProgress = document.getElementById(`num-progress`);
const cardButton = document.getElementById(`card`);
const cardFrontLangDisplay = document.getElementById(`card-front-lang-display`);

const restartButton = document.getElementById(`restart-button`);
const previousButton = document.getElementById(`previous-button`);
const nextButton = document.getElementById(`next-button`);
const shuffleButton = document.getElementById(`shuffle-button`);
const spacedRepButton = document.getElementById(`spaced-repetition-button`);
const favoriteCardButton = document.getElementById(`favorite-set-button`);

let currWordList = [];
let origWordList = [];
let flashcardMap = new Map();

let flashcardIndex = 0;
let cardFrontLanguage = `hawaiian`;

/*
------------------------------------------------------------------------------
                    SET SELECTION/WORD LIST FUNCTIONALITY
------------------------------------------------------------------------------
*/

// Allows flashcards to go fullscreen
fullscreenButton.addEventListener(`click`, () => {
    otherSets.classList.toggle(`hidden`);
    wordListContainer.classList.toggle(`hidden`);
    cardContainer.classList.toggle(`fullscreen`);
    window.scrollTo({top: 0, behavior: `smooth`});
});

// Changes languages
let currWordLanguage = `hawaiian`;
let currSetLanguage = `hawaiian`;

function swapLanguage(langType) {
    return langType === `english` ? `hawaiian` : `english`;
}

wordLangToggleButton.addEventListener(`click`, () => {
    currWordLanguage = swapLanguage(currWordLanguage);
    setAllSetContainers();
});
setLangToggleButton.addEventListener(`click`, () => {
    currSetLanguage = swapLanguage(currSetLanguage);
    cardFrontLangDisplay.innerText = `Card Front Language: ${currSetLanguage[0].toUpperCase() + currSetLanguage.slice(1)}`;
    
    currSet = translateSetName(currSet, currSetLanguage);
    currCategory = translateSetName(currCategory, currSetLanguage);
    
    setAllSetContainers();
});

function updateTitle() {
    if(currSet) { setTitle.innerHTML = currSet; return; }
    if(currCategory) { setTitle.innerHTML = currCategory; return; }
    if(currType) { setTitle.innerHTML = currType.replaceAll(`_`, ` `); return; }
    setTitle.innerHTML = `Select Set`;
}

// Gets the containers for sets
const sameCategoryContainer = document.getElementById('same-category').querySelector('.set-choice-container');
const sameWordTypeContainer = document.getElementById('same-word-type').querySelector('.set-choice-container');
const diffWordTypesContainer = document.getElementById('different-word-types').querySelector('.set-choice-container');

let currSet = null;
let currCategory = null;
let currType = null;

let categoryList = new Map();

// Finds which word type a set is in (returns null if not found)
function findTypeForSet(setName) {
    for (const [wordType, wordsInType] of allWordsByType) {
        if (!wordsInType) continue;
        for (const [key, setObj] of wordsInType) {
            if (setObj[`category_hawaiian`] === setName ||
                setObj[`in_category_hawaiian`] === setName ||
                setObj[`category_english`] === setName ||
                setObj[`in_category_english`] === setName) { // Checks for hawaiian or english
                return setObj[`part_of_speech`];
            }
        }
    }
    return null;
}

// Translates set between hawaiian and english
function translateSetName(name, toLang) {
    if (!name) return name;
    const fromLang = toLang === `hawaiian` ? `english` : `hawaiian`;
    for (const [wordType, wordsInType] of allWordsByType) {
        if (!wordsInType) continue;
        for (const [setName, setObj] of wordsInType) {
            if (setObj[`category_${fromLang}`] === name) return setObj[`category_${toLang}`];
            if (setObj[`in_category_${fromLang}`] === name) return setObj[`in_category_${toLang}`];
        }
    }
    return name;
}

function updateContainerVisibility() {    
    if(currCategory === null) document.getElementById('same-category').classList.add(`hidden`);
    else document.getElementById('same-category').classList.remove(`hidden`);

    if(!sameWordTypeContainer.innerHTML.includes(`button`)) document.getElementById('same-word-type').classList.add(`hidden`);
    else document.getElementById('same-word-type').classList.remove(`hidden`);

}

function addSetButton(currHTML, setName, language) {
    currHTML += `<button id="${setName}" lang="${language}">${setName}</button>`;
    return currHTML;
}

// Calls the functions to set the containers for the different sets
// Also updates visibility of containers based on if there are sets to show or not
function setAllSetContainers() {
    currWordList = [];

    if(currSetLanguage === `hawaiian`) {
        setDifferentTypeSets(`hawaiian`);
        setSameTypeSets(`hawaiian`);
        setSameCategory(`hawaiian`);
    } else {
        setDifferentTypeSets(`english`);
        setSameTypeSets(`english`);
        setSameCategory(`english`);
    }
    updateTitle();

    writeWordList();
    
    updateContainerVisibility();
}

const titleTranslations = {
    nouns: { english: `Nouns`, hawaiian: `Nā Papani` },
    verbs: { english: `Verbs`, hawaiian: `Nā Hehele / Nā Hamani` },
    adjectives: { english: `Adjectives`, hawaiian: `Nā ʻAʻano` },
    adverbs: { english: `Adverbs`, hawaiian: `Nā ʻŌlelo ʻĒ Aʻe` },
    short_phrases: { english: `Short Phrases`, hawaiian: `Nā ʻŌlelo Pōkole` },
    pronouns: { english: `Pronouns`, hawaiian: `Nā Kaʻi` },
    articles: { english: `Articles`, hawaiian: `Nā Pilimua` },
    prepositions: { english: `Prepositions`, hawaiian: `Nā ʻAmi` },
    conjunctions: { english: `Conjunctions`, hawaiian: `Nā Huipū` },
};

// Buttons for switching word types
function setDifferentTypeSets(language) {
    let currButtonContainerHTML = ``;
    if(language === `english`) {
        allWordsByType.forEach((wordsInType, wordType) => {
            currButtonContainerHTML += `<button id="${wordType}">${titleTranslations[wordType].english}</button>`;
        });
    } else {
        allWordsByType.forEach((wordsInType, wordType) => {
            currButtonContainerHTML += `<button id="${wordType}" lang="haw">${titleTranslations[wordType].hawaiian}</button>`;
        });
    }
    diffWordTypesContainer.innerHTML = currButtonContainerHTML;
}

// Buttons for switching sets in a word type
function setSameTypeSets(language) {
    let currButtonContainerHTML = ``;
    categoryList = new Map();
    const langExtension = language === `hawaiian` ? `haw` : `en`;

    if(currType === null) {
        for(let [wordType, wordsInType] of allWordsByType) {
            allWordsByType.get(wordType).forEach((setObj, setName) => { // loops through each set in the word type
                if(setObj[`in_category_${language}`] !== ``) { // if the set is in a category
                    if(categoryList.has(setObj[`in_category_${language}`]) === true) { // if the category's button is already made
                        categoryList.get(setObj[`in_category_${language}`]).push(setObj[`category_${language}`]);
                    } else {
                        currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`in_category_${language}`], langExtension);
                        categoryList.set(setObj[`in_category_${language}`], [setObj[`category_${language}`]]);
                    }
                } else {
                    if(setObj[`category_${language}`] !== currSet) // Doesnt make button for the current set
                        currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`category_${language}`], langExtension);
                }
            });
        }
    }
    else {
        allWordsByType.get(currType).forEach((setObj, setName) => { // loops through each set in the word type
            if(setObj[`in_category_${language}`] !== ``) { // if the set is in a category
                if(categoryList.has(setObj[`in_category_${language}`]) === true) { // if the category's button is already made
                    categoryList.get(setObj[`in_category_${language}`]).push(setObj[`category_${language}`]);
                } else {
                    currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`in_category_${language}`], langExtension);
                    categoryList.set(setObj[`in_category_${language}`], [setObj[`category_${language}`]]);
                }
            } else {
                if(setObj[`category_${language}`] !== currSet) // Doesnt make button for the current set
                    currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`category_${language}`], langExtension);
            }
        });
    }
    sameWordTypeContainer.innerHTML = currButtonContainerHTML;
}

// Buttons for switching sets in the same category
function setSameCategory(language) {
    if(currType === null || currCategory === null) {
        sameCategoryContainer.innerHTML = ``;
        return;
    }
    let currButtonContainerHTML = ``;
    const langExtension = language === `hawaiian` ? `haw` : `en`;

    allWordsByType.get(currType).forEach((setObj, setName) => {
        if(setObj[`in_category_${language}`] === currCategory && setObj[`category_${language}`] !== currSet)
            currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`category_${language}`], langExtension);
    });
    sameCategoryContainer.innerHTML = currButtonContainerHTML;
}

// Links buttons
diffWordTypesContainer.addEventListener('click', (event) => {
    if(event.target.tagName === 'BUTTON') {
        currType = event.target.id;
        currCategory = null;
        currSet = null;
        setAllSetContainers();
        initializeFlashcard();
    }
});

sameWordTypeContainer.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON') {
        currSet = event.target.id;

        const foundType = findTypeForSet(currSet);
        if (foundType !== null) currType = foundType;

        if(categoryList.has(currSet)) currCategory = currSet;
        else currCategory = null;
        
        setAllSetContainers();
        initializeFlashcard();
    }
});

sameCategoryContainer.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON') {
        currSet = event.target.id;
        
        setAllSetContainers();
        initializeFlashcard();
    }
});

function addWordsToList(words, listHTML) {
    for(let word of words) {
        currWordList.push(word);
        if(currWordLanguage === `hawaiian`)
            listHTML += `<li>${word.hawaiian}</li>`;
        else
            listHTML += `<li>${word.english}</li>`;
    }
    return listHTML;
}

function writeWordList() {
    if(currType === null) return;
    let wordListHTML = ``;

    if(currCategory !== null && currSet !== null && currCategory !== currSet) {
        allWordsByType.get(currType).forEach((setObj, setName) => { // Set inside category
            if((setObj[`category_hawaiian`] === currSet || setObj[`category_english`] === currSet) &&
                (setObj[`in_category_hawaiian`] === currCategory || setObj[`in_category_english`] === currCategory)) {
                wordListHTML = addWordsToList(setObj[`words`], wordListHTML);
            }
        });
    } else if(currCategory === null && currSet !== null) { // Set outside of category
        allWordsByType.get(currType).forEach((setObj, setName) => {
            if(setObj[`category_hawaiian`] === currSet || setObj[`category_english`] === currSet) {
                wordListHTML = addWordsToList(setObj[`words`], wordListHTML);
            }
        });
    } else if(currCategory !== null && currSet !== null && currCategory === currSet) { // Only category
        allWordsByType.get(currType).forEach((setObj, setName) => {
            if(setObj[`in_category_hawaiian`] === currCategory || setObj[`in_category_english`] === currCategory) {
                wordListHTML = addWordsToList(setObj[`words`], wordListHTML);
            }
        });
    } else if(currCategory === null && currSet === null) { // Only type
        allWordsByType.get(currType).forEach((setObj, setName) => {
            wordListHTML = addWordsToList(setObj[`words`], wordListHTML);
        });
    }
    origWordList = [...currWordList];
    wordList.innerHTML = wordListHTML;
}

setAllSetContainers();
updateContainerVisibility();
cardFrontLangDisplay.innerText = `Card Front Language: ${currSetLanguage[0].toUpperCase() + currSetLanguage.slice(1)}`;


/*
------------------------------------------------------------------------------
                            FLASHCARD FUNCTIONALITY
------------------------------------------------------------------------------
*/

numProgress.innerText = `0 / 0`;

function swapCardLanguage() {
    cardFrontLanguage = (cardFrontLanguage === `hawaiian` ? `english` : `hawaiian`);
}

// Initializes the flashcard
function initializeFlashcard() {
    cardFrontLanguage = currSetLanguage;
    flashcardIndex = 0;

    if(currWordList.length > 0) {
        cardButton.textContent = currWordList[flashcardIndex][cardFrontLanguage];
        updateProgress();
    } else {
        cardButton.textContent = ``;
        numProgress.innerText = `0 / 0`;
        progressBar.style.width = `0%`;
    }
}

// Updates card total count and progress bar
function updateProgress() {
    numProgress.innerText = `${flashcardIndex+1} / ${currWordList.length}`;
    progressBar.style.width = `${(flashcardIndex+1)/currWordList.length * 100}%`;
}

// Updates the flashcard
function updateFlashcard() {
    cardButton.textContent = currWordList[flashcardIndex][currSetLanguage];
    updateProgress();
}

// Lets the card be flipped by clicking it or space
function flipCard() {
    if(currWordList.length > 0) {
        swapCardLanguage();
        cardButton.textContent = currWordList[flashcardIndex][cardFrontLanguage];
    }
}

restartButton.addEventListener(`click`, () => {
    flashcardIndex = 0;
    currWordList = [...origWordList];
    initializeFlashcard();
});

cardButton.addEventListener(`click`, () => {
    flipCard();
});

window.addEventListener(`keydown`, (event) => {
    if(event.key === `Enter`) {
        flipCard();
    }
});


// Buttons with keybinds
function nextCard() {
    if(currWordList.length > 0 && flashcardIndex < currWordList.length - 1) {
        flashcardIndex++;
        updateFlashcard();
    }
}

function previousCard() {
    if(currWordList.length > 0 && flashcardIndex > 0) {
        flashcardIndex--;
        updateFlashcard();
    }
}

nextButton.addEventListener(`click`, nextCard);

window.addEventListener(`keydown`, (event) => {
    if(event.key === `ArrowRight`) {
        nextCard();
    }
});

previousButton.addEventListener(`click`, previousCard);

window.addEventListener(`keydown`, (event) => {
    if(event.key === `ArrowLeft`) {
        previousCard();
    }
});

// Fisher-Yates Algorithm for shuffle
function shuffle(array) {
  for(let i = array.length - 1; i > 0; i--) {

    // Pick a random index from 0 to i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements array[i] and array[j]
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

shuffleButton.addEventListener(`click`, () => {
    currWordList = shuffle(currWordList);
    initializeFlashcard();
});


favoriteCardButton.addEventListener(`click`, () => {
    if(isLoggedIn()) {
        const response = await authFetch(`http://127.0.0.1:8000/login`,
                                            { /* fastAPI runs on port 8000 */
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json'
                                                },
                                                body: JSON.stringify({
                                                    email: username,
                                                    password: password
                                                })
                                            }
                                        );
        const data = await response.json()
    } else {

    }
})