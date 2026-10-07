import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    swapLanguage, shuffle, wordListContainer, otherSets, title,
    currSetLanguage, currSetKey, minFrequency, isSingleSet
} from "/scripts/set-selection.js";
import { recordActivity, getSetBest } from "/scripts/progress.js";
import { normalize, canonical } from "/scripts/word-utils.js";
import { announce } from "/scripts/announce.js";
import { RetryQueue, wordKey } from "/scripts/retry-queue.js";
import { initStudyLog, logSetOpened, logAttempt, logSetCompleted } from "/scripts/study-log.js";
import { reviewStore, newReviewSession, getSpaced, setSpaced, spacedFromUrl } from "/scripts/review-store.js";
import { createModeBadge } from "/scripts/mode-badge.js";
import { modeBadgeState } from "/scripts/spaced-summary.js";
import { maybeOpenFirstTime } from "/scripts/spaced-tutorial.js";
import { buildDeck, normKey, writingGrade, spacedFullSet, describeNextDue } from "/scripts/sm2.js";

initStudyLog(`writing`, () => ({ setKey: currSetKey, minFrequency, variant: `to_hawaiian` }));

const practiceContainer = document.getElementById(`practice-container`);
const word = document.getElementById(`word`);
const wordTitle = document.getElementById(`word-title`);
const numProgress = document.getElementById(`num-progress`);
const progressBar = document.getElementById(`progress-bar`);
const wordInput = document.getElementById(`word-input`);
const maxStreakDisplay = document.getElementById(`max-streak`);
const currStreakDisplay = document.getElementById(`curr-streak`);
const errorPopup = document.getElementById(`error-popup`);
const hintDisplay = document.getElementById(`hint-display`);
const hintButton = document.getElementById(`hint-button`);
const retryLabel = document.getElementById(`retry-label`);
const spacedButton = document.getElementById(`spaced-repetition-button`);
const caughtUp = document.getElementById(`caught-up`);
const nextDueEl = document.getElementById(`next-due`);
const studyFullSetButton = document.getElementById(`study-full-set`);
const reviewMissedPanel = document.getElementById(`review-missed-panel`);
const reviewMissedButton = document.getElementById(`review-missed`);
const reviewMissedCount = document.getElementById(`review-missed-count`);
let announcePrefix = ``;        // e.g. "Correct. " is read together with the next word

const fullscreenButton = document.getElementById(`fullscreen-button`);
const shuffleButton = document.getElementById(`shuffle-button`);
const restartButton = document.getElementById(`restart-button`);


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
    if (loading || !caughtUp.hidden) return;
    setCurrWordList(shuffle(currWordList));
    fullRun = true;
    initializeSet({ keepDeck: true });   // a spaced deck is shuffled as it is, not rebuilt
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

// Words that were given up on or needed a hint come back in a retry pass after the main pass.
// The main pass total stays fixed; the retry pass has its own label and reports no activity.
const retry = new RetryQueue();
let pass = `main`;             // 'main' | 'retry'
let retryList = [];            // snapshot of the queue for the current retry round
let retryIndex = 0;
let hintStage = 0;             // 0 none, 1 blanks, 2 first letter, 3 answer shown
let wordUsedHelp = false;
let gaveUp = false;
let sessionHelped = false;     // any help this run: it can no longer count as a perfect run
let wordUsedHint = false;      // this word: a hint was shown (spaced grade 3)
let wordWrongGuess = false;    // this word: a wrong guess was typed (spaced grade 4)

// Spaced repetition (SM-2): the saved toggle is per page and device. "Study full set anyway" (fullOverride) is a pure
// OFF session. initGen drops stale async inits; deckSpaced says whether the deck on screen is a scheduled one.
const reviewSession = newReviewSession(`writing`);
// Spaced answers are held (staged) until the deck is done; leaving early discards them with their activity events.
let pendingActivities = [];
let deckCommitted = false;
let spaced = getSpaced(`writing`) || spacedFromUrl();   // ?spaced=1: on for this visit, the saved setting is untouched
let fullOverride = false;
let initGen = 0;
let deckSpaced = false;
let loading = false;
let practiceRound = false;      // a "Review missed" round is on: practice only
const modeBadge = createModeBadge(document.getElementById(`mode-badge`));
const PRACTICE_NOTE = modeBadgeState({ spacedOn: true, practice: true }).announce;

// The one place that decides what the "counts / practice" badge says (called wherever deckSpaced, the round or the override changes)
function syncModeBadge() {
    const on = isSingleSet() && spaced;
    modeBadge.update({ spacedOn: on, practice: on && (fullOverride || practiceRound), loading, caughtUp: !caughtUp.hidden });
}

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
    syncModeBadge();
}

function enterLoading() {
    loading = true;
    word.classList.add(`word-hint`);
    word.textContent = `Loading reviews…`;
    wordTitle.innerText = ``;
    hintDisplay.innerText = ``;
    retryLabel.hidden = true;
    numProgress.innerText = `0 / 0`;
    progressBar.style.width = `0%`;
    wordInput.disabled = true;
    hintButton.disabled = true;
    practiceContainer.setAttribute(`aria-busy`, `true`);
    syncModeBadge();
}

function exitLoading() {
    if (!loading) return;
    loading = false;
    wordInput.disabled = false;
    practiceContainer.removeAttribute(`aria-busy`);
    syncModeBadge();
}

function hideCaughtUp() {
    caughtUp.hidden = true;
    practiceContainer.classList.remove(`caught-up-open`);
    syncModeBadge();
}

function showCaughtUp(nextDue) {
    const when = describeNextDue(nextDue, Date.now());
    nextDueEl.textContent = when ? `Next review: ${when}.` : `Nothing else is scheduled.`;
    caughtUp.hidden = false;
    practiceContainer.classList.add(`caught-up-open`);
    syncModeBadge();
    word.textContent = ``;
    wordTitle.innerText = ``;
    numProgress.innerText = `0 / 0`;
    progressBar.style.width = `0%`;
    retryLabel.hidden = true;
    disableHint();
    announce(`All caught up. ${nextDueEl.textContent}`);
}

// Spaced attempts are tagged so analytics can tell them apart; OFF attempts carry no extra key
function logTry(wordHawaiian, outcome, isRetry) {
    if (deckSpaced) logAttempt(wordHawaiian, outcome, isRetry, { is_spaced: true });
    else logAttempt(wordHawaiian, outcome, isRetry);
}

syncToggle();

function activeWord() {
    return pass === `main` ? currWordList[setIndex] : retryList[retryIndex];
}

// nearMiss: letters are right but a kahakō or ʻokina is missing/wrong
function makePopup(nearMiss = false) {
    if (nearMiss)
        errorPopup.innerHTML = `<p>Almost! Check your kahakō and ʻokina.</p>`;
    else if(currSetLanguage === `hawaiian`)
        errorPopup.innerHTML = `<p>Hewa. E hoʻāʻo hou.</p>`;
    else
        errorPopup.innerHTML = `<p>Incorrect. Try again.</p>`;
    errorPopup.classList.remove(`hidden`);
    announce(errorPopup.textContent);
}

function hidePopup() {
    errorPopup.classList.add(`hidden`);
}

// Initializes word list for practice set
// keepDeck: re-deal the deck already on screen (shuffle) instead of rebuilding a spaced deck
async function initializeSet({ keepDeck = false } = {}) {
    const gen = ++initGen;
    const wasSpaced = deckSpaced;
    reviewSession.discard();     // leaving a spaced deck early (set, frequency, switch, restart, shuffle): nothing is saved or credited
    pendingActivities = [];
    deckCommitted = false;
    resetStreak();
    loadBest();
    hidePopup();
    setIndex = 0;
    retry.clear();
    pass = `main`;
    practiceRound = false;
    retryList = [];
    retryIndex = 0;
    sessionHelped = false;
    hideCaughtUp();
    hideReviewMissed();
    exitLoading();
    deckSpaced = false;
    syncToggle();

    if (keepDeck) {
        deckSpaced = wasSpaced;
    } else if (spacedActive()) {
        // Spaced: the deck is the due words plus a few new ones, built once the review store has loaded
        enterLoading();
        await reviewStore.ready;
        if (gen !== initGen) return;    // a newer init took over: do nothing
        exitLoading();
        reviewSession.reset();
        const built = buildDeck(origWordList, key => reviewStore.get(`writing`, key), Date.now());
        deckSpaced = true;
        syncModeBadge();
        setCurrWordList(built.deck);
        if (built.deck.length === 0 && origWordList.length > 0) {
            showCaughtUp(built.nextDue);
            return;
        }
    }

    if (currWordList.length === 0) { // guard for empty set
        numProgress.innerText = `0 / 0`;
        progressBar.style.width = `0%`;
        showEmptyHint();
        return;
    }

    showWord();
}
// Starts a deck, then reports the set as opened once the deck exists (and only if no newer deck replaced it)
function openSet(afterOpen = null) {
    const pending = initializeSet();
    const gen = initGen;
    pending.then(() => {
        if (gen !== initGen) return;
        logSetOpened(); // a new set or frequency level, unlike restart/shuffle
        if (afterOpen) afterOpen();
    });
}

setOnSetChange(() => {
    fullRun = true;
    fullOverride = false;     // a new deck goes back to the saved toggle
    // Start typing right away, unless someone is adjusting the frequency chips. Not on touch screens: focusing
    // the box opens the on-screen keyboard, which covers the prompt (and iOS can leave it unpainted afterwards).
    const touchScreen = window.matchMedia?.(`(pointer: coarse)`).matches;
    const keepFocus = document.activeElement?.closest(`#frequency-filter`);
    openSet(() => { if (!touchScreen && currWordList.length > 0 && !keepFocus) wordInput.focus({ preventScroll: true }); });
});

spacedButton.addEventListener(`click`, () => {
    if (!isSingleSet()) return;
    spaced = !spaced;
    setSpaced(`writing`, spaced);
    fullOverride = false;
    fullRun = true;
    syncToggle();
    announce(`Spaced repetition ${spaced ? `on` : `off`}`);
    setIndex = 0;
    setCurrWordList([...origWordList]);   // OFF must show the full list again, not the last spaced deck
    initializeSet();   // also ends a retry pass in progress
    if (spaced) maybeOpenFirstTime(spacedButton);   // first time ever turning it on: show how it works
});

studyFullSetButton.addEventListener(`click`, () => {
    fullOverride = true;     // pure OFF session: nothing is scheduled or saved, the toggle stays as it was
    setIndex = 0;
    setCurrWordList([...origWordList]);
    fullRun = true;
    announce(`Studying the full set. ${PRACTICE_NOTE}`);
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
    // The retry pass leaves the main counter full and shows its own label
    const done = pass === `main` ? setIndex : currWordList.length;
    numProgress.innerText = `${done} / ${currWordList.length}`;
    progressBar.style.width = `${done / currWordList.length * 100}%`;

    retryLabel.hidden = pass !== `retry`;
    if (pass === `retry`) retryLabel.innerText = `Retry ${retryIndex + 1} / ${retryList.length}`;
}

// Shows the prompt word the way flashcards.js shows a card face: one plain textContent assignment, no child
// nodes (iOS WebKit left the first prompt unpainted when it was built from text nodes + <wbr>).
// A zero-width space after each "/" lets long alternatives (wonderful/ marvelous) wrap at the slash.
function setWordText(text) {
    word.textContent = text.replace(/\//g, `/​`);
}

function showWord() {
    updateProgress();
    resetHint();
    word.classList.remove(`word-hint`);
    setWordText(activeWord()[swapLanguage(translateTo)]);
    wordTitle.innerText = `Translate to ${title(translateTo)}`;
    const position = pass === `main` ? setIndex + 1 : retryIndex + 1;
    const total = pass === `main` ? currWordList.length : retryList.length;
    announce(`${announcePrefix}${pass === `retry` ? `Retry word` : `Word`} ${position} of ${total}. Translate to ${title(translateTo)}: ${word.textContent.replace(/​/g, ``)}`);
    announcePrefix = ``;
}

/*
------------------------------------------------------------------------------
                            HINTS, GIVING UP AND THE RETRY PASS
------------------------------------------------------------------------------
*/

function resetHint() {
    hintStage = 0;
    wordUsedHelp = false;
    wordUsedHint = false;
    wordWrongGuess = false;
    gaveUp = false;
    hintDisplay.innerText = ``;
    hintButton.innerText = `Hint`;
    hintButton.disabled = false;
}

function disableHint() {
    resetHint();
    hintButton.disabled = true;
}

// One blank per letter (ʻokina and kahakō letters count as one), spaces become a wider gap,
// other punctuation stays visible. showFirst reveals the leading character.
function hintText(answer, showFirst) {
    return Array.from(answer.normalize(`NFC`)).map((char, i) => {
        if (char === ` `) return `\u00A0\u00A0`;
        if (!/\p{L}/u.test(char)) return char;
        return showFirst && i === 0 ? char : `_`;
    }).join(` `);
}

hintButton.addEventListener(`click`, () => {
    const current = activeWord();
    if (current === undefined) return;

    if (hintStage === 3) {
        giveUpAndAdvance();
        return;
    }

    const answer = current[translateTo];
    hintStage++;
    wordUsedHelp = true;
    wordUsedHint = true;
    sessionHelped = true;

    const isRetry = pass === `retry`;
    if (hintStage === 1) {
        hintDisplay.innerText = hintText(answer, false);
        logTry(current.hawaiian, `hint_blanks`, isRetry);
    } else if (hintStage === 2) {
        hintDisplay.innerText = hintText(answer, true);
        hintButton.innerText = `Give up`;
        logTry(current.hawaiian, `hint_letter`, isRetry);
    } else {
        hintDisplay.innerText = answer;
        gaveUp = true;
        hintButton.innerText = `Continue`;
        logTry(current.hawaiian, `gave_up`, isRetry); // logged when the answer is revealed
    }
    wordInput.focus(); // keeps typing and Enter going to the answer box
});

function startRetryRound() {
    pass = `retry`;
    practiceRound = deckSpaced;   // spaced "Review missed" is practice only (a normal retry pass is not spaced at all)
    syncModeBadge();
    retryList = retry.items();
    retryIndex = 0;
    showWord();
}

// Moves to the next word: main list, then retry rounds until every queued word is answered unaided
function advance() {
    wordInput.value = ``;
    if (pass === `main`) {
        setIndex++;
        if (setIndex < currWordList.length) { showWord(); return; }
    } else {
        retryIndex++;
        if (retryIndex < retryList.length) { showWord(); return; }
    }

    // Spaced: no automatic retry round; the finished screen offers "Review missed" instead
    if (retry.size > 0 && !deckSpaced) {
        startRetryRound();
        return;
    }

    pass = `main`;
    showComplete();
}

function hideReviewMissed() {
    reviewMissedPanel.hidden = true;
}

// Starts the practice-only round on demand (spaced mode)
reviewMissedButton.addEventListener(`click`, () => {
    if (!deckSpaced || retry.size === 0) return;
    hideReviewMissed();
    announcePrefix = `Review missed. ${PRACTICE_NOTE} `;
    startRetryRound();
    wordInput.focus({ preventScroll: true });
});

// Deck end (spaced): writes every staged schedule once, then records the deferred word_correct events (same payloads as live)
function commitDeck() {
    deckCommitted = true;
    reviewSession.commit();
    const events = pendingActivities;
    pendingActivities = [];
    events.forEach(recordActivity);
}

function showComplete() {
    if (deckSpaced && !deckCommitted) commitDeck();
    disableHint();
    word.innerText = deckSpaced ? `Review done!` : `Complete!`;
    wordTitle.innerText = ``;
    updateProgress();
    const missed = deckSpaced ? retry.size : 0;
    reviewMissedCount.textContent = missed;
    reviewMissedPanel.hidden = missed === 0;
    announce(`${announcePrefix}${deckSpaced ? `Review done.${missed > 0 ? ` ${missed} missed, review available.` : ``}` : `Set complete.`}`);
    announcePrefix = ``;
    // A spaced review is a partial deck, so it never counts as a completed set
    if (deckSpaced) return;
    logSetCompleted();
    // Any frequency filter level counts; each (set, level) is counted once by the server
    if (fullRun && currSetKey !== null) {
        recordActivity({type: `set_completed`, set_key: currSetKey, full_set: true, min_frequency: minFrequency});
    }
}

// Giving up shows the answer, breaks the streak and queues the word for the retry pass
function giveUpAndAdvance() {
    announcePrefix = `The answer was ${activeWord()[translateTo]}. `;
    resetStreak();
    if (deckSpaced && pass === `main`) reviewSession.stage(normKey(activeWord()), writingGrade({ gaveUp: true }), Date.now());   // a miss: step 0
    if (pass === `main`) retry.add(wordKey(activeWord()), activeWord());
    hidePopup();
    advance();
}

// Main-pass word credit: live when not spaced, held until the deck ends when spaced
function emitActivity(event) {
    if (deckSpaced) pendingActivities.push(event);
    else recordActivity(event);
}

function checkWord() {
    const current = activeWord();
    if (loading || currWordList.length === 0 || current === undefined) return; // loading, empty set or set already complete

    if (gaveUp) {
        giveUpAndAdvance();
        return;
    }

    const answer = current[translateTo];
    if (canonical(wordInput.value) === canonical(answer)) {
        logTry(current.hawaiian, wordUsedHelp ? `correct_helped` : `correct`, pass === `retry`);
        // Spaced: the main pass schedules the word whatever the outcome; only a helped word (hint or wrong guess) is queued
        // for the on-demand "Review missed" round (practice only), never a word answered correctly unaided
        if (deckSpaced && pass === `main`) {
            reviewSession.stage(normKey(current), writingGrade({ usedHint: wordUsedHint, wrongGuess: wordWrongGuess }), Date.now());
        }
        if (pass === `main`) {
            if (wordUsedHelp) {
                // helped: breaks the streak, can't count toward a perfect run, comes back in the retry pass
                resetStreak();
                retry.add(wordKey(current), current);
                emitActivity({
                    type: `word_correct`,
                    set_key: currSetKey,
                    set_size: origWordList.length,
                    full_set: false
                });
            } else {
                incrementStreak();
                emitActivity({
                    type: `word_correct`,
                    set_key: currSetKey,
                    streak: currStreak,
                    set_size: origWordList.length,
                    full_set: fullRun && (deckSpaced
                        ? spacedFullSet({ deckKeys: currWordList.map(normKey), setKeys: origWordList.map(normKey), minFrequency, helped: sessionHelped })
                        : minFrequency === 1 && !sessionHelped)
                });
            }
        } else if (!wordUsedHelp) {
            retry.remove(wordKey(current)); // answered unaided: done. Retry answers report no activity.
        }
        hidePopup();
        announcePrefix = `Correct. `;
        advance();
    } else {
        resetStreak();
        logTry(current.hawaiian, `incorrect`, pass === `retry`);
        // A wrong guess counts as a miss: the word still has to be answered now, then comes back in the retry pass
        wordUsedHelp = true;
        wordWrongGuess = true;
        sessionHelped = true;
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
    disableHint();
}

// Loads the set from the URL (?set= / ?setName=) on page load
if (currSetKey !== null) openSet(keepFirstWordPainted);
else showEmptyHint();

// iOS WebKit has left the very first prompt unpainted when it is written during the page's first frames (later words
// are fine). It cannot be detected from script, so write the same text again after the first paint has surely happened.
// Only while still on the first, unanswered word, so it never overwrites anything the person has done.
function keepFirstWordPainted() {
    const again = () => {
        if (pass !== `main` || setIndex !== 0 || wordInput.value !== `` || hintStage !== 0) return;
        if (word.classList.contains(`word-hint`) || activeWord() === undefined) return;
        setWordText(activeWord()[swapLanguage(translateTo)]);
    };
    requestAnimationFrame(() => requestAnimationFrame(again));
    window.addEventListener(`load`, again);
    window.addEventListener(`pageshow`, again);
    setTimeout(again, 300);
    setTimeout(again, 1000);
}
