import {
    currWordList, origWordList, setCurrWordList, setOnSetChange,
    swapLanguage, shuffle, wordListContainer, otherSets, title,
    currSetLanguage, currSetKey, minFrequency
} from "/scripts/set-selection.js";
import { recordActivity, getSetBest } from "/scripts/progress.js";
import { normalize, canonical } from "/scripts/word-utils.js";
import { announce } from "/scripts/announce.js";
import { RetryQueue, wordKey } from "/scripts/retry-queue.js";
import { initStudyLog, logSetOpened, logAttempt, logSetCompleted } from "/scripts/study-log.js";

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
function initializeSet() {
    resetStreak();
    loadBest();
    hidePopup();
    setIndex = 0;
    retry.clear();
    pass = `main`;
    retryList = [];
    retryIndex = 0;
    sessionHelped = false;

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
    logSetOpened(); // a new set or frequency level, unlike restart/shuffle
    // Start typing right away, unless someone is adjusting the frequency chips. Not on touch screens: focusing
    // the box opens the on-screen keyboard, which covers the prompt (and iOS can leave it unpainted afterwards).
    const touchScreen = window.matchMedia?.(`(pointer: coarse)`).matches;
    if (!touchScreen && currWordList.length > 0 && !document.activeElement?.closest(`#frequency-filter`)) wordInput.focus({ preventScroll: true });
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
    sessionHelped = true;

    const isRetry = pass === `retry`;
    if (hintStage === 1) {
        hintDisplay.innerText = hintText(answer, false);
        logAttempt(current.hawaiian, `hint_blanks`, isRetry);
    } else if (hintStage === 2) {
        hintDisplay.innerText = hintText(answer, true);
        hintButton.innerText = `Give up`;
        logAttempt(current.hawaiian, `hint_letter`, isRetry);
    } else {
        hintDisplay.innerText = answer;
        gaveUp = true;
        hintButton.innerText = `Continue`;
        logAttempt(current.hawaiian, `gave_up`, isRetry); // logged when the answer is revealed
    }
    wordInput.focus(); // keeps typing and Enter going to the answer box
});

function startRetryRound() {
    pass = `retry`;
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

    if (retry.size > 0) {
        startRetryRound();
        return;
    }

    pass = `main`;
    showComplete();
}

function showComplete() {
    disableHint();
    word.innerText = `Complete!`;
    wordTitle.innerText = ``;
    updateProgress();
    announce(`${announcePrefix}Set complete.`);
    announcePrefix = ``;
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
    if (pass === `main`) retry.add(wordKey(activeWord()), activeWord());
    hidePopup();
    advance();
}

function checkWord() {
    const current = activeWord();
    if (currWordList.length === 0 || current === undefined) return; // empty set or set already complete

    if (gaveUp) {
        giveUpAndAdvance();
        return;
    }

    const answer = current[translateTo];
    if (canonical(wordInput.value) === canonical(answer)) {
        logAttempt(current.hawaiian, wordUsedHelp ? `correct_helped` : `correct`, pass === `retry`);
        if (pass === `main`) {
            if (wordUsedHelp) {
                // helped: breaks the streak, can't count toward a perfect run, comes back in the retry pass
                resetStreak();
                retry.add(wordKey(current), current);
                recordActivity({
                    type: `word_correct`,
                    set_key: currSetKey,
                    set_size: origWordList.length,
                    full_set: false
                });
            } else {
                incrementStreak();
                recordActivity({
                    type: `word_correct`,
                    set_key: currSetKey,
                    streak: currStreak,
                    set_size: origWordList.length,
                    full_set: fullRun && minFrequency === 1 && !sessionHelped
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
        logAttempt(current.hawaiian, `incorrect`, pass === `retry`);
        // A wrong guess counts as a miss: the word still has to be answered now, then comes back in the retry pass
        wordUsedHelp = true;
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
if (currSetKey !== null) {
    initializeSet();
    logSetOpened();
    keepFirstWordPainted();
} else showEmptyHint();

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

// iOS diagnostics: add ?debug=1 to the URL (temporary, see scripts/debug-word.js)
if (window.location.search.indexOf(`debug`) !== -1) import(`/scripts/debug-word.js`);
