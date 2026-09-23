import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    swapLanguage, shuffle, wordListContainer, otherSets, title,
    currSetLanguage
} from "/scripts/set-selection.js";

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
    initializeSet();
});

restartButton.addEventListener(`click`, () => {
    setIndex = 0;
    setCurrWordList([...origWordList]);
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
let maxStreak = 0;

let translateTo = `hawaiian`;

function makePopup() {
    if(currSetLanguage === `hawaiian`)
        errorPopup.innerHTML = `<p>Hewa. E ho'a'o hou.</p>`;
    else
        errorPopup.innerHTML = `<p>Incorrect. Try again.</p>`;
    errorPopup.classList.remove(`hidden`);
}

function hidePopup() {
    errorPopup.classList.add(`hidden`);
}

// Initializes word list for practice set
function initializeSet() {

    resetStreak();
    hidePopup();

    if (currWordList.length === 0) { // guard for empty set
        setIndex = 0;

        numProgress.innerText = `0 / 0`;
        progressBar.style.width = `0%`;
        word.innerText = ``;
        wordTitle.innerText = ``;
        return;
    }

    setIndex = 0;

    updateProgress();

    word.innerText = currWordList[setIndex][swapLanguage(translateTo)];
    wordTitle.innerText = `Translate to ${title(translateTo)}`;
}
setOnSetChange(initializeSet);

function incrementStreak() {
    currStreak++;
    currStreakDisplay.innerHTML= `Curr Streak<br>${currStreak}`;
    if (currStreak > maxStreak) {
        maxStreak = currStreak;
        maxStreakDisplay.innerHTML= `Max Streak<br>${maxStreak}`;
    }
    
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

function updateWord() {
    updateProgress();
    word.innerText = currWordList[setIndex][swapLanguage(translateTo)];
    wordTitle.innerText = `Translate to ${title(translateTo)}`;
    wordInput.value = ``;
}

function checkWord() {
    if (currWordList.length === 0) return; // check for empty set

    if (wordInput.value.toLowerCase() === currWordList[setIndex][translateTo].toLowerCase()) {
        incrementStreak();
        hidePopup();
        setIndex++;
        if (setIndex < currWordList.length) {
            updateWord();
        } else {
            wordInput.value = ``;
            word.innerText = `Complete!`;
            wordTitle.innerText = ``;
            updateProgress();
        }
    } else {
        resetStreak();
        makePopup();
    }

}