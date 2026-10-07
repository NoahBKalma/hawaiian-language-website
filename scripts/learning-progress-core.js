// Shared learning-trail progress (demo phase): one number, done = targets finished (0-5), used by both the map and the list view.
// Signed in: loaded from / saved to the account (GET/PUT /learning-progress). Signed out: in memory for this visit only
// (TODO: offer to save it to the account on sign-in, see CLAUDE.md "Learning progress").
// Uses a plain fetch (not authFetch): a stale token must never redirect the visitor away from the Learning page.
export const TOTAL = 5;

export function createStore({ fetchFn, token, baseUrl = "", debounceMs = 300, readyTimeoutMs = 2000, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
    let done = 0, localWrites = 0, isReady = false, saveTimer = null, saving = false, canSave = true;
    const subs = new Set();
    let resolveReady;
    const ready = new Promise(r => { resolveReady = r; });
    const clamp = n => Math.max(0, Math.min(TOTAL, Math.round(Number(n) || 0)));
    const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

    function markReady() { if (!isReady) { isReady = true; resolveReady(); notify("ready"); } }
    function notify(origin) { subs.forEach(fn => { try { fn({ done, origin }); } catch (e) { console.error(e); } }); }

    async function save(keepalive = false) {
        saveTimer = null;
        if (!token() || !canSave || !fetchFn) return;
        try {
            const res = await fetchFn(`${baseUrl}/learning-progress`, { method: "PUT", headers: headers(), body: JSON.stringify({ level: 1, done_count: done }), keepalive });
            if (res && res.status === 401) canSave = false;          // expired token: keep working in memory, never redirect
        } catch { /* offline / API down: stay in memory */ }
    }
    function scheduleSave(now) {
        if (!token()) return;
        if (saveTimer) clearTimeoutFn(saveTimer);
        if (now) { save(); return; }
        saveTimer = setTimeoutFn(save, debounceMs);
    }

    async function load() {
        if (!token() || !fetchFn) { markReady(); return; }
        const cap = setTimeoutFn(markReady, readyTimeoutMs);
        try {
            const res = await fetchFn(`${baseUrl}/learning-progress`, { headers: headers() });
            if (res.status === 401) canSave = false;
            else if (res.ok) {
                const data = await res.json();
                if (localWrites === 0) { done = clamp(data.done_count); notify("server"); }   // a late answer never overwrites a local advance
            }
        } catch { /* stay in memory */ }
        clearTimeoutFn(cap);
        markReady();
    }

    const api = {
        ready,
        get done() { return done; },
        get isReady() { return isReady; },
        canAdvance() { return isReady && done < TOTAL; },
        set(n, { origin = "local", now = false } = {}) {
            const v = clamp(n);
            if (v === done) return;
            done = v; localWrites++;
            notify(origin); scheduleSave(now);
        },
        advance(origin = "local") { if (api.canAdvance()) api.set(done + 1, { origin, now: true }); },
        // always notifies, even at 0: a view may be mid-flight toward the first target and must be pulled back
        reset(origin = "local") { done = 0; localWrites++; notify(origin); scheduleSave(true); },
        subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
        flush() { if (saveTimer) { clearTimeoutFn(saveTimer); save(true); } },   // best-effort on pagehide (a preflighted keepalive request may be dropped)
        load
    };
    return api;
}
