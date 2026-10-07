// Pure helpers for the spaced-repetition UI (no DOM, no network, no storage): profile totals and per-set rows,
// and the "does this count?" mode badge shown on the flashcards and writing pages.
import { normKey } from "./sm2.js";

export const MODES = ["flashcards", "writing"];

const num = v => (v === null || v === undefined || v === "" ? NaN : Number(v));

// Accepts the wire shape (due_at, learning_step) or the client shape (due, step). Returns { due, step } or null if unusable.
// step is null once a word has graduated to day-long intervals.
export function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const due = num(raw.due ?? raw.due_at);
    if (!Number.isFinite(due)) return null;
    const step = num(raw.step ?? raw.learning_step);
    return { due, step: Number.isFinite(step) ? step : null };
}

// GET /review-states body -> { key: state } for one mode (bad entries are skipped)
export function stateMapFromWire(body, mode) {
    const entries = body && body.states && body.states[mode];
    const map = new Map();
    if (!entries || typeof entries !== "object") return map;
    for (const key of Object.keys(entries)) {
        const s = normalizeState(entries[key]);
        if (s) map.set(key, s);
    }
    return map;
}

// Totals for the overview. Due now = due time reached (learning or graduated); In learning = still on the 10/60 minute
// steps; Graduated = on day intervals; Total = every scheduled word. nextDue = earliest future due time, or null.
export function summarizeStates(stateMap, now) {
    const out = { due: 0, learning: 0, graduated: 0, total: 0, nextDue: null };
    for (const s of stateMap.values()) {
        out.total++;
        if (s.step === null) out.graduated++; else out.learning++;
        if (s.due <= now) out.due++;
        else if (out.nextDue === null || s.due < out.nextDue) out.nextDue = s.due;
    }
    return out;
}

// sets: [{ id, nameHaw, nameEng, words: [{hawaiian, english}] }] -> same plus deduped NFC `keys` (computed once, reused per mode)
export function prepareSets(sets) {
    return (sets || []).map(set => {
        const keys = new Set();
        for (const w of set.words || []) keys.add(normKey(w));
        return { id: set.id, nameHaw: set.nameHaw || "", nameEng: set.nameEng || "", keys: [...keys] };
    });
}

// One row per set that has at least one scheduled word, most due first, then soonest next review, then name.
// total = words in the set; started = scheduled words; newLeft = total - started; learned = graduated words.
export function buildSetRows(preparedSets, stateMap, now) {
    const rows = [];
    for (const set of preparedSets) {
        const row = { id: set.id, nameHaw: set.nameHaw, nameEng: set.nameEng, total: set.keys.length, started: 0, due: 0, learning: 0, learned: 0, newLeft: 0, nextDue: null };
        for (const key of set.keys) {
            const s = stateMap.get(key);
            if (!s) continue;
            row.started++;
            if (s.step === null) row.learned++; else row.learning++;
            if (s.due <= now) row.due++;
            else if (row.nextDue === null || s.due < row.nextDue) row.nextDue = s.due;
        }
        if (row.started === 0) continue;
        row.newLeft = row.total - row.started;
        rows.push(row);
    }
    rows.sort((a, b) => b.due - a.due
        || (a.nextDue === null ? 1 : 0) - (b.nextDue === null ? 1 : 0)
        || (a.nextDue ?? 0) - (b.nextDue ?? 0)
        || (a.nameHaw || a.nameEng).localeCompare(b.nameHaw || b.nameEng)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return rows;
}

// Practice-page badge: is what the learner is doing right now changing their schedule?
//  spacedOn: the switch is on (and enabled); practice: Review missed round or Study full set anyway session;
//  loading / caughtUp: neutral screens. Hidden whenever the switch is off.
export function modeBadgeState({ spacedOn = false, practice = false, loading = false, caughtUp = false } = {}) {
    if (!spacedOn) return { visible: false, key: "off", label: "", counts: null, title: "", announce: "" };
    if (practice) {
        return { visible: true, key: "practice", label: "Practice · doesn't count", counts: false,
            title: "Practice only: your answers here do not change your review schedule.",
            announce: "Practice round. This does not count toward your schedule." };
    }
    if (loading || caughtUp) {
        return { visible: true, key: "neutral", label: "Spaced review", counts: null,
            title: "Spaced review", announce: "" };
    }
    return { visible: true, key: "counts", label: "Spaced review · counts", counts: true,
        title: "Your answers change your review schedule. Saved when you finish the deck.",
        announce: "Spaced review. Your answers count toward your schedule." };
}
