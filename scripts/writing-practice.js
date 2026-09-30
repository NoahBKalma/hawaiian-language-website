import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    swapLanguage, shuffle, wordListContainer, otherSets, title,
    currSetLanguage, currSetKey, minFrequency
} from "/scripts/set-selection.js";
import { recordActivity, getSetBest } from "/scripts/progress.js";
import { normalize } from "/scripts/word-utils.js";

const practiceContainer = document.getElementById(`practice-container`);
const word = document.getElementById(`word`);
const wordTitle = document.getElementById(`word-title`);
const numProgress = document.getElementById(`num-progress`);
const progressBar = document.getElementById(`progress-bar`);
const wordInput = document.getElementById(`word-input`);
const maxStreakDisplay = document.getElementById(`max-streak`);
const currStreakDisplay = document.getElementById(`curr-streak`);
const errorPopup = document.getElementById(`error-popup`);

const fullscreenButton = document.getElementById(`fullscreen-button`);
const shuffleButton = document.getElementById(`shuffle-button`);
const restartButton = document.getElementById(`restart-button`);
const spacedRepButton = document.getElementById(`spaced-repetition-button`);


/*
------------------------------------------------------------------------------
                            BUTTON/KEY BINDINGS
------------------------------------------------------------------------------
*/

fullscreenButton.addEventListener(`click`, () => {
    otherSets.classList.toggle(`hidden`);
    wordListContainer.classList.toggle(`hidden`);
    practiceContainer.classList.toggle(`fullscreen`);
    window.scrollTo({top: 0, behavior: `smooth`});
});

shuffleButton.addEventListener(`click`, () => {
    setCurrWordList(shuffle(currWordList));
    fullRun = true;
    initializeSet();
});

restartButton.addEventListener(`click`, () => {
    setIndex = 0;
    setCurrWordList([...origWordList]);
    fullRun = true;
    initializeSet();
});

window.addEventListener(`keydown`, (event) => {
    if(event.key === `Enter`) {
        event.preventDefault(); // stops Enter from "clicking" a focused button
        checkWord();
    }
});


/*
------------------------------------------------------------------------------
                            WORD PRACTICE FUNCTIONALITY
------------------------------------------------------------------------------
*/

let setIndex = 0;
let currStreak = 0;
let fullRun = true;
let storedBest = 0;             // best streak saved on the server for this set
const sessionBest = {};         // best streak this page load, by set key

let translateTo = `hawaiian`;

// nearMiss: letters are right but a kahakō or ʻokina is missing/wrong
function makePopup(nearMiss = false) {
    if (nearMiss)
        errorPopup.innerHTML = `<p>Almost! Check your kahakō and ʻokina.</p>`;
    else if(currSetLanguage === `hawaiian`)
        errorPopup.innerHTML = `<p>Hewa. E hoʻāʻo hou.</p>`;
    else
        errorPopup.innerHTML = `<p>Incorrect. Try again.</p>`;
    errorPopup.classList.remove(`hidden`);
}

// Canonical form for comparing answers: composed characters (so "a" + combining macron
// equals "ā"), trimmed, single spaces, apostrophe look-alikes turned into the ʻokina
function canonical(text) {
    return text.normalize(`NFC`).trim().replace(/\s+/g, ` `)
        .replace(/['‘’`ʼ]/g, `ʻ`).toLowerCase();
}

function hidePopup() {
    errorPopup.classList.add(`hidden`);
}

// Initializes word list for practice set
function initializeSet() {
    resetStreak();
    loadBest();
    hidePopup();
    setIndex = 0;

    if (currWordList.length === 0) { // guard for empty set
        numProgress.innerText = `0 / 0`;
        progressBar.style.width = `0%`;
        showEmptyHint();
        return;
    }

    showWord();
}
setOnSetChange(() => {
    fullRun = true;
    initializeSet();
});

function incrementStreak() {
    currStreak++;
    currStreakDisplay.innerHTML= `Curr Streak<br>${currStreak}`;
    if (currSetKey !== null && currStreak > (sessionBest[currSetKey] ?? 0)) {
        sessionBest[currSetKey] = currStreak;
        renderBest();
    }
}

function renderBest() {
    const best = Math.max(sessionBest[currSetKey] ?? 0, storedBest);
    maxStreakDisplay.innerHTML = `Max Streak<br>${best}`;
}

// Shows the session best right away, then the saved best once it arrives
function loadBest() {
    storedBest = 0;
    if (currSetKey === null) {
        maxStreakDisplay.innerHTML = `Max Streak<br>0`;
        return;
    }
    renderBest();
    const key = currSetKey;
    getSetBest(key).then(res => {
        if (!res || res.set_key !== currSetKey || key !== currSetKey) return;
        storedBest = res.best ?? 0;
        renderBest();
    }).catch(() => {});
}

function resetStreak() {
    currStreak = 0;
    currStreakDisplay.innerHTML= `Curr Streak<br>0`;
}

// Updates card total count and progress bar
function updateProgress() {
    numProgress.innerText = `${setIndex} / ${currWordList.length}`;
    progressBar.style.width = `${(setIndex) / currWordList.length * 100}%`;
}

function showWord() {
    updateProgress();
    word.classList.remove(`word-hint`);
    word.innerText = currWordList[setIndex][swapLanguage(translateTo)];
    wordTitle.innerText = `Translate to ${title(translateTo)}`;
}

function checkWord() {
    if (currWordList.length === 0) return; // check for empty set
    if (setIndex >= currWordList.length) return; // set already complete

    const answer = currWordList[setIndex][translateTo];
    if (canonical(wordInput.value) === canonical(answer)) {
        incrementStreak();
        recordActivity({
            type: `word_correct`,
            set_key: currSetKey,
            streak: currStreak,
            set_size: origWordList.length,
            full_set: fullRun && minFrequency === 1
        });
        hidePopup();
        setIndex++;
        if (setIndex < currWordList.length) {
            showWord();
            wordInput.value = ``;
        } else {
            wordInput.value = ``;
            word.innerText = `Complete!`;
            wordTitle.innerText = ``;
            updateProgress();
            // Any frequency filter level counts; each (set, level) is counted once by the server
            if (fullRun && currSetKey !== null) {
                recordActivity({type: `set_completed`, set_key: currSetKey, full_set: true, min_frequency: minFrequency});
            }
        }
    } else {
        resetStreak();
        // same letters once diacritics are ignored → point at the kahakō/ʻokina
        const nearMiss = translateTo === `hawaiian` && normalize(wordInput.value.trim()) === normalize(answer);
        makePopup(nearMiss);
    }

}
// Empty deck: tell the user where to go instead of showing a blank prompt
function showEmptyHint() {
    word.classList.add(`word-hint`);
    word.innerText = currSetKey === null ? `Pick a set below to start` : `No words to show in this set`;
    wordTitle.innerText = ``;
}

// Loads the set from the URL (?set= / ?setName=) on page load
if (currSetKey !== null) initializeSet();
else showEmptyHint();
