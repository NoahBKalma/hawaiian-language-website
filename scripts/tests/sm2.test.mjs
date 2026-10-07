// Run: node --test "scripts/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    initialState, review, flashcardGrade, writingGrade, newCap, isDue, isLearning, spacedFullSet, buildDeck, normKey, EF_MIN,
    describeNextDue, LEARNING_STEPS_MIN, MINUTE_MS, DAY_MS
} from "../sm2.js";

const T = "2026-10-07";
const NOW = new Date(2026, 9, 7, 12, 0, 0).getTime();   // local noon
const MIN = MINUTE_MS;
const at = (state, q, now) => review(state, q, now);
// a graduated word: reviewed three times after its learning steps
const graduate = (now = NOW) => {
    let s = review(initialState(), 4, now);
    for (let i = 0; i < LEARNING_STEPS_MIN.length; i++) s = review(s, 4, s.due);
    return s;
};

test("a new word enters learning at step 0, due in 10 minutes, whatever the grade", () => {
    for (const q of [1, 3, 5]) {
        const s = review(initialState(), q, NOW);
        assert.equal(s.step, 0); assert.equal(s.due, NOW + 10 * MIN); assert.equal(s.interval, 0);
        assert.equal(s.ef, 2.5); assert.equal(s.reviewedAt, NOW);
        assert.equal(isLearning(s), true);
    }
});

test("passing learning steps goes 10 min, 60 min, then graduates to 1 day with repetitions 1 and EF unchanged", () => {
    const a = review(initialState(), 4, NOW);
    const b = review(a, 4, a.due);
    assert.deepEqual([b.step, b.due - a.due], [1, 60 * MIN]);
    const c = review(b, 5, b.due);
    assert.equal(c.step, null); assert.equal(c.interval, 1); assert.equal(c.repetitions, 1);
    assert.equal(c.due, b.due + DAY_MS); assert.equal(c.ef, 2.5);
    assert.equal(isLearning(c), false);
});

test("a miss in learning resets to step 0 and leaves EF alone", () => {
    const a = review(initialState(), 4, NOW), b = review(a, 4, a.due);
    const f = review(b, 1, b.due);
    assert.equal(f.step, 0); assert.equal(f.due, b.due + 10 * MIN); assert.equal(f.ef, 2.5);
});

test("graduated passes give intervals 6 then round(6 * EF), with the EF from before each review", () => {
    const g = graduate();
    const a = review(g, 4, g.due), b = review(a, 4, a.due);
    assert.deepEqual([a.interval, b.interval], [6, Math.round(6 * a.ef)]);
    assert.deepEqual([g.repetitions, a.repetitions, b.repetitions], [1, 2, 3]);
    assert.equal(a.due, g.due + 6 * DAY_MS);
    const c = review(graduate(), 5, NOW + 5 * DAY_MS);   // ef 2.6 after one q=5
    assert.equal(review(c, 5, c.due).interval, Math.round(6 * c.ef));
});

test("a miss on a graduated word re-enters learning with the classic EF drop", () => {
    const g = graduate();
    const f = review(g, 1, g.due);
    assert.equal(f.step, 0); assert.equal(f.repetitions, 0); assert.equal(f.interval, 0);
    assert.equal(f.due, g.due + 10 * MIN); assert.equal(f.ef, 1.96);
    assert.equal(review(g, 2, g.due).ef, 2.18);   // 2.5 - 0.32
});

test("repeated graduated misses stop at the EF floor", () => {
    let s = graduate();
    for (let i = 0; i < 8; i++) { s = review(s, 1, s.due); s = { ...s, step: null, repetitions: 1, interval: 1 }; }
    assert.equal(s.ef, EF_MIN);
});

test("EF delta on graduated reviews matches the formula for q=3, 4, 5", () => {
    const g = graduate();
    const ef = q => review(g, q, g.due).ef;
    assert.equal(ef(3), 2.36); assert.equal(ef(4), 2.5); assert.equal(ef(5), 2.6);
});

test("EF never drops below 1.3 and the input state is not modified", () => {
    const s = { ef: 1.31, interval: 6, repetitions: 2, due: NOW, reviewedAt: 5, step: null };
    const copy = { ...s };
    assert.equal(review(s, 3, NOW).ef, EF_MIN);
    assert.deepEqual(s, copy);
});


test("grade maps", () => {
    assert.equal(flashcardGrade("correct"), 4);
    assert.equal(flashcardGrade("incorrect"), 1);
    assert.equal(writingGrade({}), 5);
    assert.equal(writingGrade({ wrongGuess: true }), 4);
    assert.equal(writingGrade({ usedHint: true }), 3);
    assert.equal(writingGrade({ gaveUp: true }), 1);
    assert.equal(writingGrade({ usedHint: true, wrongGuess: true }), 3);
    assert.equal(writingGrade({ gaveUp: true, usedHint: true, wrongGuess: true }), 1);
});

test("newCap and isDue", () => {
    assert.equal(newCap(1), 5); assert.equal(newCap(19), 5); assert.equal(newCap(20), 10); assert.equal(newCap(300), 10);
    assert.equal(isDue(undefined, NOW), false);
    assert.equal(isDue({ due: NOW }, NOW), true);
    assert.equal(isDue({ due: NOW + 1 }, NOW), false);
});

test("spacedFullSet", () => {
    const setKeys = ["a|1", "b|2", "c|3"];
    assert.equal(spacedFullSet({ deckKeys: ["c|3", "a|1", "b|2"], setKeys, minFrequency: 1, helped: false }), true);
    assert.equal(spacedFullSet({ deckKeys: ["a|1", "b|2"], setKeys, minFrequency: 1, helped: false }), false);
    assert.equal(spacedFullSet({ deckKeys: setKeys, setKeys, minFrequency: 2, helped: false }), false);
    assert.equal(spacedFullSet({ deckKeys: setKeys, setKeys, minFrequency: 1, helped: true }), false);
    assert.equal(spacedFullSet({ deckKeys: [], setKeys: [], minFrequency: 1, helped: false }), false);
});

test("buildDeck: dedupes, NFC-normalizes, orders due most overdue first, caps new words", () => {
    const w = (h, e) => ({ hawaiian: h, english: e });
    const words = [w("a", "1"), w("b", "2"), w("a", "1"), w("c", "3"), w("d", "4"), w("e", "5"), w("f", "6"), w("g", "7"), w("h", "8")];
    const D = n => NOW + n * DAY_MS;
    const states = {
        [normKey(w("b", "2"))]: { due: D(-2) },
        [normKey(w("c", "3"))]: { due: D(-6) },
        [normKey(w("d", "4"))]: { due: D(13) },
        [normKey(w("e", "5"))]: { due: D(2) }
    };
    const r = buildDeck(words, k => states[k], NOW);
    assert.deepEqual(r.deck.map(x => x.hawaiian), ["c", "b", "a", "f", "g", "h"]);   // c, b due; 8 unique -> cap 5; new a, f, g, h = 4
    assert.equal(r.dueCount, 2); assert.equal(r.newCount, 4);
    assert.equal(r.nextDue, D(2));
    const many = Array.from({ length: 30 }, (_, i) => w(`w${i}`, `${i}`));
    assert.equal(buildDeck(many, () => null, NOW).newCount, 10);
    assert.equal(buildDeck(many.slice(0, 12), () => null, NOW).newCount, 5);
    assert.equal(buildDeck([w("ē", "x"), w("ē", "x")], () => null, NOW).deck.length, 1);
});

test("buildDeck: a learning word is due only after its step time and is ordered by how overdue it is", () => {
    const w = (h, e) => ({ hawaiian: h, english: e });
    const words = [w("a", "1"), w("b", "2")];
    const st = { [normKey(words[0])]: { due: NOW - 5 * MIN, step: 0 }, [normKey(words[1])]: { due: NOW + 9 * MIN, step: 0 } };
    const r = buildDeck(words, k => st[k], NOW);
    assert.deepEqual(r.deck.map(x => x.hawaiian), ["a"]);
    assert.equal(r.nextDue, NOW + 9 * MIN);
    assert.equal(buildDeck(words, k => st[k], NOW + 10 * MIN).deck.length, 2);
});

test("buildDeck: caught up when nothing is due and no new words remain", () => {
    const words = [{ hawaiian: "a", english: "1" }];
    const r = buildDeck(words, () => ({ due: NOW + DAY_MS }), NOW);
    assert.equal(r.deck.length, 0); assert.equal(r.nextDue, NOW + DAY_MS);
});

test("the formula marker appears exactly once across scripts/ and backend/", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = join(here, "..", "..");
    const marker = ["SM2", "FORMULA"].join("-");
    let hits = 0;
    const walk = dir => {
        for (const name of readdirSync(dir)) {
            if (name === ".venv" || name === "node_modules" || name === "__pycache__" || name.startsWith(".")) continue;
            const p = join(dir, name), st = statSync(p);
            if (st.isDirectory()) walk(p);
            else if (/\.(js|mjs|py)$/.test(name)) hits += (readFileSync(p, "utf8").split(`// ${marker}`).length - 1);
        }
    };
    walk(join(root, "scripts")); walk(join(root, "backend"));
    assert.equal(hits, 1);
});

test("describeNextDue words minutes / hours / tomorrow / N days / a date", () => {
    assert.equal(describeNextDue(NOW + 30 * 1000, NOW), "in under a minute");
    assert.equal(describeNextDue(NOW + 10 * MIN, NOW), "in 10 minutes");
    assert.equal(describeNextDue(NOW + 1 * MIN, NOW), "in 1 minute");
    assert.equal(describeNextDue(NOW + 60 * MIN, NOW), "in 1 hour");
    assert.equal(describeNextDue(NOW + 3 * 60 * MIN, NOW), "in 3 hours");
    assert.equal(describeNextDue(NOW + DAY_MS, NOW), "tomorrow");
    assert.equal(describeNextDue(NOW + 5 * DAY_MS, NOW), "in 5 days");
    assert.match(describeNextDue(NOW + 90 * DAY_MS, NOW), /^on \d{4}-\d{2}-\d{2}$/);
    assert.equal(describeNextDue(null, NOW), "");
});
