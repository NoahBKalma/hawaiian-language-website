// Run: node --test "scripts/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { createUnitStore, STORAGE_KEY } from "../unit-progress-core.js";
import { MAX_UNITS } from "../unit-data.js";

function sched() {
    const q = []; let id = 0;
    return { setTimeoutFn: (fn, ms) => { q.push({ id: ++id, fn, ms }); return id; }, clearTimeoutFn: i => { const k = q.findIndex(t => t.id === i); if (k >= 0) q.splice(k, 1); },
             run: async ms => { for (const t of q.filter(t => t.ms <= ms)) { q.splice(q.indexOf(t), 1); await t.fn(); } }, pending: () => q.length };
}
const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const memStore = init => { const m = new Map(init ? [[STORAGE_KEY, init]] : []); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), m }; };
function mk({ token = "tok", fetchFn, storage = memStore(), ...o } = {}) {
    const calls = []; const s = sched();
    const f = fetchFn || (async () => res(200, { level: 1, targets: {} }));
    const wrapped = async (url, opt = {}) => { calls.push({ url, ...opt }); return f(url, opt); };
    const store = createUnitStore({ fetchFn: wrapped, token: () => token, baseUrl: "http://api", storage, ...s, ...o });
    return { store, calls, s, storage, puts: () => calls.filter(c => c.method === "PUT") };
}
const okFetch = targets => async (u, o) => o.method ? res(200, {}) : res(200, { level: 1, targets });

test("signed out: local persistence, zero network, survives a new store", async () => {
    const a = mk({ token: null }); await a.store.load(); await a.store.ready;
    a.store.set(4, 3); a.store.set("2", 1);
    assert.equal(a.calls.length, 0);
    assert.deepEqual(JSON.parse(a.storage.m.get(STORAGE_KEY)), { 1: 0, 2: 1, 3: 0, 4: 3, 5: 0 });
    const b = mk({ token: null, storage: a.storage });
    assert.equal(b.store.get(4), 3); assert.equal(b.store.get(2), 1); assert.equal(b.store.get(1), 0);
});
test("clamps to 0..MAX_UNITS and ignores bad targets", () => {
    const { store } = mk({ token: null });
    store.set(1, -5); assert.equal(store.get(1), 0);
    store.set(1, 99); assert.equal(store.get(1), MAX_UNITS);
    store.set(1, "abc"); assert.equal(store.get(1), 0);
    store.set(9, 3); store.set(0, 3); store.set("x", 3);
    assert.equal(store.get(9), 0); assert.equal(store.get("x"), 0);
});
test("reset zeroes and notifies even at 0", () => {
    const { store } = mk({ token: null }); store.set(3, 4);
    const seen = []; store.subscribe(e => seen.push(e));
    store.reset(3); store.reset(3);
    assert.deepEqual(seen, [{ target: 3, done: 0, origin: "local" }, { target: 3, done: 0, origin: "local" }]);
});
test("subscribe / unsubscribe; same value does not notify", () => {
    const { store } = mk({ token: null }); const seen = [];
    const off = store.subscribe(e => seen.push(e));
    store.set(2, 2); store.set(2, 2); assert.deepEqual(seen, [{ target: 2, done: 2, origin: "local" }]);
    off(); store.set(2, 3); assert.equal(seen.length, 1);
});
test("signed in: load keeps the higher of cache/server per target and pushes the cache up in order", async () => {
    const storage = memStore(JSON.stringify({ 1: 4, 2: 3, 3: 0 }));
    const { store, puts } = mk({ storage, fetchFn: okFetch({ 1: 2, 3: 1, 4: 3 }) });
    assert.equal(store.get(1), 4);
    await store.load();
    assert.deepEqual([1, 2, 3, 4].map(c => store.get(c)), [4, 3, 1, 3]);
    assert.deepEqual(puts().map(p => JSON.parse(p.body)), [{ level: 1, target: 1, done_count: 4 }, { level: 1, target: 2, done_count: 3 }]);
    assert.equal(JSON.parse(storage.m.get(STORAGE_KEY))["3"], 1);
    assert.equal(store.isReady, true);
});
test("signed in: server ahead of cache replaces it without a PUT", async () => {
    const { store, puts } = mk({ storage: memStore(JSON.stringify({ 1: 1 })), fetchFn: okFetch({ 1: 3 }) });
    await store.load();
    assert.equal(store.get(1), 3); assert.equal(puts().length, 0);
});
test("now:true saves use keepalive so the PUT survives navigation", async () => {
    const { store, puts } = mk({ fetchFn: okFetch({}) }); await store.load();
    store.set(1, 4, { now: true }); await Promise.resolve();
    assert.equal(puts().length, 1); assert.equal(puts()[0].keepalive, true);
});
test("a late server answer never overwrites a local write (per target)", async () => {
    let release; const gate = new Promise(r => { release = r; });
    const { store, s, puts } = mk({ fetchFn: async (u, o) => { if (!o.method) { await gate; return res(200, { targets: { 4: 9, 5: 2 } }); } return res(200, {}); } });
    const loading = store.load();
    store.set(4, 1);
    release(); await loading;
    assert.equal(store.get(4), 1); assert.equal(store.get(5), 2);
    await s.run(300); assert.equal(puts().length, 1);
});
test("debounce per target, now saves immediately, body shape and auth", async () => {
    const { store, s, puts } = mk({ fetchFn: okFetch({}) }); await store.load();
    store.set(4, 1); store.set(4, 2); store.set(3, 1);
    assert.equal(puts().length, 0);
    await s.run(300); assert.equal(puts().length, 2);
    const p4 = puts().find(p => JSON.parse(p.body).target === 4);
    assert.deepEqual(JSON.parse(p4.body), { level: 1, target: 4, done_count: 2 });
    assert.equal(p4.url, "http://api/unit-progress"); assert.equal(p4.headers.Authorization, "Bearer tok");
    store.set(4, 3, { now: true }); await Promise.resolve();
    assert.equal(puts().length, 3); assert.equal(JSON.parse(puts()[2].body).done_count, 3);
    assert.equal(s.pending(), 0);
});
test("401 stops saving but keeps working; network errors never throw", async () => {
    const a = mk({ fetchFn: async (u, o) => o.method ? res(401, {}) : res(200, { targets: {} }) });
    await a.store.load(); a.store.set(1, 1, { now: true }); await new Promise(r => setTimeout(r, 0));
    a.store.set(1, 2, { now: true }); await Promise.resolve();
    assert.equal(a.store.get(1), 2); assert.equal(a.puts().length, 1);
    const b = mk({ fetchFn: async () => { throw new Error("offline"); } });
    await b.store.load(); b.store.set(1, 1, { now: true }); assert.equal(b.store.get(1), 1); assert.equal(b.store.isReady, true);
    const c = mk({ fetchFn: async () => res(401, {}) }); await c.store.load(); assert.equal(c.store.isReady, true);
});
test("ready timeout: stuck GET does not block forever", async () => {
    const { store, s } = mk({ fetchFn: () => new Promise(() => {}) });
    store.load(); assert.equal(store.isReady, false);
    await s.run(2000); assert.equal(store.isReady, true);
});
test("flush sends keepalive PUTs for pending debounced writes", async () => {
    const { store, puts, s } = mk({ fetchFn: okFetch({}) }); await store.load();
    store.set(1, 2); store.set(2, 1); store.flush(); await Promise.resolve();
    assert.equal(puts().length, 2); assert.ok(puts().every(p => p.keepalive === true)); assert.equal(s.pending(), 0);
});
test("storage that throws or is null falls back to memory", () => {
    const bad = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } };
    for (const storage of [bad, null]) {
        const { store } = mk({ token: null, storage }); store.set(2, 3); assert.equal(store.get(2), 3);
    }
});
test("corrupt cache is ignored", () => {
    assert.equal(mk({ storage: memStore("{not json") }).store.get(1), 0);
});
