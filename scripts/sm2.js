// Shared SM-2 spaced-repetition engine for flashcards and writing practice. Pure: no DOM, no network, no storage.
// A schedule is { ef, interval, repetitions, due, reviewedAt, step }:
//   due        UTC ms when the word is next due (a word is due when due <= now)
//   interval   days, for graduated words (0 while learning)
//   step       null once graduated, otherwise the short learning step (0, 1, ...) the word is on
//   reviewedAt client ms of the review that produced this schedule
// New and missed words go through short learning steps (minutes) before the day-based SM-2 schedule starts.
export const EF_START = 2.5;
export const EF_MIN = 1.3;
export const EF_MAX = 10;               // the server range-checks ef to 1.3..10
export const MAX_INTERVAL = 36500;      // the server range-checks interval_days to 0..36500
export const MODES = ["flashcards", "writing"];
export const NEW_CAP_SMALL = 5;
export const NEW_CAP_LARGE = 10;
export const SMALL_SET = 20;
export const LEARNING_STEPS_MIN = [10, 60];   // minutes: a new or missed word is seen again after 10 min, then 60 min
export const GRADUATE_DAYS = 1;               // passing the last step starts the day schedule at 1 day
export const MINUTE_MS = 60000;
export const DAY_MS = 86400000;

// State key for a word entry (NFC so the same word typed two ways is one schedule)
export function normKey(word) {
    return `${word.hawaiian}|${word.english}`.normalize("NFC");
}

export function initialState() {
    return { ef: EF_START, interval: 0, repetitions: 0, due: 0, reviewedAt: 0, step: null };
}

// Local calendar date as YYYY-MM-DD
export function localDate(d = new Date()) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The one place the SM-2 ease formula lives
function nextEf(ef, q) {
    return Math.max(EF_MIN, Math.min(EF_MAX, Math.round((ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 10000) / 10000)); // SM2-FORMULA
}

export const isLearning = state => !!state && state.step !== null && state.step !== undefined;

// Grade `state` with quality q (0..5) at time `now` (ms). Returns a new state; the input is never modified.
//  - new word (never reviewed): enters learning at step 0, whatever the grade
//  - miss (q < 3): back to step 0; a graduated word also takes the classic EF drop (q=1 is -0.54, floor 1.3)
//  - pass while learning: next step, or graduate (interval 1 day, repetitions 1, EF unchanged) after the last step
//  - pass on a graduated word: classic SM-2 (interval 6, then round(interval * EF) with the EF from before this review)
export function review(state, q, now = Date.now()) {
    const s = state || initialState();
    const fresh = !s.reviewedAt;
    const learning = isLearning(s);
    const enter = ef => ({ ef, interval: 0, repetitions: 0, due: now + LEARNING_STEPS_MIN[0] * MINUTE_MS, reviewedAt: now, step: 0 });
    if (q < 3) return enter(fresh || learning ? s.ef : nextEf(s.ef, q));
    if (fresh) return enter(s.ef);
    if (learning) {
        const step = s.step + 1;
        if (step < LEARNING_STEPS_MIN.length) {
            return { ef: s.ef, interval: 0, repetitions: 0, due: now + LEARNING_STEPS_MIN[step] * MINUTE_MS, reviewedAt: now, step };
        }
        return { ef: s.ef, interval: GRADUATE_DAYS, repetitions: 1, due: now + GRADUATE_DAYS * DAY_MS, reviewedAt: now, step: null };
    }
    const interval = Math.max(1, Math.min(MAX_INTERVAL, s.repetitions <= 1 ? (s.repetitions === 0 ? 1 : 6) : Math.round(s.interval * s.ef)));
    return { ef: nextEf(s.ef, q), interval, repetitions: s.repetitions + 1, due: now + interval * DAY_MS, reviewedAt: now, step: null };
}

// Flashcards: Correct = 4, Incorrect = 1
export function flashcardGrade(result) {
    return result === "correct" || result === true ? 4 : 1;
}

// Writing: gave up = 1, used a hint = 3 (even with a wrong guess), right after a wrong guess = 4, right first try = 5
export function writingGrade({ gaveUp = false, usedHint = false, wrongGuess = false } = {}) {
    if (gaveUp) return 1;
    if (usedHint) return 3;
    return wrongGuess ? 4 : 5;
}

export function newCap(n) {
    return n < SMALL_SET ? NEW_CAP_SMALL : NEW_CAP_LARGE;
}

export function isDue(state, now) {
    return !!state && Number.isFinite(state.due) && state.due <= now;
}

// True only when the spaced deck covers every deduped key of the set at the "All" frequency with no help,
// so a whole-set unaided run can still earn the full_set flag.
export function spacedFullSet({ deckKeys, setKeys, minFrequency, helped } = {}) {
    if (helped || minFrequency !== 1 || !deckKeys || !setKeys) return false;
    const have = new Set(deckKeys), want = new Set(setKeys);
    if (!want.size) return false;
    for (const k of want) if (!have.has(k)) return false;
    return true;
}

// Deck for a spaced session: due words (most overdue first, set order on ties) + new words up to newCap.
// `getState(key)` returns the schedule for this mode or a falsy value for a never-reviewed word.
export function buildDeck(words, getState, now) {
    const seen = new Set(), unique = [];
    for (const w of words || []) {
        const key = normKey(w);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({ w, key, state: getState(key) });
    }
    const due = [], fresh = [];
    let nextDue = null;
    unique.forEach((e, i) => {
        if (!e.state) fresh.push(e);
        else if (isDue(e.state, now)) due.push({ ...e, i });
        else if (Number.isFinite(e.state.due) && (nextDue === null || e.state.due < nextDue)) nextDue = e.state.due;
    });
    due.sort((a, b) => a.state.due - b.state.due || a.i - b.i);
    const newPicked = fresh.slice(0, newCap(unique.length));
    return {
        deck: [...due, ...newPicked].map(e => e.w),
        dueCount: due.length,
        newCount: newPicked.length,
        nextDue
    };
}

// "in 10 minutes" / "in 1 hour" / "tomorrow" / "in N days" / "on YYYY-MM-DD", for the "All caught up" screen
export function describeNextDue(nextDue, now) {
    if (!Number.isFinite(nextDue)) return "";
    const diff = nextDue - now;
    const plural = (n, unit) => `in ${n} ${unit}${n === 1 ? "" : "s"}`;
    if (diff < MINUTE_MS) return "in under a minute";
    const mins = Math.ceil(diff / MINUTE_MS);
    if (mins < 60) return plural(mins, "minute");
    const today = localDate(new Date(now)), dueDay = localDate(new Date(nextDue));
    if (dueDay === today) return plural(Math.round(diff / 3600000), "hour");
    const days = Math.round((Date.parse(dueDay) - Date.parse(today)) / DAY_MS);
    if (days <= 1) return "tomorrow";
    if (days <= 30) return `in ${days} days`;
    return `on ${dueDay}`;
}
