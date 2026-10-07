// Per-target unit progress: done = units finished (0..MAX_UNITS) for each of the 5 targets.
// Signed out: localStorage only. Signed in: localStorage is a cache; GET/PUT /unit-progress is the source of truth, except load() keeps the higher of cache/server per target and pushes the cache up.
// Plain fetch (not authFetch): a stale token must never redirect the visitor. Never throws.
import { MAX_UNITS } from "./unit-data.js";

export const STORAGE_KEY = "haw-unit-progress";
const TARGET_IDS = [1, 2, 3, 4, 5];

export function createUnitStore({ fetchFn, token, baseUrl = "", storage = null, debounceMs = 300, readyTimeoutMs = 2000, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
    const state = {}, localWrites = {}, timers = new Map();
    TARGET_IDS.forEach(c => { state[c] = 0; localWrites[c] = 0; });
    let isReady = false, canSave = true, resolveReady;
    const subs = new Set();
    const ready = new Promise(r => { resolveReady = r; });
    const clamp = n => Math.max(0, Math.min(MAX_UNITS, Math.round(Number(n) || 0)));
    const validTarget = target => { const n = Number(target); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
    const authed = () => { try { return !!(token && token()); } catch { return false; } };
    const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

    function notify(target, origin) { subs.forEach(fn => { try { fn({ target, done: target ? state[target] : 0, origin }); } catch (e) { console.error(e); } }); }
    function markReady() { if (!isReady) { isReady = true; resolveReady(); notify(null, "ready"); } }

    function readCache() {
        try {
            const raw = storage && storage.getItem(STORAGE_KEY);
            if (!raw) return;
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object") TARGET_IDS.forEach(c => { state[c] = clamp(obj[c]); });
        } catch { /* unreadable cache: start empty */ }
    }
    function writeCache() {
        try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(TARGET_IDS.map(c => [String(c), state[c]])))); } catch { /* in-memory only */ }
    }
    readCache();

    async function save(target, keepalive = false) {
        timers.delete(target);
        if (!authed() || !canSave || !fetchFn) return;
        try {
            const res = await fetchFn(`${baseUrl}/unit-progress`, { method: "PUT", headers: headers(), body: JSON.stringify({ level: 1, target, done_count: state[target] }), keepalive });
            if (res && res.status === 401) canSave = false;      // expired token: keep working locally
        } catch { /* offline / API down */ }
    }
    function scheduleSave(target, now) {
        if (!authed()) return;
        if (timers.has(target)) { clearTimeoutFn(timers.get(target)); timers.delete(target); }
        if (now) { save(target, true); return; }   // keepalive: survives the navigation that usually follows a "done"
        timers.set(target, setTimeoutFn(() => save(target), debounceMs));
    }

    async function load() {
        if (!authed() || !fetchFn) { markReady(); return; }
        const cap = setTimeoutFn(markReady, readyTimeoutMs);
        try {
            const res = await fetchFn(`${baseUrl}/unit-progress`, { headers: headers() });
            if (res.status === 401) canSave = false;
            else if (res.ok) {
                const data = await res.json();
                const targets = (data && data.targets) || {}, push = [];
                TARGET_IDS.forEach(c => {
                    if (localWrites[c] > 0) return;              // a late answer never overwrites a local write
                    const v = clamp(targets[c]);
                    if (state[c] > v) { push.push(c); return; }  // cache is ahead (failed save / signed-out progress): keep it and push it up
                    if (v !== state[c]) { state[c] = v; notify(c, "server"); }
                });
                writeCache();
                for (const c of push) await save(c);             // in order: the server rejects a target before the previous one is complete
            }
        } catch { /* keep the cache */ }
        clearTimeoutFn(cap);
        markReady();
    }

    return {
        ready,
        get isReady() { return isReady; },
        load,
        get(target) { const c = validTarget(target); return c ? state[c] : 0; },
        set(target, n, { now = false, origin = "local" } = {}) {
            const c = validTarget(target); if (!c) return;
            const v = clamp(n);
            if (v === state[c]) return;
            state[c] = v; localWrites[c]++;
            writeCache(); notify(c, origin); scheduleSave(c, now);
        },
        // always notifies, even at 0
        reset(target, origin = "local") {
            const c = validTarget(target); if (!c) return;
            state[c] = 0; localWrites[c]++;
            writeCache(); notify(c, origin); scheduleSave(c, true);
        },
        subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
        flush() { [...timers.keys()].forEach(c => { clearTimeoutFn(timers.get(c)); save(c, true); }); }
    };
}
