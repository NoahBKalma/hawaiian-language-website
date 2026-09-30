import { API_BASE_URL } from "/scripts/config.js";
import { getToken } from "/scripts/auth.js";

// Study analytics: records set opens/starts/completions and every attempt so the database can answer
// "which sets/words are hard" and "which sets are opened but not finished". Best-effort only:
// it works logged out (random per-browser visitor id) and can never interrupt studying.

const FLUSH_DELAY_MS = 2000;
const BATCH_SIZE = 50;             // the backend accepts at most 50 events per request

let mode = null;                   // 'flashcards' | 'writing'
let getContext = () => ({ setKey: null });
let buffer = [];
let flushTimer = null;
let startedLogged = false;         // per opened set
let completedLogged = false;

const VISITOR_KEY = `visitorId`;
let fallbackVisitorId = null;      // used when localStorage is blocked

export function getVisitorId() {
    try {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    } catch {
        if (!fallbackVisitorId) fallbackVisitorId = crypto.randomUUID();
        return fallbackVisitorId;
    }
}

// pageMode: 'flashcards' | 'writing'. context() returns {setKey, minFrequency, variant} for the current deck
export function initStudyLog(pageMode, context) {
    mode = pageMode;
    getContext = context;
}

function enqueue(event) {
    const { setKey, minFrequency, variant } = getContext();
    if (mode === null || setKey === null || setKey === undefined) return;

    buffer.push({
        visitor_id: getVisitorId(),
        set_key: setKey,
        min_frequency: minFrequency ?? 1,
        mode,
        ...(variant ? { variant } : {}),
        ...event
    });

    if (buffer.length >= BATCH_SIZE) flush();
    else if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

export function flush() {
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
    while (buffer.length > 0) {
        const events = buffer.splice(0, BATCH_SIZE);
        const headers = { 'Content-Type': `application/json` };
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        // keepalive lets the request outlive the page; failures are dropped, never retried
        fetch(`${API_BASE_URL}/study-events`, {
            method: `POST`,
            headers,
            body: JSON.stringify({ events }),
            keepalive: true
        }).catch(() => {});
    }
}

// A set was opened or changed (not a restart or shuffle)
export function logSetOpened() {
    startedLogged = false;
    completedLogged = false;
    enqueue({ kind: `set`, event_type: `set_opened` });
}

function ensureStarted() {
    if (startedLogged) return;
    startedLogged = true;
    enqueue({ kind: `set`, event_type: `set_started` });
}

// outcome: correct | correct_helped | incorrect | hint_blanks | hint_letter | gave_up
export function logAttempt(wordHawaiian, outcome, isRetry = false) {
    ensureStarted();
    enqueue({ kind: `attempt`, word_hawaiian: wordHawaiian, outcome, is_retry: isRetry });
}

export function logSetCompleted() {
    if (completedLogged) return;
    ensureStarted();
    completedLogged = true;
    enqueue({ kind: `set`, event_type: `set_completed` });
}

// Used when an account is deleted: nothing pending may be sent and the browser gets a new identity
export function clearStudyLog() {
    buffer = [];
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
    try { localStorage.removeItem(VISITOR_KEY); } catch { /* storage blocked */ }
    fallbackVisitorId = null;
}

document.addEventListener(`visibilitychange`, () => {
    if (document.visibilityState === `hidden`) flush();
});
window.addEventListener(`pagehide`, flush);
