import { API_BASE_URL } from "/scripts/config.js";
import { isLoggedIn, authFetch } from "/scripts/auth.js";
import { prefersReducedMotion } from "/scripts/word-utils.js";
import { recordActivity } from "/scripts/progress.js";
import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    currSetKey, minFrequency, currSetDisplayNames, currSetLanguage,
    shuffle, wordListContainer, otherSets
} from "/scripts/set-selection.js";

const cardContainer = document.getElementById(`card-container`);
const fullscreenButton = document.getElementById(`fullscreen-button`);

const progressBar = document.getElementById(`progress-bar`);
const numProgress = document.getElementById(`num-progress`);
const cardButton = document.getElementById(`card`);
const cardInner = cardButton.querySelector(`.card-inner`);
const cardFront = cardButton.querySelector(`.card-face.front`);
const cardBack = cardButton.querySelector(`.card-face.back`);
const cardBadge = cardButton.querySelector(`.card-badge`);

const tallyCorrectEl = document.getElementById(`tally-correct`);
const tallyIncorrectEl = document.getElementById(`tally-incorrect`);
const tallyRemainingEl = document.getElementById(`tally-remaining`);
const gradeCorrectButton = document.getElementById(`grade-correct`);
const gradeIncorrectButton = document.getElementById(`grade-incorrect`);
const deckSummary = document.getElementById(`deck-summary`);
const summaryScore = document.getElementById(`summary-score`);
const summaryUngraded = document.getElementById(`summary-ungraded`);
const reviewMissedButton = document.getElementById(`review-missed`);
const restartAllButton = document.getElementById(`restart-all`);

const restartButton = document.getElementById(`restart-button`);
const previousButton = document.getElementById(`previous-button`);
const nextButton = document.getElementById(`next-button`);
const shuffleButton = document.getElementById(`shuffle-button`);
const saveContinueSetButton = document.getElementById(`save-continue-button`);
const favoriteCardButton = document.getElementById(`favorite-set-button`);
const favoriteCardImg = document.querySelector('#favorite-set-button img');
const message = document.getElementById(`message`);

const DRAG_THRESHOLD_PX = 6;
const SWIPE_FRACTION = 0.3;
const SWIPE_VELOCITY = 0.5;     // px per ms
const FLY_MS = 250;

let flashcardIndex = 0;
let cardFrontLanguage = `hawaiian`;
let grades = [];                // 'correct' | 'incorrect' | null per card in currWordList
let summaryOpen = false;
let busy = false;               // true while a graded card is flying off
let fullRun = true;             // false once the deck is narrowed to missed cards

const parameters = new URLSearchParams(window.location.search);
flashcardIndex = parameters.get(`currIndex`);    // currIndex, 1 indexed so subtract 1
flashcardIndex === null ? flashcardIndex = 0 : flashcardIndex--;

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

// Tallies are always derived from grades so navigating/re-grading can't desync them
function countGrade(value) {
    return grades.filter(grade => grade === value).length;
}

function updateTally() {
    tallyCorrectEl.textContent = countGrade(`correct`);
    tallyIncorrectEl.textContent = countGrade(`incorrect`);
    tallyRemainingEl.textContent = countGrade(null);
}

function resetGrades() {
    grades = Array(currWordList.length).fill(null);
    updateTally();
}

// Initializes the flashcard when a new word list is selected
async function initializeFlashcard(startingCard = 0) {
    cardFrontLanguage = currSetLanguage;
    flashcardIndex = startingCard;
    message.innerText = ``;
    busy = false;
    resetCardTransform();
    hideSummary();
    resetGrades();

    // Sets the progress bar length and the first icon
    if(currWordList.length > 0) {
        renderCard();
    } else {
        showEmptyHint();
        cardBack.textContent = ``;
        cardBadge.hidden = true;
        numProgress.innerText = `0 / 0`;
        progressBar.style.width = `0%`;
    }

    updateFavoriteIcon();
}

// Sets the favorite icon to indicate favorited
async function updateFavoriteIcon() {
    // Adds guard for logged out users or no set selected
    if(!isLoggedIn() || currSetKey === null) { return; }

    const response = await authFetch(`${API_BASE_URL}/favorites`);
    const data = await response.json();

    if(data.favorites.some(favSet => favSet.set_key === currSetKey)) {
        favoriteCardImg.src = `/assets/icons/favorited-icon.svg`;
    } else {
        favoriteCardImg.src = `/assets/icons/not-favorited-icon.svg`;
    }
}

// Refreshes only the favorite icon when coming back with the back button
window.addEventListener(`pageshow`, (event) => {
    if (event.persisted) updateFavoriteIcon();
});

// Connects with the set selection module
setOnSetChange(() => {
    fullRun = true;
    initializeFlashcard();
});

// Updates card total count and progress bar
function updateProgress() {
    numProgress.innerText = `${flashcardIndex+1} / ${currWordList.length}`;
    progressBar.style.width = `${(flashcardIndex+1)/currWordList.length * 100}%`;
}

// Card front language toggle takes effect on the current card right away
// (set-selection's own click handler has already switched currSetLanguage)
document.getElementById(`lang-toggle-sets`).addEventListener(`click`, () => {
    cardFrontLanguage = currSetLanguage;
    if (currWordList.length > 0) renderCard();
});

// Fills both faces of the current card and shows its grade, if any
function renderCard() {
    const word = currWordList[flashcardIndex];
    const backLanguage = cardFrontLanguage === `hawaiian` ? `english` : `hawaiian`;

    // Unflip instantly so the next answer is never visible mid-transition
    cardInner.style.transition = `none`;
    cardInner.classList.remove(`flipped`);
    void cardInner.offsetWidth;
    cardInner.style.transition = ``;

    cardFront.classList.remove(`card-hint`);
    cardFront.textContent = word[cardFrontLanguage];
    cardBack.textContent = word[backLanguage];

    const grade = grades[flashcardIndex];
    cardBadge.hidden = grade === null;
    cardBadge.textContent = grade === `correct` ? `✓` : `✗`;
    cardBadge.className = `card-badge ${grade ?? ``}`;

    updateProgress();
}

// Lets the card be flipped by clicking it or space
function flipCard() {
    if(currWordList.length > 0 && !summaryOpen) {
        cardInner.classList.toggle(`flipped`);
    }
}

function restartDeck() {
    setCurrWordList([...origWordList]);
    fullRun = true;
    initializeFlashcard();
}

restartButton.addEventListener(`click`, restartDeck);

// Flipping only happens on click; a drag that ends on the card must not flip it
let suppressClick = false;

cardButton.addEventListener(`click`, () => {
    if(suppressClick) { suppressClick = false; return; }
    flipCard();
});

cardButton.addEventListener(`keydown`, (event) => {
    if(event.key === ` ` || event.key === `Enter`) {
        event.preventDefault();
        event.stopPropagation();
        flipCard();
    }
});

function isTypingTarget(target) {
    return target instanceof HTMLElement &&
        (target.matches(`input, textarea, select`) || target.isContentEditable);
}

// Buttons with keybinds
function nextCard() {
    message.innerText = ``;
    if(currWordList.length === 0 || busy || summaryOpen) return;

    if(flashcardIndex < currWordList.length - 1) {
        flashcardIndex++;
        renderCard();
    } else {
        showSummary();
    }
}

function previousCard() {
    message.innerText = ``;
    if(currWordList.length === 0 || busy) return;

    if(summaryOpen) {
        hideSummary();
        renderCard();
    } else if(flashcardIndex > 0) {
        flashcardIndex--;
        renderCard();
    }
}

nextButton.addEventListener(`click`, nextCard);
previousButton.addEventListener(`click`, previousCard);

window.addEventListener(`keydown`, (event) => {
    if(event.ctrlKey || event.metaKey || event.altKey) return;
    if(isTypingTarget(event.target)) return;

    switch(event.key) {
        case `Enter`:
            // Focused buttons, links and the card handle Enter themselves
            if(event.target instanceof HTMLElement && event.target.closest(`button, a, [role="button"]`)) return;
            flipCard();
            break;
        case `ArrowRight`:
            nextCard();
            break;
        case `ArrowLeft`:
            previousCard();
            break;
        case `x`: case `X`: case `1`:
            gradeCard(`incorrect`);
            break;
        case `c`: case `C`: case `2`:
            gradeCard(`correct`);
            break;
    }
});

shuffleButton.addEventListener(`click`, () => {
    setCurrWordList(shuffle(currWordList));
    initializeFlashcard();
});

/*
------------------------------------------------------------------------------
                            GRADING, SWIPING AND SUMMARY
------------------------------------------------------------------------------
*/

function resetCardTransform() {
    cardButton.style.transition = ``;
    cardButton.style.transform = ``;
    cardButton.style.opacity = ``;
    cardButton.style.setProperty(`--tint`, `0`);
    cardButton.classList.remove(`tint-correct`, `tint-incorrect`, `dragging`);
}

// Records a grade then moves to the next ungraded card (or the summary)
function gradeCard(result, flyDirection = result === `correct` ? 1 : -1) {
    if(currWordList.length === 0 || summaryOpen || busy) return;

    const wasUngraded = grades[flashcardIndex] === null;
    grades[flashcardIndex] = result;
    if(wasUngraded) recordActivity({type: `card_graded`, set_key: currSetKey});
    updateTally();
    busy = true;

    const reduced = prefersReducedMotion();
    const duration = reduced ? 0 : FLY_MS;

    if(!reduced) {
        cardButton.classList.add(result === `correct` ? `tint-correct` : `tint-incorrect`);
        cardButton.classList.remove(result === `correct` ? `tint-incorrect` : `tint-correct`);
        cardButton.style.setProperty(`--tint`, `0.6`);
        cardButton.style.transition = `transform ${duration}ms var(--ease-out, ease-out), opacity ${duration}ms`;
        cardButton.style.transform = `translateX(${flyDirection * 120}%) rotate(${flyDirection * 18}deg)`;
        cardButton.style.opacity = `0`;
    }

    setTimeout(() => {
        resetCardTransform();
        busy = false;
        advanceToUngraded();
    }, duration);
}

function advanceToUngraded() {
    const total = currWordList.length;
    for(let step = 1; step <= total; step++) {
        const candidate = (flashcardIndex + step) % total;
        if(grades[candidate] === null) {
            flashcardIndex = candidate;
            renderCard();
            return;
        }
    }
    showSummary();
}

gradeCorrectButton.addEventListener(`click`, () => gradeCard(`correct`));
gradeIncorrectButton.addEventListener(`click`, () => gradeCard(`incorrect`));

function showSummary() {
    const correct = countGrade(`correct`);
    const incorrect = countGrade(`incorrect`);
    const ungraded = countGrade(null);

    summaryScore.textContent = `${correct} correct / ${incorrect} incorrect`;
    summaryUngraded.textContent = ungraded > 0 ? `${ungraded} not graded` : ``;
    summaryUngraded.hidden = ungraded === 0;
    reviewMissedButton.hidden = incorrect === 0;

    // Any frequency filter level counts; each (set, level) is counted once by the server
    if(ungraded === 0 && fullRun && currSetKey !== null) {
        recordActivity({type: `set_completed`, set_key: currSetKey, full_set: true, min_frequency: minFrequency});
    }

    summaryOpen = true;
    deckSummary.hidden = false;
    cardContainer.classList.add(`summarizing`);
}

function hideSummary() {
    summaryOpen = false;
    deckSummary.hidden = true;
    cardContainer.classList.remove(`summarizing`);
}

reviewMissedButton.addEventListener(`click`, () => {
    const missed = currWordList.filter((word, i) => grades[i] === `incorrect`);
    if(missed.length === 0) return;
    setCurrWordList(missed);
    initializeFlashcard();
    fullRun = false;
});

restartAllButton.addEventListener(`click`, restartDeck);

// Pointer drag: tilt and tint while dragging, grade on a decisive swipe
let drag = null;

cardButton.addEventListener(`pointerdown`, (event) => {
    if(summaryOpen || busy || currWordList.length === 0) return;
    if(event.pointerType === `mouse` && event.button !== 0) return;

    drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        dx: 0,
        moved: false,
        samples: [{x: event.clientX, t: event.timeStamp}]
    };
    cardButton.setPointerCapture(event.pointerId);
});

cardButton.addEventListener(`pointermove`, (event) => {
    if(drag === null || event.pointerId !== drag.pointerId) return;

    drag.dx = event.clientX - drag.startX;
    if(!drag.moved && Math.abs(drag.dx) >= DRAG_THRESHOLD_PX) {
        drag.moved = true;
        cardButton.classList.add(`dragging`);
    }
    if(!drag.moved) return;

    drag.samples.push({x: event.clientX, t: event.timeStamp});
    if(drag.samples.length > 6) drag.samples.shift();

    const width = cardButton.offsetWidth;
    cardButton.style.transition = `none`;
    cardButton.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 20}deg)`;
    cardButton.classList.toggle(`tint-correct`, drag.dx > 0);
    cardButton.classList.toggle(`tint-incorrect`, drag.dx < 0);
    cardButton.style.setProperty(`--tint`, Math.min(Math.abs(drag.dx) / (width * SWIPE_FRACTION), 1) * 0.6);
});

function finishDrag(event, cancelled) {
    if(drag === null || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    if(cardButton.hasPointerCapture(event.pointerId)) cardButton.releasePointerCapture(event.pointerId);
    if(!finished.moved) return;

    // The click that follows this pointerup must not flip the card
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);

    const first = finished.samples[0];
    const last = finished.samples[finished.samples.length - 1];
    const elapsed = last.t - first.t;
    const velocity = elapsed > 0 ? (last.x - first.x) / elapsed : 0;
    const width = cardButton.offsetWidth;

    const decisive = !cancelled && finished.dx !== 0 &&
        (Math.abs(finished.dx) >= width * SWIPE_FRACTION || Math.abs(velocity) > SWIPE_VELOCITY);

    if(decisive) {
        gradeCard(finished.dx > 0 ? `correct` : `incorrect`, finished.dx > 0 ? 1 : -1);
    } else {
        springBack();
    }
}

function springBack() {
    if(prefersReducedMotion()) {
        resetCardTransform();
        return;
    }
    cardButton.classList.remove(`dragging`);
    cardButton.style.transition = `transform 300ms var(--ease-out, ease-out)`;
    cardButton.style.transform = ``;
    cardButton.style.setProperty(`--tint`, `0`);
    setTimeout(() => { if(!busy && drag === null) resetCardTransform(); }, 300);
}

cardButton.addEventListener(`pointerup`, (event) => finishDrag(event, false));
cardButton.addEventListener(`pointercancel`, (event) => finishDrag(event, true));

/*
------------------------------------------------------------------------------
                            FAVORITES AND CONTINUE
------------------------------------------------------------------------------
*/

saveContinueSetButton.addEventListener(`click`, addContinue);

async function addContinue() {
    if (!isLoggedIn() || currSetKey === null) return;

    const names = currSetDisplayNames();

    const response = await authFetch(`${API_BASE_URL}/continue-sets`,
                                        {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                set_key: currSetKey,
                                                min_frequency: minFrequency,
                                                set_name_haw: names.haw,
                                                set_name_eng: names.eng,
                                                last_studied: flashcardIndex + 1,
                                                set_size: currWordList.length
                                            })
                                        }
                                    );
    const data = await response.json();
    if (data.action === "saved") message.innerText = `Saved progress`;
    else if (data.action === "completed") message.innerText = `Set complete!`;
}

favoriteCardButton.addEventListener(`click`, toggleFavorite);

async function toggleFavorite() {
    if (!isLoggedIn() || currSetKey === null) return;

    const names = currSetDisplayNames();

    const response = await authFetch(`${API_BASE_URL}/favorites`,
                                        {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                set_key: currSetKey,
                                                set_name_haw: names.haw,
                                                set_name_eng: names.eng,
                                                set_size: currWordList.length
                                            })
                                        }
                                    );
    const data = await response.json();
    if(data.favorited === `unfavorited`) {
        favoriteCardImg.src = `/assets/icons/not-favorited-icon.svg`;
    } else {
        favoriteCardImg.src = `/assets/icons/favorited-icon.svg`;
    }
}


// Empty deck: tell the user where to go instead of showing a blank card
function showEmptyHint() {
    cardFront.classList.add(`card-hint`);
    cardFront.textContent = currSetKey === null ? `Pick a set below to start` : `No words to show in this set`;
}

if (currSetKey === null) showEmptyHint();
else {
    if (flashcardIndex < currWordList.length && flashcardIndex >= 0)
        initializeFlashcard(flashcardIndex);
    else
        initializeFlashcard();
}
