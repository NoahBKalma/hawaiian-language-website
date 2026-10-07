import test from "node:test";
import assert from "node:assert/strict";
import { completedCountOf, isUnlockedAt, journeyOf, createGate } from "../unit-gate-core.js";

const targets = [4, 4, 4, 4, 4].map(n => ({ units: Array.from({ length: n }) }));
const getter = o => k => o[k] || 0;

test("completedCount counts consecutive complete targets from 1", () => {
    assert.equal(completedCountOf(getter({}), targets), 0);
    assert.equal(completedCountOf(getter({ 1: 3 }), targets), 0);
    assert.equal(completedCountOf(getter({ 1: 4 }), targets), 1);
    assert.equal(completedCountOf(getter({ 1: 4, 2: 4, 3: 2 }), targets), 2);
    assert.equal(completedCountOf(getter({ 2: 4, 3: 4 }), targets), 0);          // gap at 1: nothing counts
    assert.equal(completedCountOf(getter({ 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 }), targets), 5);
    assert.equal(completedCountOf(getter({ 1: 12, 2: 4 }), targets), 2);         // over-count still just complete
});

test("isUnlocked: k <= completed + 1", () => {
    assert.equal(isUnlockedAt(1, 0), true);
    assert.equal(isUnlockedAt(2, 0), false);
    assert.equal(isUnlockedAt(2, 1), true);
    assert.equal(isUnlockedAt(3, 1), false);
    assert.equal(isUnlockedAt(5, 4), true);
    assert.equal(isUnlockedAt(6, 5), false);
    assert.equal(isUnlockedAt(0, 0), false);
    assert.equal(isUnlockedAt("x", 0), false);
});

test("journeyOf: next / enter / end and labels", () => {
    assert.deepEqual(journeyOf(0, null), { done: 0, mode: "next", hopped: false, label: "Begin learning" });
    assert.equal(journeyOf(0, "0").mode, "enter");
    assert.equal(journeyOf(0, "0").label, "Open target");
    assert.equal(journeyOf(1, "0").mode, "next");                              // finished the hopped target: stale key
    assert.equal(journeyOf(1, "0").label, "Next target");
    assert.equal(journeyOf(2, "2").mode, "enter");
    assert.equal(journeyOf(5, "5").mode, "end");
    assert.equal(journeyOf(5, null).label, "All targets complete");
    // next target already has units done: enter + "Continue" without any hop key
    assert.deepEqual(journeyOf(0, null, 5, true), { done: 0, mode: "enter", hopped: true, label: "Continue" });
    assert.equal(journeyOf(2, "1", 5, true).label, "Continue");
    assert.equal(journeyOf(2, null, 5, false).label, "Next target");
    assert.equal(journeyOf(3, undefined).hopped, false);
});

function fakeStores(units, learningDone = 0, ready = true) {
    const subs = new Set();
    const unitStore = { isReady: ready, ready: Promise.resolve(), get: getter(units), subscribe: fn => { subs.add(fn); return () => subs.delete(fn); } };
    const sets = [];
    const store = { isReady: ready, ready: Promise.resolve(), done: learningDone, set(n, o) { this.done = n; sets.push([n, o]); } };
    return { unitStore, store, sets, fire: () => subs.forEach(f => f()) };
}

test("syncLearningStore makes store.done equal completedCount and follows later changes", async () => {
    const units = { 1: 4, 2: 1 };
    const f = fakeStores(units, 3);
    const gate = createGate({ unitStore: f.unitStore, store: f.store, targets: targets });
    assert.equal(await gate.syncLearningStore(), 1);
    assert.equal(f.store.done, 1);
    assert.equal(f.sets[0][1].now, true);
    units[2] = 4; f.fire();
    assert.equal(f.store.done, 2);
    await gate.syncLearningStore();                                            // idempotent: no duplicate subscription / set
    assert.equal(f.sets.length, 2);
    assert.equal(gate.isUnlocked(3), true);
    assert.equal(gate.isUnlocked(4), false);
});

test("sync leaves the store alone when already equal and when stores are not ready", async () => {
    const f = fakeStores({ 1: 4 }, 1);
    const gate = createGate({ unitStore: f.unitStore, store: f.store, targets: targets });
    await gate.syncLearningStore();
    assert.equal(f.sets.length, 0);
    const g = fakeStores({ 1: 4 }, 0, false);
    createGate({ unitStore: g.unitStore, store: g.store, targets: targets }).syncLearningStore();
    g.fire();
    assert.equal(g.sets.length, 0);
});
