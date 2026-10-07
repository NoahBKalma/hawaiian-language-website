// Spaced-repetition schedules per (mode, word key): { ef, interval, repetitions, due, reviewedAt }.
// Signed out: guest localStorage key (memory only if storage throws). Signed in: a per-user localStorage cache; GET/PUT /review-states
// is the source of truth. Merging is per entry by newest reviewedAt. Plain fetch (not authFetch): a stale token must never redirect. Never throws.
//
// Sync gate: while signed in, nothing is PUT until the initial GET succeeds, fails or 401s (syncPhase 'pending' -> 'settled').
// Reviews made before then keep a rebase log so they can be recomputed from the server's newer schedule.
import { review, initialState, MODES } from "./sm2.js";

export const KEY_PREFIX = "olelo:review-state:v1:";
export const GUEST_KEY = `${KEY_PREFIX}guest`;
export const USER_KEY_PREFIX = `${KEY_PREFIX}u`;
export const MAX_KEY_LEN = 401;
export const CHUNK_ITEMS = 100;
export const CHUNK_BYTES = 60000;

// user_id from the JWT payload (base64url). Only names the cache key, never used for auth. Returns null if unreadable.
export function userIdFromToken(token) {
    try {
        const part = String(token).split(".")[1];
        if (!part) return null;
        let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const bin = atob(b64);
        const json = typeof TextDecoder === "function" ? new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))) : bin;
        const id = JSON.parse(json).user_id;
        return Number.isInteger(id) || (typeof id === "string" && /^\d+$/.test(id)) ? String(id) : null;
    } catch { return null; }
}

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
// Accepts both client (interval/due/step/reviewedAt) and wire (interval_days/due_at/learning_step/reviewed_at) field names; null if unusable.
// due is UTC ms; step is null once graduated. A cache written by the earlier date-string format is ignored.
function normState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const due = num(raw.due ?? raw.due_at, NaN), reviewedAt = num(raw.reviewedAt ?? raw.reviewed_at, NaN);
    if (!Number.isFinite(due) || !Number.isFinite(reviewedAt)) return null;
    const rawStep = raw.step ?? raw.learning_step;
    const step = rawStep === null || rawStep === undefined || !Number.isFinite(Number(rawStep)) ? null : Number(rawStep);
    return { ef: num(raw.ef, 2.5), interval: num(raw.interval ?? raw.interval_days, 0), repetitions: num(raw.repetitions, 0), due, reviewedAt, step };
}
const toWire = (mode, key, s) => ({ mode, word_key: key, ef: s.ef, interval_days: s.interval, repetitions: s.repetitions, due_at: s.due, learning_step: s.step, reviewed_at: s.reviewedAt });
const idOf = (mode, key) => `${mode}\n${key}`;
const bytes = str => (typeof TextEncoder === "function" ? new TextEncoder().encode(str).length : str.length);

export function createReviewStore({
    fetchFn, token, userId, baseUrl = "", storage = null, debounceMs = 800, readyTimeoutMs = 2000, getTimeoutMs = 10000,
    now = () => Date.now(), setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout
} = {}) {
    const mem = {};                       // mode -> { key -> state }
    MODES.forEach(m => { mem[m] = {}; });
    const dirty = new Map();              // idOf -> [mode, key]
    const log = new Map();                // idOf -> { mode, key, before, q, today, reviewedAt }
    let isReady = false, canSave = true, cacheOn = true, resolveReady, timer = null, loadFailed = false;
    let syncPhase = "settled", guestMerged = false, pushing = Promise.resolve();
    const ready = new Promise(r => { resolveReady = r; });

    const authed = () => { try { return !!(token && token()); } catch { return false; } };
    const wasAuthed = authed();
    const uid = (() => {
        if (!wasAuthed) return null;
        try { const v = typeof userId === "function" ? userId() : userId; if (v !== undefined && v !== null && v !== "") return String(v); } catch { /* fall through */ }
        try { return userIdFromToken(token()); } catch { return null; }
    })();
    const cacheKey = wasAuthed ? (uid ? `${USER_KEY_PREFIX}${uid}` : null) : GUEST_KEY;   // signed in with no readable id: memory only
    if (wasAuthed) syncPhase = "pending";
    const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
    const bucket = mode => mem[mode] || (mem[mode] = {});

    function readInto(key, target) {
        try {
            const raw = storage && key && storage.getItem(key);
            if (!raw) return 0;
            const obj = JSON.parse(raw);
            let n = 0;
            if (obj && typeof obj === "object") for (const mode of Object.keys(obj)) {
                if (!obj[mode] || typeof obj[mode] !== "object") continue;
                for (const k of Object.keys(obj[mode])) { const s = normState(obj[mode][k]); if (s) { (target[mode] || (target[mode] = {}))[k] = s; n++; } }
            }
            return n;
        } catch { return 0; }   // unreadable cache: start empty
    }
    function writeCache() {
        if (!cacheOn || !cacheKey) return;
        try { if (storage) storage.setItem(cacheKey, JSON.stringify(mem)); } catch { /* in-memory only */ }
    }
    const cachedCount = readInto(cacheKey, mem);

    function markReady() { if (!isReady) { isReady = true; resolveReady(); } }
    function markDirty(mode, key) { if (key.length <= MAX_KEY_LEN) dirty.set(idOf(mode, key), [mode, key]); else console.warn("review-store: word key too long, not synced"); }

    // ---- network ----
    function chunks(entries) {
        const out = []; let cur = [], size = 12;   // 12 = {"items":[ ]} wrapper
        for (const e of entries) {
            const len = bytes(JSON.stringify(toWire(e.mode, e.key, e.s))) + 1;
            if (cur.length && (cur.length >= CHUNK_ITEMS || size + len > CHUNK_BYTES)) { out.push(cur); cur = []; size = 12; }
            cur.push(e); size += len;
        }
        if (cur.length) out.push(cur);
        return out;
    }
    // Sends every dirty entry; resolves true when all chunks were accepted. Skipped items count as final.
    async function push(keepalive) {
        if (syncPhase !== "settled" || !authed() || !canSave || !fetchFn || !dirty.size) return !dirty.size;
        const picked = [...dirty.values()].map(([mode, key]) => ({ mode, key, s: bucket(mode)[key] })).filter(e => e.s);
        for (const [id, [mode, key]] of [...dirty]) if (!bucket(mode)[key]) dirty.delete(id);
        let allOk = true;
        const sendChunk = async chunk => {
            try {
                const res = await fetchFn(`${baseUrl}/review-states`, { method: "PUT", headers: headers(), body: JSON.stringify({ items: chunk.map(e => toWire(e.mode, e.key, e.s)) }), keepalive });
                if (res && res.status === 401) { canSave = false; cacheOn = false; allOk = false; return; }
                if (res && res.ok === false) { allOk = false; return; }
                for (const e of chunk) if (bucket(e.mode)[e.key] && bucket(e.mode)[e.key].reviewedAt === e.s.reviewedAt) dirty.delete(idOf(e.mode, e.key));
            } catch { allOk = false; }   // offline / API down: stays dirty
        };
        const parts = chunks(picked);
        if (keepalive) await Promise.all(parts.map(sendChunk));
        else for (const p of parts) { if (!canSave) { allOk = false; break; } await sendChunk(p); }
        return allOk && !dirty.size;
    }
    function pushNow(keepalive) {
        pushing = pushing.then(() => push(keepalive), () => false);
        return pushing;
    }
    function scheduleSave() {
        if (!authed()) return;
        if (timer !== null) clearTimeoutFn(timer);
        timer = setTimeoutFn(() => { timer = null; pushNow(false); }, debounceMs);
    }

    // ---- load / merge ----
    async function fetchStates() {
        let timeoutId, controller = null;
        try { controller = typeof AbortController === "function" ? new AbortController() : null; } catch { controller = null; }
        const timeout = new Promise((_, rej) => { timeoutId = setTimeoutFn(() => { try { controller && controller.abort(); } catch { /* ignore */ } rej(new Error("timeout")); }, getTimeoutMs); });
        const work = (async () => {
            const res = await fetchFn(`${baseUrl}/review-states`, { headers: headers(), ...(controller ? { signal: controller.signal } : {}) });
            if (res.status === 401) return { status: 401 };
            if (!res.ok) return { status: res.status };
            return { status: 200, data: await res.json() };
        })();
        work.catch(() => {});
        try { return await Promise.race([work, timeout]); } finally { clearTimeoutFn(timeoutId); }
    }

    function applyServer(states) {
        const all = states || {};
        for (const mode of new Set([...MODES, ...Object.keys(all)])) {
            const entries = all[mode] && typeof all[mode] === "object" ? all[mode] : {};
            const b = bucket(mode);
            for (const key of Object.keys(entries)) {
                const server = normState(entries[key]);
                if (!server) continue;
                const entry = log.get(idOf(mode, key)), local = b[key];
                if (entry) {
                    const baseAt = (entry.before && entry.before.reviewedAt) || 0;
                    if (server.reviewedAt > baseAt) {
                        // another device reviewed it after our pre-session state: redo this review on top of theirs, keeping its original time
                        b[key] = review(server, entry.q, entry.reviewedAt);   // replaces memory, cache and dirty entry unconditionally
                        markDirty(mode, key);
                    }
                    continue;
                }
                if (!local || server.reviewedAt > local.reviewedAt) b[key] = server;
                else if (local.reviewedAt > server.reviewedAt) markDirty(mode, key);
            }
            // local entries the server has never seen (offline / failed saves / old cache)
            for (const key of Object.keys(b)) if (!(key in entries) && !log.has(idOf(mode, key))) markDirty(mode, key);
        }
    }
    function mergeGuest() {
        const guest = {};
        if (readInto(GUEST_KEY, guest) === 0) return false;
        for (const mode of Object.keys(guest)) {
            const b = bucket(mode);
            for (const key of Object.keys(guest[mode])) {
                const g = guest[mode][key];
                if (!b[key] || g.reviewedAt > b[key].reviewedAt) { b[key] = g; markDirty(mode, key); }
            }
        }
        return true;
    }
    function removeGuest() { try { if (storage) storage.removeItem(GUEST_KEY); } catch { /* ignore */ } }

    async function load() {
        if (!wasAuthed || !authed() || !fetchFn) { syncPhase = "settled"; markReady(); return; }
        if (cachedCount > 0) markReady();
        const cap = setTimeoutFn(markReady, readyTimeoutMs);
        let outcome;
        try { outcome = await fetchStates(); } catch { outcome = null; }
        clearTimeoutFn(cap);
        let sawGuest = false;
        if (outcome && outcome.status === 401) { canSave = false; cacheOn = false; }
        else if (outcome && outcome.status === 200) {
            try { applyServer((outcome.data && outcome.data.states) || {}); } catch (e) { console.error(e); }
            sawGuest = mergeGuest();
            guestMerged = sawGuest;
            writeCache();
        } else loadFailed = true;   // network error, timeout or 5xx: push what we have, the server's newest-wins check protects other devices
        log.clear();
        syncPhase = "settled";
        markReady();
        if (canSave) {
            if (timer !== null) { clearTimeoutFn(timer); timer = null; }
            const ok = await pushNow(false);
            if (ok && sawGuest) removeGuest();
        }
    }

    return {
        ready,
        get isReady() { return isReady; },
        get syncPhase() { return syncPhase; },
        get loadFailed() { return loadFailed; },
        get canSave() { return canSave; },
        get cacheKey() { return cacheKey; },
        load,
        // schedule for this mode+key, or undefined if never reviewed
        get(mode, key) { const s = (mem[mode] || {})[key]; return s ? { ...s } : undefined; },
        record(mode, key, newState, meta = {}) {
            const s = normState(newState);
            if (!s || typeof key !== "string" || !MODES.includes(mode)) return;
            bucket(mode)[key] = s;
            if (syncPhase === "pending" && meta && Number.isFinite(meta.q)) {
                const prev = log.get(idOf(mode, key));   // a re-grade replaces the entry but `before` stays the pre-session state
                log.set(idOf(mode, key), { mode, key, before: prev ? prev.before : (meta.base || null), q: meta.q, reviewedAt: s.reviewedAt });
            }
            markDirty(mode, key);
            writeCache();
            scheduleSave();
        },
        // keepalive PUT of everything dirty; sends nothing until the initial GET has settled
        flush() {
            if (timer !== null) { clearTimeoutFn(timer); timer = null; }
            return push(true);   // not queued behind a slow debounce push: pagehide has no time to wait
        },
        // test hook: resolves when queued pushes finish
        idle() { return pushing; }
    };
}

// Per-session snapshot so re-grading a word recomputes from its pre-session schedule (a word is never reviewed twice).
export function createReviewSession(store, mode, { reviewFn = review } = {}) {
    const before = new Map();
    const pending = new Map();   // key -> { q, now }: staged answers, not yet in the store (last grade per key wins)
    return {
        // Held-until-deck-end flow. stage() computes the next schedule from the pre-session snapshot and returns it for UI
        // decisions, touching neither the store, the cache nor the network.
        stage(key, q, nowMs = Date.now()) {
            if (!before.has(key)) before.set(key, store.get(mode, key) || initialState());
            pending.set(key, { q, now: nowMs });
            return reviewFn(before.get(key), q, nowMs);
        },
        // Writes every staged key once (reviewedAt = the time of its answer). If the store gained a newer schedule for a key
        // since the snapshot (a late server GET), that one is the base. Returns [{ key, q, now, next }], then clears the session.
        commit() {
            const out = [];
            for (const [key, { q, now }] of pending) {
                let base = before.get(key) || initialState();
                const cur = store.get(mode, key);
                if (cur && cur.reviewedAt > (base.reviewedAt || 0)) base = cur;
                const next = reviewFn(base, q, now);
                store.record(mode, key, next, { base, q });
                out.push({ key, q, now, next });
            }
            pending.clear(); before.clear();
            return out;
        },
        // drops all staged answers: the store is never touched
        discard() { pending.clear(); before.clear(); },
        get pendingCount() { return pending.size; },
        // grade `key` with quality q; records and returns the new schedule
        grade(key, q, nowMs = Date.now()) {
            if (!before.has(key)) before.set(key, store.get(mode, key) || initialState());
            const base = before.get(key);
            const next = reviewFn(base, q, nowMs);
            store.record(mode, key, next, { base, q });
            return next;
        },
        before(key) { return before.get(key) || store.get(mode, key) || initialState(); },
        reset() { before.clear(); pending.clear(); }
    };
}
