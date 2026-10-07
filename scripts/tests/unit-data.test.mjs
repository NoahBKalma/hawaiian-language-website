import test from "node:test";
import assert from "node:assert/strict";
import { TARGETS, getTarget, MAX_UNITS } from "../unit-data.js";

test("5 targets with ids 1..5 and expected slugs", () => {
    assert.equal(TARGETS.length, 5);
    assert.deepEqual(TARGETS.map(c => c.id), [1, 2, 3, 4, 5]);
    assert.deepEqual(TARGETS.map(c => c.slug), ["investigation", "interaction", "interpretive", "interpersonal", "presentational"]);
    assert.equal(MAX_UNITS, 4);
});
test("every target has the same 4 placeholder units and fits within MAX_UNITS", () => {
    for (const c of TARGETS) {
        assert.equal(c.units.length, 4, c.slug);
        assert.ok(c.units.length <= MAX_UNITS);
        c.units.forEach((l, i) => {
            assert.deepEqual(l, { haw: `Unit ${i + 1} name`, en: "Unit name", blurb: "Unit description", min: 5 });
            assert.equal(l.content, undefined);        // no unit has content yet: every unit page shows the "coming soon" shell
        });
    }
});
test("getTarget edge cases", () => {
    assert.equal(getTarget("4").slug, "interpersonal");
    assert.equal(getTarget(4).id, 4);
    for (const bad of [0, 6, -1, 1.5, "x", "", "4abc", null, undefined, NaN, {}]) assert.equal(getTarget(bad), undefined, String(bad));
});
test("all Hawaiian strings are NFC and use U+02BB, not apostrophes", () => {
    for (const c of TARGETS) for (const l of c.units) {
        for (const s of [l.haw, l.blurb]) assert.equal(s, s.normalize("NFC"));
        assert.ok(!/['’‘`]/.test(l.haw));
    }
});
