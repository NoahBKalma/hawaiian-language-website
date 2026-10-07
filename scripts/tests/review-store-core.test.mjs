// Run: node --test "scripts/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { createReviewStore, createReviewSession, userIdFromToken, GUEST_KEY, USER_KEY_PREFIX } from "../review-store-core.js";
import { review, initialState } from "../sm2.js";

const b64u = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
const jwt = id => `h.${b64u({ user_id: id, exp: 9999999999 })}.s`;
const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const DUE = 1791504000000;   // a fixed UTC ms due time
const st = (ef, interval, repetitions, due, reviewedAt, step = null) => ({ ef, interval, repetitions, due, reviewedAt, step });
const wire = (s) => ({ ef: s.ef, interval_days: s.interval, repetitions: s.repetitions, due_at: s.due, learning_step: s.step, reviewed_at: s.reviewedAt });

function sched() {
    const q = []; let id = 0;
    return {
        setTimeoutFn: (fn, ms) => { q.push({ id: ++id, fn, ms }); return id; },
        clearTimeoutFn: i => { const k = q.findIndex(t => t.id === i); if (k >= 0) q.splice(k, 1); },
        // runs timers whose delay is <= ms
        run: async ms => { for (const t of q.filter(t => t.ms <= ms)) { q.splice(q.indexOf(t), 1); await t.fn(); } },
        pending: () => q.length
    };
}
const memStorage = (init = {}, { throws = false } = {}) => {
    const m = new Map(Object.entries(init));
    const s = {
        getItem: k => { if (throws) throw new Error("blocked"); return m.has(k) ? m.get(k) : null; },
        setItem: (k, v) => { if (throws) throw new Error("blocked"); m.set(k, String(v)); },
        removeItem: k => { if (throws) throw new Error("blocked"); m.delete(k); },
        m
    };
    return s;
};
// a promise whose resolution the test controls
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

function mk({ token = jwt(7), fetchFn, storage = memStorage(), ...o } = {}) {
    const calls = []; const s = sched();
    const f = fetchFn || (async (u, opt) => (opt && opt.method ? res(200, { saved: 1, skipped: 0 }) : res(200, { states: {} })));
    const wrapped = async (url, opt = {}) => { calls.push({ url, ...opt }); return f(url, opt); };
    const store = createReviewStore({ fetchFn: wrapped, token: token === null ? () => null : () => token, baseUrl: "http://api", storage, ...s, ...o });
    const puts = () => calls.filter(c => c.method === "PUT");
    const putItems = () => puts().flatMap(c => JSON.parse(c.body).items);
    return { store, calls, s, storage, puts, putItems };
}
const getServer = states => async (u, o) => (o && o.method ? res(200, { saved: 1, skipped: 0 }) : res(200, { states }));
const cacheOf = (storage, id = 7) => JSON.parse(storage.m.get(`${USER_KEY_PREFIX}${id}`));
const settle = () => new Promise(r => setImmediate(r));

test("guest store persists to the injected storage with zero network", async () => {
    const a = mk({ token: null }); await a.store.load(); await a.store.ready;
    const s1 = st(2.5, 1, 1, DUE, 100);
    a.store.record("flashcards", "a|b", s1, { base: initialState(), q: 4 });
    await a.s.run(1e9);
    assert.equal(a.calls.length, 0);
    assert.deepEqual(JSON.parse(a.storage.m.get(GUEST_KEY)), { flashcards: { "a|b": s1 }, writing: {} });
    const b = mk({ token: null, storage: a.storage });
    assert.deepEqual(b.store.get("flashcards", "a|b"), s1);
    assert.equal(b.store.get("writing", "a|b"), undefined);
});

test("throwing storage still works in memory", async () => {
    const a = mk({ token: null, storage: memStorage({}, { throws: true }) }); await a.store.load();
    a.store.record("writing", "x|y", st(2.5, 1, 1, DUE, 5), { base: null, q: 5 });
    assert.equal(a.store.get("writing", "x|y").due, DUE);
});

test("signed-in cache uses a per-user key and user B never sees user A's cache", async () => {
    const storage = memStorage();
    const a = mk({ token: jwt(7), storage, fetchFn: getServer({}) }); await a.store.load();
    a.store.record("flashcards", "a|b", st(2.5, 1, 1, DUE, 100), { base: initialState(), q: 4 });
    assert.equal(a.store.cacheKey, `${USER_KEY_PREFIX}7`);
    assert.ok(storage.m.has(`${USER_KEY_PREFIX}7`));
    assert.equal(storage.m.has(GUEST_KEY), false);
    const b = mk({ token: jwt(8), storage, fetchFn: getServer({}) });
    assert.equal(b.store.get("flashcards", "a|b"), undefined);
    const a2 = mk({ token: jwt(7), storage, fetchFn: getServer({}) });
    assert.ok(a2.store.get("flashcards", "a|b"));
});

test("an old date-format cache (due as YYYY-MM-DD) is ignored", () => {
    const storage = memStorage({ [`${USER_KEY_PREFIX}7`]: JSON.stringify({ flashcards: { "a|b": { ef: 2.5, interval: 6, repetitions: 2, due: "2026-10-08", reviewedAt: 100 } }, writing: {} }) });
    const a = mk({ token: jwt(7), storage, fetchFn: getServer({}) });
    assert.equal(a.store.get("flashcards", "a|b"), undefined);
});

test("signed in with an unreadable token: memory only, no cache, never throws", async () => {
    const storage = memStorage();
    const a = mk({ token: "not-a-jwt", storage, fetchFn: getServer({}) }); await a.store.load();
    a.store.record("flashcards", "a|b", st(2.5, 1, 1, DUE, 100), { base: null, q: 4 });
    assert.equal(a.store.cacheKey, null);
    assert.equal(storage.m.size, 0);
    assert.ok(a.store.get("flashcards", "a|b"));
});

test("base64url token decode: '-' '_' and missing padding; malformed gives null", () => {
    const payload = { user_id: 4242, note: "ûÿ~??>>" };   // forces '-' / '_' in base64url
    const enc = b64u(payload);
    assert.match(enc, /[-_]/);
    assert.equal(enc.length % 4 !== 0, true);            // unpadded
    assert.equal(userIdFromToken(`h.${enc}.s`), "4242");
    assert.equal(userIdFromToken(jwt(9)), "9");
    assert.equal(userIdFromToken("garbage"), null);
    assert.equal(userIdFromToken("a.%%%.c"), null);
    assert.equal(userIdFromToken(`h.${b64u({ nope: 1 })}.s`), null);
    assert.equal(userIdFromToken(undefined), null);
});

test("load(): merges by newest reviewedAt and pushes only entries newer locally", async () => {
    const storage = memStorage({ [`${USER_KEY_PREFIX}7`]: JSON.stringify({ flashcards: {
        "local-newer|x": st(2.5, 6, 2, DUE, 500),
        "server-newer|x": st(2.5, 1, 1, DUE, 100),
        "same|x": st(2.5, 1, 1, DUE, 300),
        "unseen|x": st(2.5, 1, 1, DUE, 50)
    } }) });
    const server = { flashcards: {
        "local-newer|x": wire(st(2.5, 1, 1, DUE, 200)),
        "server-newer|x": wire(st(2.6, 6, 2, DUE, 400)),
        "same|x": wire(st(2.5, 1, 1, DUE, 300)),
        "only-server|x": wire(st(2.5, 1, 1, DUE, 10))
    } };
    const a = mk({ storage, fetchFn: getServer(server) });
    await a.store.load();
    assert.equal(a.store.get("flashcards", "server-newer|x").reviewedAt, 400);
    assert.equal(a.store.get("flashcards", "only-server|x").reviewedAt, 10);
    assert.equal(a.store.get("flashcards", "local-newer|x").reviewedAt, 500);
    assert.deepEqual(a.putItems().map(i => i.word_key).sort(), ["local-newer|x", "unseen|x"]);
    assert.equal(a.store.syncPhase, "settled");
});

test("sync gate: debounce firing before the GET resolves sends zero PUTs, then one rebased PUT", async () => {
    const get = deferred();
    const a = mk({ fetchFn: async (u, o) => (o && o.method ? res(200, { saved: 1, skipped: 0 }) : get.p) });
    const loading = a.store.load();
    const base = initialState();
    const early = review(base, 4, 1000);
    a.store.record("flashcards", "a|b", early, { base, q: 4 });
    assert.equal(a.store.syncPhase, "pending");
    await a.s.run(800);                         // debounce fires while the GET is pending
    await a.store.flush();                      // so does a pagehide flush
    assert.equal(a.puts().length, 0);
    const serverState = st(2.6, 6, 2, DUE, 500);   // another device reviewed it before our review
    get.resolve(res(200, { states: { flashcards: { "a|b": wire(serverState) } } }));
    await loading;
    assert.equal(a.puts().length, 1);
    const [item] = a.putItems();
    const want = review(serverState, 4, 1000);            // recomputed from the server entry, original reviewedAt kept
    assert.deepEqual(item, { mode: "flashcards", word_key: "a|b", ef: want.ef, interval_days: want.interval, repetitions: want.repetitions, due_at: want.due, learning_step: want.step, reviewed_at: 1000 });
    assert.notEqual(item.interval_days, early.interval);
});

test("sync gate: GET failure pushes unrebased, 401 sends nothing", async () => {
    const get1 = deferred();
    const a = mk({ fetchFn: async (u, o) => (o && o.method ? res(200, {}) : get1.p) });
    const l1 = a.store.load();
    const early = review(initialState(), 4, 1000);
    a.store.record("flashcards", "a|b", early, { base: initialState(), q: 4 });
    await a.s.run(800);
    assert.equal(a.puts().length, 0);
    get1.reject(new Error("offline"));
    await l1;
    assert.equal(a.store.loadFailed, true);
    assert.equal(a.puts().length, 1);
    assert.equal(a.putItems()[0].interval_days, early.interval);

    const get2 = deferred();
    const b = mk({ fetchFn: async (u, o) => (o && o.method ? res(200, {}) : get2.p) });
    const l2 = b.store.load();
    b.store.record("flashcards", "a|b", early, { base: initialState(), q: 4 });
    await b.s.run(800);
    get2.resolve(res(401, {}));
    await l2;
    assert.equal(b.puts().length, 0);
    assert.equal(b.store.syncPhase, "settled");
});

test("a late GET after the ready timeout rebases and never overwrites a newer server schedule", async () => {
    const get = deferred();
    const a = mk({ fetchFn: async (u, o) => (o && o.method ? res(200, {}) : get.p) });
    const loading = a.store.load();
    await a.s.run(2000);                         // ready timeout fires
    await a.store.ready;
    assert.equal(a.store.isReady, true);
    assert.equal(a.store.syncPhase, "pending");
    const early = review(initialState(), 5, 1000);
    a.store.record("writing", "a|b", early, { base: initialState(), q: 5 });
    const serverState = st(2.7, 6, 2, DUE, 800);
    get.resolve(res(200, { states: { writing: { "a|b": wire(serverState) } } }));
    await loading;
    const want = review(serverState, 5, 1000);
    assert.deepEqual(a.store.get("writing", "a|b"), want);
    assert.equal(a.putItems()[0].interval_days, want.interval);
});

test("several reviews of a key before the GET: only the last is rebased, from the pre-session state", async () => {
    const get = deferred();
    const a = mk({ fetchFn: async (u, o) => (o && o.method ? res(200, {}) : get.p) });
    const loading = a.store.load();
    const session = createReviewSession(a.store, "flashcards");
    session.grade("a|b", 1, 1000);
    session.grade("a|b", 4, 2000);            // re-grade
    const serverState = st(2.6, 6, 2, DUE, 500);
    get.resolve(res(200, { states: { flashcards: { "a|b": wire(serverState) } } }));
    await loading;
    assert.deepEqual(a.store.get("flashcards", "a|b"), review(serverState, 4, 2000));
    assert.equal(a.putItems().length, 1);
});

test("rebase replaces memory, cache and the dirty entry even though the early review is newer", async () => {
    const storage = memStorage();
    const get = deferred();
    const a = mk({ storage, fetchFn: async (u, o) => (o && o.method ? res(200, {}) : get.p) });
    const loading = a.store.load();
    a.store.record("flashcards", "a|b", review(initialState(), 4, 9000), { base: initialState(), q: 4 });
    const serverState = st(2.6, 6, 2, DUE, 500);
    get.resolve(res(200, { states: { flashcards: { "a|b": wire(serverState) } } }));
    await loading;
    const want = review(serverState, 4, 9000);
    assert.deepEqual(a.store.get("flashcards", "a|b"), want);
    assert.deepEqual(cacheOf(storage).flashcards["a|b"], want);
    assert.equal(a.putItems()[0].interval_days, want.interval);
    assert.equal(a.putItems()[0].reviewed_at, 9000);
});

test("a hanging GET is aborted after about 10 s, settles, and pushes the dirty keys", async () => {
    let signal = null;
    const a = mk({ fetchFn: (u, o) => (o && o.method ? Promise.resolve(res(200, {})) : (signal = o.signal, new Promise(() => {}))) });
    const loading = a.store.load();
    a.store.record("flashcards", "a|b", review(initialState(), 4, 1000), { base: initialState(), q: 4 });
    await a.s.run(9999);
    assert.equal(a.store.syncPhase, "pending");
    assert.equal(signal.aborted, false);
    await a.s.run(10000);                        // fake timers: the 10 s GET timeout fires
    await loading;
    assert.equal(signal.aborted, true);
    assert.equal(a.store.syncPhase, "settled");
    assert.equal(a.store.loadFailed, true);
    assert.equal(a.puts().length, 1);
});

test("401 on GET: no more cache writes, nothing sent, session continues in memory", async () => {
    const storage = memStorage();
    const a = mk({ storage, fetchFn: async () => res(401, {}) });
    await a.store.load();
    a.store.record("flashcards", "a|b", review(initialState(), 4, 1000), { base: initialState(), q: 4 });
    await a.s.run(1e9);
    assert.equal(a.puts().length, 0);
    assert.equal(storage.m.has(`${USER_KEY_PREFIX}7`), false);
    assert.equal(storage.m.has(GUEST_KEY), false);
    assert.ok(a.store.get("flashcards", "a|b"));
    assert.equal(a.store.canSave, false);
});

test("401 on PUT stops cache writes and further sends", async () => {
    const storage = memStorage();
    const a = mk({ storage, fetchFn: async (u, o) => (o && o.method ? res(401, {}) : res(200, { states: {} })) });
    await a.store.load();
    a.store.record("flashcards", "a|b", review(initialState(), 4, 1000), { base: initialState(), q: 4 });
    await a.s.run(800); await a.store.idle();
    assert.equal(a.puts().length, 1);
    const before = storage.m.get(`${USER_KEY_PREFIX}7`);
    a.store.record("flashcards", "c|d", review(initialState(), 4, 2000), { base: initialState(), q: 4 });
    await a.s.run(800); await a.store.idle(); await a.store.flush();
    assert.equal(a.puts().length, 1);
    assert.equal(storage.m.get(`${USER_KEY_PREFIX}7`), before);
    assert.ok(a.store.get("flashcards", "c|d"));
});

test("guest entries merge into the account on first signed-in load, then the guest key is removed", async () => {
    const guest = { flashcards: { "g|1": st(2.5, 1, 1, DUE, 700), "both|1": st(2.5, 1, 1, DUE, 100) }, writing: {} };
    const storage = memStorage({ [GUEST_KEY]: JSON.stringify(guest) });
    const server = { flashcards: { "both|1": wire(st(2.6, 6, 2, DUE, 400)) } };
    const a = mk({ storage, fetchFn: getServer(server) });
    await a.store.load();
    assert.deepEqual(a.putItems().map(i => i.word_key), ["g|1"]);    // newest wins: guest "both|1" is older than the server's
    assert.equal(a.store.get("flashcards", "both|1").reviewedAt, 400);
    assert.equal(storage.m.has(GUEST_KEY), false);
    assert.ok(cacheOf(storage).flashcards["g|1"]);
});

test("guest key is kept when the push fails, and merged again on the next load", async () => {
    const guest = { flashcards: { "g|1": st(2.5, 1, 1, DUE, 700) } };
    const storage = memStorage({ [GUEST_KEY]: JSON.stringify(guest) });
    const a = mk({ storage, fetchFn: async (u, o) => (o && o.method ? res(500, {}) : res(200, { states: {} })) });
    await a.store.load();
    assert.equal(storage.m.has(GUEST_KEY), true);
    const b = mk({ storage, fetchFn: getServer({}) });
    await b.store.load();
    assert.deepEqual(b.putItems().map(i => i.word_key), ["g|1"]);
    assert.equal(storage.m.has(GUEST_KEY), false);
});

test("guest data is not merged when the GET fails or 401s", async () => {
    const guest = { flashcards: { "g|1": st(2.5, 1, 1, DUE, 700) } };
    const storage = memStorage({ [GUEST_KEY]: JSON.stringify(guest) });
    const a = mk({ storage, fetchFn: async () => res(500, {}) });
    await a.store.load();
    assert.equal(storage.m.has(GUEST_KEY), true);
    assert.equal(a.store.get("flashcards", "g|1"), undefined);
});

test("flush() sends keepalive chunks of at most 100 items and about 60 KB", async () => {
    const a = mk({ fetchFn: getServer({}) });
    await a.store.load();
    for (let i = 0; i < 250; i++) a.store.record("flashcards", `w${i}|x`, st(2.5, 1, 1, DUE, 100 + i), { base: null, q: 4 });
    await a.store.flush();
    const sent = a.puts();
    assert.ok(sent.length >= 3);
    assert.ok(sent.every(c => c.keepalive === true));
    assert.ok(sent.every(c => JSON.parse(c.body).items.length <= 100));
    assert.equal(sent.reduce((n, c) => n + JSON.parse(c.body).items.length, 0), 250);

    const long = "ʻ".repeat(200) + "|" + "ʻ".repeat(190);   // 2 bytes per char: big items force the byte limit
    const b = mk({ fetchFn: getServer({}) });
    await b.store.load();
    for (let i = 0; i < 100; i++) b.store.record("flashcards", `${i}${long}`.slice(0, 400), st(2.5, 1, 1, DUE, 100 + i), { base: null, q: 4 });
    await b.store.flush();
    for (const c of b.puts()) assert.ok(Buffer.byteLength(c.body) <= 60000, `chunk ${Buffer.byteLength(c.body)} bytes`);
    assert.ok(b.puts().length > 1);
});

test("flush() during the pending phase sends nothing; the entries are pushed on the next load", async () => {
    const storage = memStorage();
    const get = deferred();
    const a = mk({ storage, fetchFn: async (u, o) => (o && o.method ? res(200, {}) : get.p) });
    a.store.load();
    a.store.record("flashcards", "a|b", review(initialState(), 4, 1000), { base: initialState(), q: 4 });
    await a.store.flush();
    assert.equal(a.puts().length, 0);
    const b = mk({ storage, fetchFn: getServer({}) });
    await b.store.load();
    assert.deepEqual(b.putItems().map(i => i.word_key), ["a|b"]);
});

test("skipped items are final: a 200 response clears the dirty keys, no retry loop", async () => {
    const a = mk({ fetchFn: async (u, o) => (o && o.method ? res(200, { saved: 0, skipped: 1 }) : res(200, { states: {} })) });
    await a.store.load();
    a.store.record("flashcards", "a|b", st(2.5, 1, 1, DUE, 100), { base: null, q: 4 });
    await a.s.run(800); await a.store.idle();
    await a.store.flush();
    assert.equal(a.puts().length, 1);
});

test("keys over 401 chars are never sent", async () => {
    const warn = console.warn; console.warn = () => {};
    try {
        const a = mk({ fetchFn: getServer({}) });
        await a.store.load();
        a.store.record("flashcards", "k".repeat(402), st(2.5, 1, 1, DUE, 100), { base: null, q: 4 });
        await a.store.flush();
        assert.equal(a.puts().length, 0);
    } finally { console.warn = warn; }
});

test("signed out: ready resolves after load with no network; session grade() recomputes from the pre-session state", async () => {
    const a = mk({ token: null }); await a.store.load(); await a.store.ready;
    const session = createReviewSession(a.store, "flashcards");
    const first = session.grade("a|b", 4, 1000);
    const again = session.grade("a|b", 1, 2000);
    assert.equal(first.step, 0);   // a new word enters learning
    assert.deepEqual(again, review(initialState(), 1, 2000));
    assert.deepEqual(session.before("a|b"), initialState());
    assert.equal(a.calls.length, 0);
});

test("ready resolves from a non-empty cache without waiting for the GET", async () => {
    const storage = memStorage({ [`${USER_KEY_PREFIX}7`]: JSON.stringify({ flashcards: { "a|b": st(2.5, 1, 1, DUE, 100) } }) });
    const get = deferred();
    const a = mk({ storage, fetchFn: async () => get.p });
    a.store.load();
    await a.store.ready;
    assert.equal(a.store.isReady, true);
    assert.equal(a.store.syncPhase, "pending");
});

test("logout clears every per-user review cache key but not the guest key", async () => {
    const store = new Map([
        ["olelo:review-state:v1:u7", "{}"], ["olelo:review-state:v1:u8", "{}"], [GUEST_KEY, "{}"], ["token", "t"], ["haw-unit-progress", "{}"], ["other", "x"]
    ]);
    const fakeLS = new Proxy({}, {
        get: (_, k) => ({ getItem: k2 => (store.has(k2) ? store.get(k2) : null), removeItem: k2 => store.delete(k2), setItem: (k2, v) => store.set(k2, v) })[k],
        ownKeys: () => [...store.keys()],
        getOwnPropertyDescriptor: (_, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined)
    });
    globalThis.localStorage = fakeLS;
    try {
        const { logout } = await import("../auth.js");
        logout();
        assert.deepEqual([...store.keys()].sort(), [GUEST_KEY, "other"].sort());
    } finally { delete globalThis.localStorage; }
});
