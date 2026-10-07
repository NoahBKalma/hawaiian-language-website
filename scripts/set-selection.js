/*

Every practice page must include #category-title or it will break

Load order:
    <script src="/components/practice-sets.js" type="module"></script>
    <script src="/scripts/set-selection.js" type="module"></script>


IMPORT STATEMENT:
import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    currSetLanguage, title, swapLanguage, shuffle,
    wordListContainer, otherSets,
    currSetKey, minFrequency, currSetDisplayNames
} from "/scripts/set-selection.js";

currSetKey: single set -> its id; whole category -> `cat:<pos>/<in_category_english>`;
    whole type -> `type:<pos>`; frequency set -> `freq-N`; null when nothing selected.
    The same forms are accepted by the ?set= URL parameter (?minFreq=N preselects the frequency filter).

Connect setOnSetChange in html files to run on flashcard change

*/

// Puts all words into map by word type
import { adjectives, adverbs, articles, conjunctions, nouns, prepositions, pronouns, short_phrases, verbs, setsById, allWordEntries } from "../scripts/compile-words.js";
import { FREQ_LEVELS } from "../scripts/word-utils.js";
import { POS_LABELS, escapeHtml } from "../scripts/vocab-shared.js";
import { getPref, setPref } from "/scripts/prefs.js";

// Flashcards and writing practice remember their own choices (card front vs set names are different settings)
const PAGE = document.getElementById(`card`) ? `flashcards` : `writing`;

// Display names of each word type, plus the frequency pseudo type
const TYPE_LABELS = { ...POS_LABELS, frequency: { en: `Frequency Sets`, haw: `Frequency Sets` } };

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

// Frequency sets: synthetic sets registered as a pseudo word type so the rest of the code treats them like any other type
const frequencySets = new Map();
for (let level = 5; level >= 1; level--) {
    const words = allWordEntries.filter(entry => entry.frequency === level);
    if (words.length === 0) continue;
    frequencySets.set(`freq-${level}`, {
        id: `freq-${level}`,
        category_english: `${FREQ_LEVELS[level].en} (${level})`,
        category_hawaiian: `${FREQ_LEVELS[level].haw} (${level})`,
        in_category_english: ``,
        in_category_hawaiian: ``,
        part_of_speech: `frequency`,
        words
    });
}
allWordsByType.set(`frequency`, frequencySets);

const setTitle = document.getElementById(`category-title`);

export const wordListContainer = document.getElementById(`word-list`);
const wordList = document.getElementById(`word-list-entries`);

const wordLangToggleButton = document.getElementById(`lang-toggle-word-list`);
const setLangToggleButton = document.getElementById(`lang-toggle-sets`);

export const otherSets = document.getElementById(`other-sets`);
const cardFrontLangDisplay = document.getElementById(`card-front-lang-display`);

const frequencyFilter = document.getElementById(`frequency-filter`);
const frequencyCount = document.getElementById(`frequency-count`);

export let currWordList = [];
export let origWordList = [];

// Lets a practice script replace the word list (imported bindings are read-only)
export function setCurrWordList(list) { currWordList = list; }

// Whichever practice script is loaded registers itself here
let onSetChange = () => {};
export function setOnSetChange(fn) { onSetChange = fn; }

/*
------------------------------------------------------------------------------
                    SET SELECTION/WORD LIST FUNCTIONALITY
------------------------------------------------------------------------------
*/

// Changes languages
let currWordLanguage = `hawaiian`;
const savedLang = getPref(`lang:${PAGE}`);
export let currSetLanguage = savedLang === `english` ? `english` : `hawaiian`;

export function swapLanguage(langType) {
    return langType === `english` ? `hawaiian` : `english`;
}

// Toggle buttons say what they control and the current language
function updateToggleLabels() {
    const name = lang => lang === `hawaiian` ? `Hawaiian` : `English`;
    wordLangToggleButton.textContent = `Word list: ${name(currWordLanguage)}`;
    // Flashcards: sets the card front language; writing practice: only the set names
    const what = document.getElementById(`card`) ? `Card front` : `Set names`;
    setLangToggleButton.textContent = `${what}: ${name(currSetLanguage)}`;
}

wordLangToggleButton.addEventListener(`click`, () => {
    currWordLanguage = swapLanguage(currWordLanguage);
    updateToggleLabels();
    setAllSetContainers();
});
setLangToggleButton.addEventListener(`click`, () => {
    currSetLanguage = swapLanguage(currSetLanguage);
    setPref(`lang:${PAGE}`, currSetLanguage);
    updateToggleLabels();
    cardFrontLangDisplay.innerText = `Card Front Language: ${currSetLanguage[0].toUpperCase() + currSetLanguage.slice(1)}`;
    setAllSetContainers();
});

// Capitalizes first letter in each word
export function title(str) {
    const titleStrArray = str.split(` `);
    let titleStr = ``;

    titleStrArray.forEach(word => {
        titleStr += word.charAt(0).toUpperCase() + word.slice(1) + ` `;
    });

    return titleStr.trim();
}

function updateTitle() {
    if(currSet) { setTitle.innerHTML = currSet; return; }
    if(currCategory) { setTitle.innerHTML = currCategory; return; }
    if(currType) { setTitle.innerHTML = title(currType.replace(/_/g, ` `)); return; }
    setTitle.innerHTML = `Select Set`;
}

// "Resume where you left off": the last set opened on this page, shown while no set is picked
const resumeLink = document.createElement(`p`);
resumeLink.className = `resume-link`;
resumeLink.hidden = true;
setTitle.after(resumeLink);

function rememberLastSet() {
    if (currSetKey !== null) setPref(`lastSet:${PAGE}`, { key: currSetKey, minFreq: minFrequency, name: setTitle.textContent });
    const saved = getPref(`lastSet:${PAGE}`);
    if (currSetKey !== null || !saved?.key) { resumeLink.hidden = true; return; }
    const link = document.createElement(`a`);
    link.href = `${window.location.pathname}?set=${encodeURIComponent(saved.key)}&minFreq=${saved.minFreq || 1}`;
    link.textContent = `Resume where you left off: ${saved.name}`;
    resumeLink.textContent = ``;
    resumeLink.append(link);
    resumeLink.hidden = false;
}

// Gets the containers for sets
const sameCategoryContainer = document.getElementById('same-category').querySelector('.set-choice-container');
const sameWordTypeContainer = document.getElementById('same-word-type').querySelector('.set-choice-container');
const diffWordTypesContainer = document.getElementById('different-word-types').querySelector('.set-choice-container');

/*
Selection state is language independent:
    selType   - word type (or `frequency`) or null
    selCat    - English name of the selected category or null
    selSetId  - id of the selected set or null
The exported names below are derived from it for display.
*/
let selType = null;
let selCat = null;
let selSetId = null;

let currSet = null;              // display name of the set (or of the category when a whole category is selected)
let currCategory = null;         // display name of the category
let currType = null;             // same as selType

export let currSetKey = null;
export let minFrequency = 1;
let filterSetting = 1;           // what the user picked in the filter chips

function findSet(id) {
    return setsById.get(id) ?? frequencySets.get(id) ?? null;
}

function typeHasSets(type) {
    return (allWordsByType.get(type)?.size ?? 0) > 0;
}

function selectSet(setObj) {
    selType = setObj[`part_of_speech`];
    selCat = setObj[`in_category_english`] === `` ? null : setObj[`in_category_english`];
    selSetId = setObj.id;
}

// Checks parameters to see if a set is selected
const parameters = new URLSearchParams(window.location.search);
if (window.location.search.length > 1) {   // URLSearchParams.size is missing on iOS < 17
    const minFreqParam = parseInt(parameters.get(`minFreq`), 10);
    if (minFreqParam >= 1 && minFreqParam <= 5) filterSetting = minFreqParam;   // before the word list is built

    const setKey = parameters.get(`set`);
    const setName = parameters.get(`setName`);   // legacy: hawaiian name of set

    if (setKey !== null) {
        if (findSet(setKey) !== null) {
            selectSet(findSet(setKey));
        } else if (setKey.startsWith(`cat:`)) {
            const slash = setKey.indexOf(`/`);
            const pos = setKey.slice(4, slash);
            const catName = setKey.slice(slash + 1);
            if (slash > 0 && pos !== `frequency` && [...(allWordsByType.get(pos)?.values() ?? [])].some(s => s[`in_category_english`] === catName)) {
                selType = pos;
                selCat = catName;
            }
        } else if (setKey.startsWith(`type:`)) {
            const pos = setKey.slice(5);
            if (typeHasSets(pos)) selType = pos;
        }
    } else if (setName !== null) {
        let done = false;
        for (const [wordType, wordsInType] of allWordsByType) {
            if (wordType === `frequency`) continue;
            for (const [key, setObj] of wordsInType) {
                if (setObj[`category_hawaiian`] === setName) { // Set (inside or outside a category)
                    selectSet(setObj);
                    done = true;
                    break;
                } else if (setObj[`in_category_hawaiian`] === setName) { // Whole category
                    selType = wordType;
                    selCat = setObj[`in_category_english`];
                    done = true;
                    break;
                }
            }

            if (done) break;
        }
    }
}

// Hawaiian and English names of a category in a type
function categoryNames(type, catEng) {
    for (const setObj of allWordsByType.get(type).values()) {
        if (setObj[`in_category_english`] === catEng) return { haw: setObj[`in_category_hawaiian`], eng: setObj[`in_category_english`] };
    }
    return { haw: catEng, eng: catEng };
}

// {haw, eng} display names of the current selection (for the backend set_name_haw / set_name_eng)
export function currSetDisplayNames() {
    if (selSetId !== null) {
        const setObj = findSet(selSetId);
        return { haw: setObj[`category_hawaiian`], eng: setObj[`category_english`] };
    }
    if (selType !== null && selCat !== null) return categoryNames(selType, selCat);
    if (selType !== null) {
        const names = TYPE_LABELS[selType];
        return { haw: names.haw, eng: names.en };
    }
    return { haw: ``, eng: `` };
}

// Recomputes the exported selection variables from the selection state
function refreshSelection() {
    currType = selType;
    minFrequency = selType === `frequency` ? 1 : filterSetting;

    if (selType === null) currSetKey = null;
    else if (selSetId !== null) currSetKey = selSetId;
    else if (selCat !== null) currSetKey = `cat:${selType}/${selCat}`;
    else currSetKey = `type:${selType}`;

    const lang = currSetLanguage === `hawaiian` ? `haw` : `eng`;
    currCategory = selType !== null && selCat !== null ? categoryNames(selType, selCat)[lang] : null;
    if (selSetId !== null) currSet = currSetDisplayNames()[lang];
    else currSet = currCategory;
}

function updateContainerVisibility() {
    if(currCategory === null) document.getElementById('same-category').classList.add(`hidden`);
    else document.getElementById('same-category').classList.remove(`hidden`);

    if(!sameWordTypeContainer.innerHTML.includes(`button`)) document.getElementById('same-word-type').classList.add(`hidden`);
    else document.getElementById('same-word-type').classList.remove(`hidden`);

}

// attrs: {type, setId, category}; only the ones that are defined get written
function addSetButton(currHTML, label, language, attrs) {
    let dataAttrs = ` data-type="${escapeHtml(attrs.type)}"`;
    if (attrs.setId !== undefined) dataAttrs += ` data-set-id="${escapeHtml(attrs.setId)}"`;
    if (attrs.category !== undefined) dataAttrs += ` data-category="${escapeHtml(attrs.category)}"`;
    const index = Math.min((currHTML.match(/<button/g) ?? []).length, 10); // stagger index for the reveal animation
    currHTML += `<button class="reveal" style="--i:${index}" lang="${language}"${dataAttrs}>${label}</button>`;
    return currHTML;
}

// Calls the functions to set the containers for the different sets
// Also updates visibility of containers based on if there are sets to show or not
function setAllSetContainers() {
    currWordList = [];
    refreshSelection();

    setDifferentTypeSets(currSetLanguage);
    setSameTypeSets(currSetLanguage);
    setSameCategory(currSetLanguage);
    updateTitle();
    rememberLastSet();

    writeWordList();
    updateFilterUI();

    updateContainerVisibility();
}

// Buttons for switching word types (types with no sets, e.g. articles, are hidden)
function setDifferentTypeSets(language) {
    let currButtonContainerHTML = ``;
    let shown = 0;
    allWordsByType.forEach((wordsInType, wordType) => {
        if(wordsInType.size === 0) return;
        const stagger = `class="reveal" style="--i:${Math.min(shown++, 10)}"`;
        const label = language === `english` ? TYPE_LABELS[wordType].en : TYPE_LABELS[wordType].haw;
        const lang = language === `english` ? `` : ` lang="haw"`;
        currButtonContainerHTML += `<button ${stagger} id="${wordType}" data-type="${wordType}"${lang}>${label}</button>`;
    });
    diffWordTypesContainer.innerHTML = currButtonContainerHTML;
}

// Buttons for switching sets in a word type
function setSameTypeSets(language) {
    let currButtonContainerHTML = ``;
    const seenCategories = new Set();
    const langExtension = language === `hawaiian` ? `haw` : `en`;

    const addSetsOfType = (wordType) => {
        allWordsByType.get(wordType).forEach((setObj) => { // loops through each set in the word type
            const categoryEnglish = setObj[`in_category_english`];
            if(categoryEnglish !== ``) { // if the set is in a category
                if(!seenCategories.has(`${wordType}/${categoryEnglish}`)) { // one button per category
                    seenCategories.add(`${wordType}/${categoryEnglish}`);
                    currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`in_category_${language}`], langExtension,
                        { type: wordType, category: categoryEnglish });
                }
            } else if(setObj.id !== selSetId) { // Doesnt make button for the current set
                currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`category_${language}`], langExtension,
                    { type: wordType, setId: setObj.id });
            }
        });
    };

    if(currType === null) {
        for(const wordType of allWordsByType.keys()) {
            if(wordType !== `frequency`) addSetsOfType(wordType);
        }
    }
    else {
        addSetsOfType(currType);
    }
    sameWordTypeContainer.innerHTML = currButtonContainerHTML;
}

// Buttons for switching sets in the same category
function setSameCategory(language) {
    if(currType === null || selCat === null) {
        sameCategoryContainer.innerHTML = ``;
        return;
    }
    let currButtonContainerHTML = ``;
    const langExtension = language === `hawaiian` ? `haw` : `en`;

    allWordsByType.get(currType).forEach((setObj) => {
        if(setObj[`in_category_english`] === selCat && setObj.id !== selSetId)
            currButtonContainerHTML = addSetButton(currButtonContainerHTML, setObj[`category_${language}`], langExtension,
                { type: currType, setId: setObj.id });
    });
    sameCategoryContainer.innerHTML = currButtonContainerHTML;
}

// Links buttons (identity comes from data-* attributes, never from the button text)
diffWordTypesContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if(button) {
        selType = button.dataset.type;
        selCat = null;
        selSetId = null;
        setAllSetContainers();
        onSetChange();
    }
});

sameWordTypeContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) {
        selType = button.dataset.type;
        if(button.dataset.setId !== undefined) { // a set outside of any category
            selSetId = button.dataset.setId;
            selCat = null;
        } else { // a whole category
            selCat = button.dataset.category;
            selSetId = null;
        }

        setAllSetContainers();
        onSetChange();
    }
});

sameCategoryContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) {
        selSetId = button.dataset.setId;

        setAllSetContainers();
        onSetChange();
    }
});

if (frequencyFilter) {
    frequencyFilter.addEventListener('click', (event) => {
        const chip = event.target.closest('button[data-min]');
        if (!chip) return;
        filterSetting = parseInt(chip.dataset.min, 10);
        setAllSetContainers();
        onSetChange();
    });
}

// Filter chips are only for real word types; frequency sets already are a frequency
function updateFilterUI() {
    if (!frequencyFilter) return;
    frequencyFilter.classList.toggle(`hidden`, currType === null || currType === `frequency`);
    frequencyFilter.querySelectorAll(`button[data-min]`).forEach(chip => {
        const active = parseInt(chip.dataset.min, 10) === filterSetting;
        chip.setAttribute(`aria-pressed`, active);
        chip.classList.toggle(`active`, active);
    });
}

// Sets that make up the current selection
function selectedSets() {
    if(selType === null) return [];
    if(selSetId !== null) return [findSet(selSetId)];
    const sets = [...allWordsByType.get(selType).values()];
    if(selCat !== null) return sets.filter(setObj => setObj[`in_category_english`] === selCat);
    return sets;
}

// True when exactly one set is selected (spaced repetition works on one set at a time)
export function isSingleSet() {
    return selSetId !== null;
}

function writeWordList() {
    if(currType === null) {
        if(frequencyCount) frequencyCount.textContent = ``;
        return;
    }
    let wordListHTML = ``;
    let totalWords = 0;

    for(const setObj of selectedSets()) {
        for(const word of setObj[`words`]) {
            totalWords++;
            if(word.frequency < minFrequency) continue; // frequency filter (applied before origWordList is captured)
            currWordList.push(word);
            wordListHTML += `<li>${currWordLanguage === `hawaiian` ? word.hawaiian : word.english}</li>`;
        }
    }

    if(currWordList.length === 0 && totalWords > 0)
        wordListHTML = `<li class="empty-message">No words at this level — try a lower frequency.</li>`;
    if(frequencyCount) frequencyCount.textContent = `${currWordList.length} of ${totalWords} words`;

    origWordList = [...currWordList];
    wordList.innerHTML = wordListHTML;
}

// Fisher-Yates Algorithm for shuffle
export function shuffle(array) {
  for(let i = array.length - 1; i > 0; i--) {

    // Pick a random index from 0 to i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements array[i] and array[j]
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

setAllSetContainers();
cardFrontLangDisplay.innerText = `Card Front Language: ${currSetLanguage[0].toUpperCase() + currSetLanguage.slice(1)}`;

updateToggleLabels();
// The set chooser starts open only when no set is picked yet
otherSets.open = currSetKey === null;
