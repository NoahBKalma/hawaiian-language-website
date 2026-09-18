import { isLoggedIn, authFetch } from "/scripts/auth.js";
import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    currSet, currSetLanguage, translateSetName, shuffle,
    wordListContainer, otherSets
} from "/scripts/set-selection.js";

const cardContainer = document.getElementById(`card-container`);
const fullscreenButton = document.getElementById(`fullscreen-button`);

const progressBar = document.getElementById(`progress-bar`);
const numProgress = document.getElementById(`num-progress`);
const cardButton = document.getElementById(`card`);

const restartButton = document.getElementById(`restart-button`);
const previousButton = document.getElementById(`previous-button`);
const nextButton = document.getElementById(`next-button`);
const shuffleButton = document.getElementById(`shuffle-button`);
const spacedRepButton = document.getElementById(`spaced-repetition-button`);
const favoriteCardButton = document.getElementById(`favorite-set-button`);
const favoriteCardImg = document.querySelector('#favorite-set-button img');

let flashcardIndex = 0;
let cardFrontLanguage = `hawaiian`;

// Allows flashcards to go fullscreen
fullscreenButton.addEventListener(`click`, () => {
    otherSets.classList.toggle(`hidden`);
    wordListContainer.classList.toggle(`hidden`);
    cardContainer.classList.toggle(`fullscreen`);
    window.scrollTo({top: 0, behavior: `smooth`});
});

/*
------------------------------------------------------------------------------
                            FLASHCARD FUNCTIONALITY
------------------------------------------------------------------------------
*/

numProgress.innerText = `0 / 0`;

function swapCardLanguage() {
    cardFrontLanguage = (cardFrontLanguage === `hawaiian` ? `english` : `hawaiian`);
}

// Initializes the flashcard when a new word list is selected
async function initializeFlashcard() {
    cardFrontLanguage = currSetLanguage;
    flashcardIndex = 0;

    // Sets the progress bar length and the first icon
    if(currWordList.length > 0) {
        cardButton.textContent = currWordList[flashcardIndex][cardFrontLanguage];
        updateProgress();
    } else {
        cardButton.textContent = ``;
        numProgress.innerText = `0 / 0`;
        progressBar.style.width = `0%`;
    }
    
    // Adds guard for logged out users
    if(!isLoggedIn()) { return; }

    const response = await authFetch(`http://127.0.0.1:8000/favorites`,
                                        { /* fastAPI runs on port 8000 */
                                            method: 'GET',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            }
                                        }
                                    );
    const data = await response.json();

    // Sets the favorite icon to indicate favorited
    const currSetEnglish = translateSetName(currSet, `english`);
    if(data.favorites.some(favSet => favSet.set_name === currSetEnglish)) {
        favoriteCardImg.src = `/assets/icons/favorited-icon.svg`;
    } else {
        favoriteCardImg.src = `/assets/icons/not-favorited-icon.svg`;
    }
}

// Connects with the set selection module
setOnSetChange(initializeFlashcard);

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
    setCurrWordList([...origWordList]);
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

shuffleButton.addEventListener(`click`, () => {
    setCurrWordList(shuffle(currWordList));
    initializeFlashcard();
});


favoriteCardButton.addEventListener(`click`, toggleFavorite);

async function toggleFavorite() {
    
    let setName  = translateSetName(currSet, `english`);

    if(!isLoggedIn()) { return; }

    const response = await authFetch(`http://127.0.0.1:8000/favorites`,
                                        { /* fastAPI runs on port 8000 */
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                set_name: setName,
                                            })
                                        }
                                    );
    const data = await response.json();
    if(data.favorited === `unfavorited`) {
        favoriteCardImg.src = `/assets/icons/not-favorited-icon.svg`;
    } else {
        favoriteCardImg.src = `/assets/icons/favorited-icon.svg`;
    }
    
    return;
}

function setCorrectFavoriteImg() {

}