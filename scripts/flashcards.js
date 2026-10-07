import { API_BASE_URL } from "/scripts/config.js";
import { isLoggedIn, authFetch } from "/scripts/auth.js";
import { prefersReducedMotion } from "/scripts/word-utils.js";
import { recordActivity } from "/scripts/progress.js";
import { announce } from "/scripts/announce.js";
import { RetryQueue, wordKey } from "/scripts/retry-queue.js";
import { initStudyLog, logSetOpened, logAttempt, logSetCompleted } from "/scripts/study-log.js";
import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    currSetKey, minFrequency, currSetDisplayNames, currSetLanguage,
    shuffle, wordListContainer, otherSets, isSingleSet
} from "/scripts/set-selection.js";
import { reviewStore, newReviewSession, getSpaced, setSpaced } from "/scripts/review-store.js";
import { buildDeck, normKey, flashcardGrade, describeNextDue } from "/scripts/sm2.js";

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
const retryTallyEl = document.querySelector(`.retry-tally`);
const tallyRetryEl = document.getElementById(`tally-retry`);
const gradeCorrectButton = document.getElementById(`grade-correct`);
const gradeIncorrectButton = document.getElementById(`grade-incorrect`);
const deckSummary = document.getElementById(`deck-summary`);
const summaryScore = document.getElementById(`summary-score`);
const summaryUngraded = document.getElementById(`summary-ungraded`);
const restartAllButton = document.getElementById(`restart-all`);
const reviewMissedButton = document.getElementById(`review-missed`);
const reviewMissedCount = document.getElementById(`review-missed-count`);
const reviewMissedNote = document.getElementById(`review-missed-note`);

const restartButton = document.getElementById(`restart-button`);
const previousButton = document.getElementById(`previous-button`);
const nextButton = document.getElementById(`next-button`);
const shuffleButton = document.getElementById(`shuffle-button`);
const saveContinueSetButton = document.getElementById(`save-continue-button`);
const favoriteCardButton = document.getElementById(`favorite-set-button`);
const favoriteCardImg = document.querySelector('#favorite-set-button img');
const message = document.getElementById(`message`);
const spacedButton = document.getElementById(`spaced-repetition-button`);
const caughtUp = document.getElementById(`caught-up`);
const nextDueEl = document.getElementById(`next-due`);
const studyFullSetButton = document.getElementById(`study-full-set`);
const summaryHeading = deckSummary.querySelector(`h2`);

const DRAG_THRESHOLD_PX = 6;
const SWIPE_FRACTION = 0.3;
const SWIPE_VELOCITY = 0.5;     // px per ms
const FLY_MS = 250;

let flashcardIndex = 0;
let cardFrontLanguage = `hawaiian`;
initStudyLog(`flashcards`, () => ({ setKey: currSetKey, minFrequency, variant: cardFrontLanguage }));
let grades = [];                // 'correct' | 'incorrect' | null per card in currWordList
let summaryOpen = false;
let busy = false;               // true while a graded card is flying off
let announcePrefix = ``;        // e.g. "Marked correct. " is read together with the next card

// Cards graded incorrect come back in retry rounds once the main deck is graded, until each is
// marked correct. The main total stays fixed; retry rounds report no activity.
const retry = new RetryQueue();
let pass = `main`;             // 'main' | 'retry'
let retryDeck = [];            // snapshot of the queue for the current retry round
let retryIdx = 0;

// Spaced repetition (SM-2): the saved toggle is per page and device. "Study full set anyway" (fullOverride) is a pure
// OFF session. initGen drops stale async inits; deckSpaced says whether the deck on screen is a scheduled one.
const reviewSession = newReviewSession(`flashcards`);
let spaced = getSpaced(`flashcards`);
let fullOverride = false;
let initGen = 0;
let deckSpaced = false;
let loading = false;

function spacedActive() {
    return spaced && !fullOverride && isSingleSet();
}

// Toggle state, label and (for several sets at once) the disabled state
function syncToggle() {
    const single = isSingleSet();
    spacedButton.disabled = !single;
    const on = single && spaced;
    spacedButton.setAttribute(`aria-checked`, String(on));
    spacedButton.querySelector(`.sw-state`).textContent = on ? `On` : `Off`;
    spacedButton.title = single ? `Spaced repetition: ${spaced ? `on` : `off`}` : `Spaced repetition works on one set at a time`;
}

// Continue-sets saving makes no sense for a partial, scheduled deck
function syncContinueButton() {
    saveContinueSetButton.setAttribute(`aria-disabled`, String(deckSpaced));
    saveContinueSetButton.title = deckSpaced ? `Saving progress is off during spaced repetition` : `Save progress`;
}

function enterLoading() {
    loading = true;
    busy = true;
    cardFront.classList.add(`card-loading`);
    cardFront.textContent = `Loading reviews…`;
    cardBack.textContent = ``;
    cardBadge.hidden = true;
    numProgress.innerText = `0 / 0`;
    progressBar.style.width = `0%`;
    retryTallyEl.hidden = true;
    gradeCorrectButton.disabled = true;
    gradeIncorrectButton.disabled = true;
    nextButton.disabled = true;
    cardButton.setAttribute(`aria-busy`, `true`);
}

function exitLoading() {
    if(!loading) return;
    loading = false;
    busy = false;
    cardFront.classList.remove(`card-loading`);
    gradeCorrectButton.disabled = false;
    gradeIncorrectButton.disabled = false;
    nextButton.disabled = false;
    cardButton.removeAttribute(`aria-busy`);
}

function hideCaughtUp() {
    caughtUp.hidden = true;
    cardContainer.classList.remove(`caught-up-open`);
}

function showCaughtUp(nextDue) {
    const when = describeNextDue(nextDue, Date.now());
    nextDueEl.textContent = when ? `Next review: ${when}.` : `Nothing else is scheduled.`;
    caughtUp.hidden = false;
    cardContainer.classList.add(`caught-up-open`);
    cardFront.classList.remove(`card-hint`);
    cardFront.textContent = ``;
    cardBack.textContent = ``;
    cardBadge.hidden = true;
    numProgress.innerText = `0 / 0`;
    progressBar.style.width = `0%`;
    retryTallyEl.hidden = true;
    announce(`All caught up. ${nextDueEl.textContent}`);
}

syncToggle();

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
// keepDeck: re-deal the deck already on screen (shuffle) instead of rebuilding a spaced deck
async function initializeFlashcard(startingCard = 0, { keepDeck = false } = {}) {
    const gen = ++initGen;
    const wasSpaced = deckSpaced;
    retry.clear();
    pass = `main`;
    retryDeck = [];
    retryIdx = 0;
    cardFrontLanguage = currSetLanguage;
    flashcardIndex = startingCard;
    message.innerText = ``;
    busy = false;
    resetCardTransform();
    hideSummary();
    hideCaughtUp();
    exitLoading();
    deckSpaced = false;
    syncToggle();
    resetGrades();

    if(keepDeck) {
        deckSpaced = wasSpaced;
    } else if(spacedActive()) {
        // Spaced: the deck is the due words plus a few new ones, built once the review store has loaded
        syncContinueButton();
        enterLoading();
        await reviewStore.ready;
        if(gen !== initGen) return;     // a newer init took over: do nothing
        exitLoading();
        reviewSession.reset();
        const built = buildDeck(origWordList, key => reviewStore.get(`flashcards`, key), Date.now());
        deckSpaced = true;
        flashcardIndex = 0;
        setCurrWordList(built.deck);
        resetGrades();
        syncContinueButton();
        if(built.deck.length === 0 && origWordList.length > 0) {
            showCaughtUp(built.nextDue);
            updateFavoriteIcon();
            return;
        }
    }
    syncContinueButton();

    // Sets the progress bar length and the first icon
    if(currWordList.length > 0) {
        renderCard();
    } else {
        showEmptyHint();
        cardBack.textContent = ``;
        cardBadge.hidden = true;
        numProgress.innerText = `0 / 0`;
        progressBar.style.width = `0%`;
        retryTallyEl.hidden = true;
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
// Starts a deck, then reports the set as opened once the deck exists (and only if no newer deck replaced it)
function openDeck(startingCard = 0, afterOpen = null) {
    const pending = initializeFlashcard(startingCard);
    const gen = initGen;
    pending.then(() => {
        if(gen !== initGen) return;
        logSetOpened(); // a new set or frequency level, unlike restart/shuffle
        if(afterOpen) afterOpen();
    });
}

setOnSetChange(() => {
    fullOverride = false;     // a new deck goes back to the saved toggle
    // Move focus to the card so keyboard and screen-reader users start studying right away; leave it alone
    // while someone is adjusting the frequency chips
    const keepFocus = document.activeElement?.closest(`#frequency-filter`);
    openDeck(0, () => { if(!keepFocus && currWordList.length > 0) cardButton.focus({preventScroll: true}); });
});

spacedButton.addEventListener(`click`, () => {
    if(!isSingleSet()) return;
    spaced = !spaced;
    setSpaced(`flashcards`, spaced);
    fullOverride = false;
    syncToggle();
    announce(`Spaced repetition ${spaced ? `on` : `off`}`);
    setCurrWordList([...origWordList]);   // OFF must show the full list again, not the last spaced deck
    initializeFlashcard();   // also ends a retry pass in progress
});

studyFullSetButton.addEventListener(`click`, () => {
    fullOverride = true;     // pure OFF session: nothing is scheduled or saved, the toggle stays as it was
    setCurrWordList([...origWordList]);
    announce(`Studying the full set. Reviews are not scheduled.`);
    initializeFlashcard();
});

// Updates card total count and progress bar
function updateProgress() {
    // The retry pass leaves the main counter full and shows its own pill
    const position = pass === `main` ? flashcardIndex + 1 : currWordList.length;
    numProgress.innerText = `${position} / ${currWordList.length}`;
    progressBar.style.width = `${position / currWordList.length * 100}%`;

    retryTallyEl.hidden = pass !== `retry`;
    if(pass === `retry`) tallyRetryEl.textContent = `${retryIdx + 1} / ${retryDeck.length}`;
}

// Card front language toggle takes effect on the current card right away
// (set-selection's own click handler has already switched currSetLanguage)
document.getElementById(`lang-toggle-sets`).addEventListener(`click`, () => {
    cardFrontLanguage = currSetLanguage;
    if (currWordList.length > 0 && !loading) renderCard();
});

// Fills both faces of the current card and shows its grade, if any
function renderCard() {
    const word = pass === `main` ? currWordList[flashcardIndex] : retryDeck[retryIdx];
    const backLanguage = cardFrontLanguage === `hawaiian` ? `english` : `hawaiian`;

    // Unflip instantly so the next answer is never visible mid-transition
    cardInner.style.transition = `none`;
    cardInner.classList.remove(`flipped`);
    void cardInner.offsetWidth;
    cardInner.style.transition = ``;

    cardFront.classList.remove(`card-hint`, `card-loading`);
    cardFront.textContent = word[cardFrontLanguage];
    cardBack.textContent = word[backLanguage];

    const grade = pass === `main` ? grades[flashcardIndex] : null;
    cardBadge.hidden = grade === null;
    cardBadge.textContent = grade === `correct` ? `✓` : `✗`;
    cardBadge.className = `card-badge ${grade ?? ``}`;

    updateProgress();
    const position = pass === `main` ? flashcardIndex + 1 : retryIdx + 1;
    const total = pass === `main` ? currWordList.length : retryDeck.length;
    announce(`${announcePrefix}${pass === `retry` ? `Retry card` : `Card`} ${position} of ${total}. ${word[cardFrontLanguage]}`);
    announcePrefix = ``;
}

// Lets the card be flipped by clicking it or space
function flipCard() {
    if(currWordList.length > 0 && !summaryOpen && !loading) {
        cardInner.classList.toggle(`flipped`);
        announce(cardInner.classList.contains(`flipped`) ? `Answer: ${cardBack.textContent}` : `Front: ${cardFront.textContent}`);
    }
}

function restartDeck() {
    setCurrWordList([...origWordList]);
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

    if(pass === `retry`) {
        advanceRetry();
    } else if(flashcardIndex < currWordList.length - 1) {
        flashcardIndex++;
        renderCard();
    } else {
        finishOrRetry();
    }
}

function previousCard() {
    message.innerText = ``;
    if(currWordList.length === 0 || busy) return;

    if(summaryOpen) {
        hideSummary();
        renderCard();
    } else if(pass === `retry`) {
        if(retryIdx > 0) {
            retryIdx--;
            renderCard();
        }
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
        case ` `:
            // Space flips from anywhere on the page, but never steals it from buttons, links or the set chooser
            if(currWordList.length === 0 || summaryOpen) return;
            if(event.target instanceof HTMLElement && event.target.closest(`button, a, summary, [role="button"]`)) return;
            event.preventDefault();
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
    if(loading || !caughtUp.hidden) return;
    setCurrWordList(shuffle(currWordList));
    initializeFlashcard(0, { keepDeck: true });   // a spaced deck is shuffled as it is, not rebuilt
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

    if(pass === `main`) {
        const wasUngraded = grades[flashcardIndex] === null;
        grades[flashcardIndex] = result;
        if(wasUngraded) recordActivity({type: `card_graded`, set_key: currSetKey});
        updateTally();

        // Re-grading works too: Incorrect queues the card (once), Correct takes it back out
        const card = currWordList[flashcardIndex];
        if(deckSpaced) {
            // Spaced: SM-2 schedules the word whatever the answer. Only a miss is queued for the on-demand "Review missed"
            // round, which is practice only: it never changes the schedule
            reviewSession.grade(normKey(card), flashcardGrade(result), Date.now());
            if(result === `incorrect`) retry.add(wordKey(card), card);
            else retry.remove(wordKey(card));
            logAttempt(card.hawaiian, result, false, { is_spaced: true });
        } else {
            if(result === `incorrect`) retry.add(wordKey(card), card);
            else retry.remove(wordKey(card));
            logAttempt(card.hawaiian, result, false);
        }
    } else {
        // Retry rounds only touch the queue: no main grades, tally or activity
        const card = retryDeck[retryIdx];
        if(result === `incorrect`) retry.add(wordKey(card), card);
        else retry.remove(wordKey(card));
        if(deckSpaced) logAttempt(card.hawaiian, result, true, { is_spaced: true });
        else logAttempt(card.hawaiian, result, true);
    }
    busy = true;
    announcePrefix = `Marked ${result}. `;

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
        if(pass === `main`) advanceToUngraded();
        else advanceRetry();
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
    finishOrRetry();
}

// End of the main deck: replay missed cards until none are left, otherwise show the summary.
// Cards still ungraded keep the deck open on the summary, as before.
// Spaced decks never start it by themselves: the summary offers a "Review missed" button instead.
function finishOrRetry() {
    if(!deckSpaced && countGrade(null) === 0 && retry.size > 0) startRetryRound();
    else showSummary();
}

function startRetryRound() {
    pass = `retry`;
    retryDeck = retry.items();
    retryIdx = 0;
    renderCard();
}

function advanceRetry() {
    retryIdx++;
    if(retryIdx < retryDeck.length) {
        renderCard();
    } else if(retry.size > 0 && !deckSpaced) {
        startRetryRound();
    } else {
        retryIdx = retryDeck.length - 1; // Prev from the summary lands on the last card
        showSummary();
    }
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

    // Any frequency filter level counts; each (set, level) is counted once by the server.
    // A spaced review is a partial deck, so it never counts as a completed set.
    summaryHeading.textContent = deckSpaced ? `Review done` : `Deck complete`;
    if(!deckSpaced && ungraded === 0 && currSetKey !== null) {
        logSetCompleted();
        recordActivity({type: `set_completed`, set_key: currSetKey, full_set: true, min_frequency: minFrequency});
    }

    // Spaced: misses repeat only on demand, as practice that doesn't count for the schedule
    const missed = deckSpaced ? retry.size : 0;
    reviewMissedButton.hidden = missed === 0;
    reviewMissedNote.hidden = missed === 0;
    reviewMissedCount.textContent = missed;

    summaryOpen = true;
    deckSummary.hidden = false;
    cardContainer.classList.add(`summarizing`);
    announce(`${announcePrefix}${deckSpaced ? `Review done` : `Deck complete`}. ${summaryScore.textContent}${ungraded > 0 ? `, ${ungraded} not graded` : ``}.`);
    announcePrefix = ``;
}

function hideSummary() {
    summaryOpen = false;
    deckSummary.hidden = true;
    cardContainer.classList.remove(`summarizing`);
}

restartAllButton.addEventListener(`click`, restartDeck);

reviewMissedButton.addEventListener(`click`, () => {
    if(!deckSpaced || retry.size === 0) return;
    hideSummary();
    announcePrefix = `Review missed, practice only. `;
    startRetryRound();
    cardButton.focus({preventScroll: true});
});

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
    if (deckSpaced) return;   // a spaced deck is only the due words, not a place in the set
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
                                                // Saving with retries pending counts the set as complete
                                                last_studied: (pass === `retry` || retry.size > 0) ? currWordList.length : flashcardIndex + 1,
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
else if (flashcardIndex < currWordList.length && flashcardIndex >= 0)
    openDeck(flashcardIndex);   // ?currIndex is ignored by a spaced deck
else
    openDeck();
