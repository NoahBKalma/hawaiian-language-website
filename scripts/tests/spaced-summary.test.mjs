import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState, stateMapFromWire, summarizeStates, prepareSets, buildSetRows, modeBadgeState } from "../spaced-summary.js";
import { normKey } from "../sm2.js";

const NOW = 1_000_000_000_000;
const MIN = 60000, DAY = 86400000;
const w = (hawaiian, english) => ({ hawaiian, english });

test("normalizeState accepts wire and client shapes, rejects junk", () => {
    assert.deepEqual(normalizeState({ due_at: 5, learning_step: 1 }), { due: 5, step: 1 });
    assert.deepEqual(normalizeState({ due: 5, step: null }), { due: 5, step: null });
    assert.deepEqual(normalizeState({ due_at: 5, learning_step: null }), { due: 5, step: null });
    assert.equal(normalizeState(null), null);
    assert.equal(normalizeState({ due_at: "x" }), null);
    assert.equal(normalizeState({}), null);
});

test("stateMapFromWire reads one mode and skips bad entries", () => {
    const body = { states: { flashcards: { "a|b": { due_at: 1, learning_step: 0 }, bad: {} }, writing: { "c|d": { due_at: 2, learning_step: null } } } };
    assert.equal(stateMapFromWire(body, "flashcards").size, 1);
    assert.equal(stateMapFromWire(body, "writing").get("c|d").step, null);
    assert.equal(stateMapFromWire(body, "nope").size, 0);
    assert.equal(stateMapFromWire(null, "writing").size, 0);
});

test("summarizeStates classifies due, learning, graduated and next review", () => {
    const map = new Map([
        ["a", { due: NOW - MIN, step: 0 }],          // learning and due
        ["b", { due: NOW + 10 * MIN, step: 1 }],     // learning, later
        ["c", { due: NOW - DAY, step: null }],       // graduated and due
        ["d", { due: NOW + 3 * DAY, step: null }]    // graduated, later
    ]);
    assert.deepEqual(summarizeStates(map, NOW), { due: 2, learning: 2, graduated: 2, total: 4, nextDue: NOW + 10 * MIN });
    assert.deepEqual(summarizeStates(new Map(), NOW), { due: 0, learning: 0, graduated: 0, total: 0, nextDue: null });
    assert.equal(summarizeStates(new Map([["x", { due: NOW, step: null }]]), NOW).due, 1);   // due exactly now counts
});

test("buildSetRows counts per set, dedupes words, NFC keys, skips untouched sets", () => {
    const sets = prepareSets([
        { id: "A", nameHaw: "Alana", nameEng: "A set", words: [w("a", "1"), w("b", "2"), w("b", "2"), w("c", "3")] },
        { id: "B", nameHaw: "Bala", nameEng: "B set", words: [w("d", "4"), w("ē", "5")] },
        { id: "C", nameHaw: "Cala", nameEng: "C set", words: [w("z", "9")] }
    ]);
    const map = new Map([
        [normKey(w("a", "1")), { due: NOW - 1, step: 0 }],
        [normKey(w("b", "2")), { due: NOW + 2 * DAY, step: null }],
        [normKey(w("d", "4")), { due: NOW + MIN, step: 0 }],
        ["ē|5".normalize("NFC"), { due: NOW - 5, step: null }]
    ]);
    const rows = buildSetRows(sets, map, NOW);
    assert.deepEqual(rows.map(r => r.id), ["B", "A"]);   // equal due counts: B's next review is sooner
    const a = rows.find(r => r.id === "A"), b = rows.find(r => r.id === "B");
    assert.equal(rows.length, 2);
    assert.deepEqual([a.total, a.started, a.due, a.newLeft, a.learned, a.learning], [3, 2, 1, 1, 1, 1]);
    assert.equal(a.nextDue, NOW + 2 * DAY);
    assert.deepEqual([b.total, b.started, b.due, b.newLeft, b.learned], [2, 2, 1, 0, 1]);
});

test("buildSetRows sorts most due first, then soonest next review, then name", () => {
    const sets = prepareSets([
        { id: "x1", nameHaw: "Zed", words: [w("1", "a")] },
        { id: "x2", nameHaw: "Abe", words: [w("2", "a")] },
        { id: "x3", nameHaw: "Mid", words: [w("3", "a"), w("4", "a")] },
        { id: "x4", nameHaw: "Soon", words: [w("5", "a")] }
    ]);
    const map = new Map([
        [normKey(w("1", "a")), { due: NOW + DAY, step: null }],
        [normKey(w("2", "a")), { due: NOW + DAY, step: null }],
        [normKey(w("3", "a")), { due: NOW - 1, step: 0 }],
        [normKey(w("4", "a")), { due: NOW - 1, step: 0 }],
        [normKey(w("5", "a")), { due: NOW + MIN, step: 0 }]
    ]);
    assert.deepEqual(buildSetRows(sets, map, NOW).map(r => r.id), ["x3", "x4", "x2", "x1"]);
});

test("modeBadgeState covers every situation", () => {
    assert.equal(modeBadgeState({ spacedOn: false, practice: true }).visible, false);
    assert.equal(modeBadgeState().visible, false);
    const main = modeBadgeState({ spacedOn: true });
    assert.deepEqual([main.visible, main.key, main.counts, main.label], [true, "counts", true, "Spaced review · counts"]);
    const prac = modeBadgeState({ spacedOn: true, practice: true });
    assert.deepEqual([prac.key, prac.counts, prac.label], ["practice", false, "Practice · doesn't count"]);
    assert.match(prac.announce, /does not count/);
    assert.equal(modeBadgeState({ spacedOn: true, practice: true, loading: true }).key, "practice");
    for (const extra of [{ loading: true }, { caughtUp: true }]) {
        const n = modeBadgeState({ spacedOn: true, ...extra });
        assert.deepEqual([n.key, n.counts, n.announce], ["neutral", null, ""]);
    }
});
