import { API_BASE_URL } from "/scripts/config.js";
import { getToken } from "/scripts/auth.js";

// Study analytics: records set opens/starts/completions and every attempt so the database can answer
// "which sets/words are hard" and "which sets are opened but not finished". Best-effort only:
// it works logged out (random per-browser visitor id) and can never interrupt studying.

const FLUSH_DELAY_MS = 2000;
const BATCH_SIZE = 50;             // the backend accepts at most 50 events per request

let mode = null;                   // 'flashcards' | 'writing' | 'quiz'
let getContext = () => ({ setKey: null });
let buffer = [];
let flushTimer = null;
let startedLogged = false;         // per opened set
let completedLogged = false;

const VISITOR_KEY = `visitorId`;
let fallbackVisitorId = null;      // used when localStorage is blocked

// crypto.randomUUID needs iOS 15.4+, so fall back to getRandomValues (iOS 11+)
export function uuidv4() {
    if (typeof crypto.randomUUID === `function`) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, `0`)).join(``);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function getVisitorId() {
    try {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = uuidv4();
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    } catch {
        if (!fallbackVisitorId) fallbackVisitorId = uuidv4();
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
// extra: optional per-event fields, e.g. { variant } to override the deck's variant
export function logAttempt(wordHawaiian, outcome, isRetry = false, extra = {}) {
    ensureStarted();
    enqueue({ kind: `attempt`, word_hawaiian: wordHawaiian, outcome, is_retry: isRetry, ...extra });
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
