import test from "node:test";
import assert from "node:assert/strict";
import { checkKey, parsePassed, serializePassed, allPassed, isCorrect } from "../unit-check-core.js";

test("checkKey", () => assert.equal(checkKey(2, 3), "haw-unit-check:2:3"));

test("parsePassed tolerates junk and out-of-range", () => {
    assert.equal(parsePassed(null, 3).size, 0);
    assert.equal(parsePassed("nope", 3).size, 0);
    assert.equal(parsePassed('{"a":1}', 3).size, 0);
    assert.deepEqual([...parsePassed("[0,2,5,-1,1.5,\"x\"]", 3)], [0, 2]);
});

test("serialize round-trips", () => {
    const s = new Set([2, 0]);
    assert.equal(serializePassed(s), "[0,2]");
    assert.deepEqual([...parsePassed(serializePassed(s), 3)], [0, 2]);
});

test("allPassed", () => {
    assert.equal(allPassed(0, new Set()), true);
    assert.equal(allPassed(2, new Set([0])), false);
    assert.equal(allPassed(2, new Set([0, 1])), true);
});

test("isCorrect", () => {
    assert.equal(isCorrect({ answer: 1 }, "1"), true);
    assert.equal(isCorrect({ answer: 1 }, 0), false);
});
