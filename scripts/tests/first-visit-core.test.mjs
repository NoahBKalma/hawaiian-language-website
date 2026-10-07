import test from "node:test";
import assert from "node:assert/strict";
import { decide, createTutorialFlags, guestKey, cacheKey, pendingKey } from "../first-visit-core.js";

const jwt = id => `h.${Buffer.from(JSON.stringify({ user_id: id })).toString("base64url")}.s`;
const TOKEN = jwt(7);

function memStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}
const throwingStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
const resp = status => async () => ({ ok: status >= 200 && status < 300, status });

test("decide: guest opens when the local flag is missing, not when set", () => {
    assert.equal(decide({ page: "flashcards" }).open, true);
    assert.equal(decide({ page: "flashcards", local: true }).open, false);
});

test("decide: signed in, account list wins over the guest flag", () => {
    assert.equal(decide({ page: "writing", signedIn: true, accountPages: [], local: true }).open, true);
    assert.equal(decide({ page: "writing", signedIn: true, accountPages: ["writing"] }).open, false);
    assert.equal(decide({ page: "writing", signedIn: true, accountPages: ["flashcards"] }).open, true);
});

test("decide: confirmed cache and pending PUT both mean seen", () => {
    assert.equal(decide({ page: "writing", signedIn: true, accountPages: [], cacheSeen: true }).open, false);
    assert.equal(decide({ page: "writing", signedIn: true, accountPages: [], pending: true }).open, false);
});

test("decide: unknown account list (401, timeout, failure) falls back to the local flag", () => {
    assert.equal(decide({ page: "writing", signedIn: true, accountPages: null }).open, true);
    assert.equal(decide({ page: "writing", signedIn: true, accountPages: null, local: true }).open, false);
});

test("decide: a tutorial already open is never stacked and counts as seen", () => {
    assert.deepEqual(decide({ page: "writing", tutorialOpen: true }), { open: false, markSeen: true, reason: "tutorial-open" });
});

test("decide: interaction before the decision skips without marking seen", () => {
    const v = decide({ page: "writing", interacted: true });
    assert.equal(v.open, false);
    assert.equal(v.markSeen, false);
});

test("flags: guest markSeen sets the local flag and never calls fetch", async () => {
    let calls = 0;
    const storage = memStorage();
    const flags = createTutorialFlags({ storage, fetchFn: async () => { calls++; return { ok: true, status: 200 }; } });
    assert.equal(flags.signedIn, false);
    assert.equal(flags.localSeen("flashcards"), false);
    assert.equal(await flags.markSeen("flashcards"), "skipped");
    assert.equal(flags.localSeen("flashcards"), true);
    assert.equal(storage.data[guestKey("flashcards")], "1");
    assert.equal(calls, 0);
});

test("flags: signed-in markSeen PUTs with Bearer + keepalive, writes pending first, then the cache", async () => {
    const storage = memStorage();
    let pendingDuringPut = null, seen;
    const flags = createTutorialFlags({
        storage, token: TOKEN, baseUrl: "http://api",
        fetchFn: async (url, opts) => { pendingDuringPut = storage.data[pendingKey("7", "writing")]; seen = { url, opts }; return { ok: true, status: 200 }; }
    });
    assert.equal(flags.uid, "7");
    assert.equal(await flags.markSeen("writing"), "saved");
    assert.equal(pendingDuringPut, "1");
    assert.equal(seen.url, "http://api/tutorial-seen");
    assert.equal(seen.opts.method, "PUT");
    assert.equal(seen.opts.keepalive, true);
    assert.equal(seen.opts.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(seen.opts.body, JSON.stringify({ page: "writing" }));
    assert.equal(pendingKey("7", "writing") in storage.data, false);
    assert.equal(storage.data[cacheKey("7", "writing")], "1");
    assert.equal(flags.cacheSeen("writing"), true);
});

test("flags: network error and 5xx keep pending (treated as seen, retried next load)", async () => {
    for (const fetchFn of [async () => { throw new Error("offline"); }, resp(503)]) {
        const storage = memStorage();
        const flags = createTutorialFlags({ storage, token: TOKEN, fetchFn });
        assert.equal(await flags.markSeen("writing"), "retry");
        assert.equal(flags.pending("writing"), true);
        const next = createTutorialFlags({ storage, token: TOKEN, fetchFn: resp(200) });
        assert.equal(next.pending("writing"), true);
        assert.equal(await next.retryPending("writing"), "saved");
        assert.equal(next.pending("writing"), false);
        assert.equal(next.cacheSeen("writing"), true);
    }
});

test("flags: 401 and other 4xx drop the pending key (no endless retry)", async () => {
    for (const status of [401, 422]) {
        const storage = memStorage();
        const flags = createTutorialFlags({ storage, token: TOKEN, fetchFn: resp(status) });
        assert.equal(await flags.markSeen("writing"), "dropped");
        assert.equal(flags.pending("writing"), false);
        assert.equal(flags.cacheSeen("writing"), false);
        assert.equal(flags.localSeen("writing"), true);   // the 401-as-guest fallback still remembers it locally
    }
});

test("flags: cache and pending are per user", async () => {
    const storage = memStorage();
    await createTutorialFlags({ storage, token: TOKEN, fetchFn: resp(200) }).markSeen("writing");
    const other = createTutorialFlags({ storage, token: jwt(8), fetchFn: resp(200) });
    assert.equal(other.cacheSeen("writing"), false);
});

test("flags: signed in with an unreadable id keeps no per-user keys", async () => {
    const storage = memStorage();
    const flags = createTutorialFlags({ storage, token: "not-a-jwt", fetchFn: resp(200) });
    assert.equal(flags.uid, null);
    assert.equal(await flags.markSeen("writing"), "saved");
    assert.deepEqual(Object.keys(storage.data), [guestKey("writing")]);
    assert.equal(flags.cacheSeen("writing"), false);
});

test("flags: throwing storage never throws and falls back to memory", async () => {
    const guest = createTutorialFlags({ storage: throwingStorage });
    assert.equal(guest.localSeen("flashcards"), false);
    await guest.markSeen("flashcards");
    assert.equal(guest.localSeen("flashcards"), true);

    const user = createTutorialFlags({ storage: throwingStorage, token: TOKEN, fetchFn: resp(200) });
    assert.equal(await user.markSeen("writing"), "saved");
    assert.equal(user.cacheSeen("writing"), true);
    user.rememberAccountSeen("flashcards");
    assert.equal(user.cacheSeen("flashcards"), true);
});

test("flags: rememberAccountSeen writes the confirmed cache", () => {
    const storage = memStorage();
    createTutorialFlags({ storage, token: TOKEN }).rememberAccountSeen("flashcards");
    assert.equal(storage.data[cacheKey("7", "flashcards")], "1");
});
