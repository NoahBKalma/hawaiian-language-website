// Run: node --test "scripts/tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { synonymAnswers } from "../word-utils.js";

const kea = { hawaiian: `kea`, english: `white` };
const keokeo = { hawaiian: `keʻokeʻo`, english: `white` };
const ele = { hawaiian: `ʻeleʻele`, english: `black` };
const hiehie = { hawaiian: `hiehie`, english: `showy; superb` };
const nani = { hawaiian: `nani`, english: `superb` };
const words = [kea, keokeo, ele, hiehie, nani];

test(`same gloss: either word is accepted`, () => {
    assert.deepEqual(synonymAnswers(kea, words), [`kea`, `keʻokeʻo`]);
    assert.deepEqual(synonymAnswers(keokeo, words), [`kea`, `keʻokeʻo`]);
});

test(`taken words are excluded, so each synonym counts once`, () => {
    assert.deepEqual(synonymAnswers(keokeo, words, new Set([`kea`])), [`keʻokeʻo`]);
    assert.deepEqual(synonymAnswers(kea, words, new Set([`keʻokeʻo`])), [`kea`]);
});

test(`no synonyms: only the word itself`, () => {
    assert.deepEqual(synonymAnswers(ele, words), [`ʻeleʻele`]);
});

test(`a shared ";" definition counts as a synonym`, () => {
    assert.deepEqual(synonymAnswers(hiehie, words), [`hiehie`, `nani`]);
});

test(`ʻokina look-alikes in taken are matched canonically`, () => {
    assert.deepEqual(synonymAnswers(kea, words, new Set([`kea`])), [`keʻokeʻo`]);
});

test(`† is ignored when comparing answers`, async () => {
    const { canonical, normalize } = await import(`../word-utils.js`);
    assert.equal(canonical(`komite†`), canonical(`komite`));
    assert.equal(canonical(`komite †`), canonical(`komite`));
    assert.equal(normalize(`komite†`), normalize(`komite`));
    assert.deepEqual(synonymAnswers({ hawaiian: `supa†`, english: `soup` }, [{ hawaiian: `supa†`, english: `soup` }]), [`supa†`]);
});
