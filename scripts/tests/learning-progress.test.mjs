// Run: node --test "scripts/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { createStore, TOTAL } from "../learning-progress-core.js";

// manual scheduler so debounce/ready-timeout are deterministic
function sched() {
    const q = []; let id = 0;
    return { setTimeoutFn: (fn, ms) => { q.push({ id: ++id, fn, ms }); return id; }, clearTimeoutFn: i => { const k = q.findIndex(t => t.id === i); if (k >= 0) q.splice(k, 1); },
             run: async ms => { for (const t of q.filter(t => t.ms <= ms)) { q.splice(q.indexOf(t), 1); await t.fn(); } }, pending: () => q.length };
}
const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function mk({ token = "tok", fetchFn, ...o } = {}) {
    const calls = []; const s = sched();
    const f = fetchFn || (async (url, opt) => { calls.push({ url, ...opt }); return res(200, { done_count: 0 }); });
    const wrapped = async (url, opt = {}) => { calls.push({ url, ...opt }); return f(url, opt); };
    const store = createStore({ fetchFn: wrapped, token: () => token, baseUrl: "http://api", ...s, ...o });
    return { store, calls, s };
}

test("signed out: shared in memory, zero network", async () => {
    const { store, calls } = mk({ token: null });
    await store.load(); await store.ready;
    const seen = []; store.subscribe(e => seen.push(e));
    store.advance("map"); store.advance("list");
    assert.equal(store.done, 2); assert.deepEqual(seen.map(e => e.origin), ["map", "list"]);
    assert.equal(calls.length, 0);
});

test("clamps to 0..5 and stops advancing at the end", async () => {
    const { store } = mk({ token: null }); await store.load();
    for (let i = 0; i < 9; i++) store.advance();
    assert.equal(store.done, TOTAL); assert.equal(store.canAdvance(), false);
    store.set(-4); assert.equal(store.done, 0); store.set(99); assert.equal(store.done, TOTAL);
});

test("reset returns to 0 and notifies", async () => {
    const { store } = mk({ token: null }); await store.load();
    store.set(3); const seen = []; store.subscribe(e => seen.push(e)); store.reset("hero");
    assert.equal(store.done, 0); assert.deepEqual(seen, [{ done: 0, origin: "hero" }]);
});

test("advance is blocked until ready (signed in) and a late GET never overwrites a local advance", async () => {
    let release; const gate = new Promise(r => { release = r; });
    const { store, calls, s } = mk({ fetchFn: async (u, o) => { if (!o.method) { await gate; return res(200, { done_count: 4 }); } return res(200, {}); } });
    const loading = store.load();
    assert.equal(store.canAdvance(), false); store.advance(); assert.equal(store.done, 0);
    store.set(1);                                   // local write while the GET is pending
    release(); await loading;
    assert.equal(store.done, 1);                    // server's 4 discarded
    await s.run(300);
    assert.equal(calls.filter(c => c.method === "PUT").length, 1);
});

test("signed in: GET restores, saves immediately on advance, debounces plain set", async () => {
    const { store, calls, s } = mk({ fetchFn: async (u, o) => o.method ? res(200, {}) : res(200, { done_count: 2 }) });
    const seen = []; store.subscribe(e => seen.push(e.origin));
    await store.load(); assert.equal(store.done, 2); assert.ok(seen.includes("server") && seen.includes("ready"));
    store.advance();
    await Promise.resolve();
    const puts = () => calls.filter(c => c.method === "PUT");
    assert.equal(puts().length, 1); assert.equal(JSON.parse(puts()[0].body).done_count, 3);
    assert.equal(puts()[0].headers.Authorization, "Bearer tok");
    store.set(4); assert.equal(puts().length, 1);   // debounced
    await s.run(300); assert.equal(puts().length, 2); assert.equal(JSON.parse(puts()[1].body).done_count, 4);
});

test("reset saves 0 to the account", async () => {
    const { store, calls } = mk({ fetchFn: async (u, o) => o.method ? res(200, {}) : res(200, { done_count: 3 }) });
    await store.load(); store.reset(); await Promise.resolve();
    assert.equal(JSON.parse(calls.filter(c => c.method === "PUT").at(-1).body).done_count, 0);
});

test("401 / network errors never throw or redirect: stays in memory", async () => {
    const a = mk({ fetchFn: async (u, o) => o.method ? res(401, {}) : res(200, { done_count: 0 }) });
    await a.store.load(); a.store.advance(); await new Promise(r => setTimeout(r, 0)); a.store.advance(); await Promise.resolve();
    assert.equal(a.store.done, 2); assert.equal(a.calls.filter(c => c.method === "PUT").length, 1);   // first PUT got 401, then saving stops
    a.store.advance(); await Promise.resolve(); assert.equal(a.calls.filter(c => c.method === "PUT").length, 1);
    const b = mk({ fetchFn: async () => { throw new Error("offline"); } });
    await b.store.load(); b.store.advance(); assert.equal(b.store.done, 1); assert.equal(b.store.isReady, true);
});

test("ready timeout: stuck GET does not block the page forever", async () => {
    const { store, s } = mk({ fetchFn: () => new Promise(() => {}) });
    store.load(); assert.equal(store.isReady, false);
    await s.run(2000); assert.equal(store.isReady, true);
});

test("flush sends a keepalive PUT for a pending debounced write", async () => {
    const { store, calls } = mk({ fetchFn: async (u, o) => o.method ? res(200, {}) : res(200, { done_count: 0 }) });
    await store.load(); store.set(2); store.flush(); await Promise.resolve();
    const last = calls.filter(c => c.method === "PUT").at(-1); assert.equal(last.keepalive, true);
});

test("reset notifies even when already at 0 (a view may be mid-flight)", async () => {
    const { store } = mk({ token: null }); await store.load();
    const seen = []; store.subscribe(e => seen.push(e)); store.reset("hero");
    assert.deepEqual(seen, [{ done: 0, origin: "hero" }]);
});
