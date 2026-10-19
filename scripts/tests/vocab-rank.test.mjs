// Run: node --test "scripts/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import {
    buildWordIndex, rankWords, rankSets, rankByName, editDistance, maxEdits, variants, sameForm, sameName, MAX_WORD_RESULTS
} from "../vocab-rank.js";

const w = (hawaiian, english, pos = `noun`) => ({ hawaiian, english, pos, setId: `s` });
const haws = list => list.map(e => e.hawaiian);

test(`exact Hawaiian word and exact English gloss are both "best"`, () => {
    const idx = buildWordIndex([w(`me`, `with`), w(`au`, `i; me`), w(`meme`, `x`), w(`kame`, `to meet`)]);
    const r = rankWords(idx, `me`);
    assert.deepEqual(haws(r.best), [`me`, `au`]);
    assert.ok(!haws(r.rest).includes(`me`));
});

test(`other tiers: whole word in a phrase, prefix, later word start, mid-word`, () => {
    const idx = buildWordIndex([
        w(`a`, `big red hat`), w(`b`, `redemption`), w(`c`, `red earth`), w(`d`, `credit`), w(`e`, `red`), w(`f`, `bored`),
    ]);
    const r = rankWords(idx, `red`);
    assert.deepEqual(haws(r.best), [`e`]);
    // whole words (a, c; equal length, data order), then prefix (b), then mid-word (d, f: shorter first)
    assert.deepEqual(haws(r.rest), [`a`, `c`, `b`, `d`, `f`]);
});

test(`whole Hawaiian word inside a phrase ranks above a prefix`, () => {
    const idx = buildWordIndex([w(`halelani`, `heaven`), w(`hale ukana`, `warehouse`), w(`hale`, `house`)]);
    const r = rankWords(idx, `hale`);
    assert.deepEqual(haws(r.best), [`hale`]);
    assert.deepEqual(haws(r.rest), [`hale ukana`, `halelani`]);
});

test(`plurals are ignored on both sides for English`, () => {
    const idx = buildWordIndex([w(`kala`, `color`), w(`ʻulaʻula`, `berries`), w(`x`, `colors`)]);
    assert.deepEqual(haws(rankWords(idx, `colors`).best), [`x`, `kala`]);
    assert.deepEqual(haws(rankWords(idx, `color`).best), [`x`, `kala`]);
    assert.deepEqual(haws(rankWords(idx, `berry`).best), [`ʻulaʻula`]);
});

test(`variants and sameForm leave short words alone`, () => {
    assert.ok(sameForm(`colors`, `color`) && sameForm(`boxes`, `box`) && sameForm(`berries`, `berry`));
    assert.deepEqual([...variants(`bus`)], [`bus`]);
    assert.ok(!sameForm(`bus`, `bu`));
    assert.ok(!sameForm(`glass`, `glas`));
});

test(`macrons, okina and case are ignored`, () => {
    const idx = buildWordIndex([w(`Hōʻike`, `show`)]);
    assert.equal(rankWords(idx, `hoike`).best.length, 1);
});

test(`cap keeps the best-ranked matches, not the first in data order`, () => {
    const entries = Array.from({ length: 400 }, (_, i) => w(`x${i}`, `zzcat${i}`));
    entries.push(w(`best`, `big cat`));
    const r = rankWords(buildWordIndex(entries), `cat`);
    assert.equal(r.rest.length, MAX_WORD_RESULTS);
    assert.equal(r.rest[0].hawaiian, `best`);
    assert.equal(r.total, 401);
});

test(`duplicates across sets show once; excluded pos are dropped`, () => {
    const idx = buildWordIndex([w(`honu`, `turtle`), w(`honu`, `turtle`), w(`honu`, `turtle`, `phrase`)]);
    assert.equal(rankWords(idx, `honu`).best.length, 1);
    assert.equal(rankWords(idx, `honu`, new Set([`noun`])).best.length, 1);
});

test(`fuzzy rescues a typo when matches are thin`, () => {
    const idx = buildWordIndex([w(`honu`, `turtle`), w(`manu`, `bird`)]);
    const r = rankWords(idx, `honnu`);
    assert.equal(r.best.length + r.rest.length, 0);
    assert.equal(r.fuzzy[0].hawaiian, `honu`);
});

test(`fuzzy never runs under 4 letters or with 5+ matches`, () => {
    const idx = buildWordIndex([w(`hon`, `a`), w(`hou`, `b`)]);
    assert.equal(rankWords(idx, `hoo`).fuzzy.length, 0);
    const many = buildWordIndex([...Array.from({ length: 5 }, (_, i) => w(`honu${i}`, `t${i}`)), w(`honi`, `kiss`)]);
    assert.equal(rankWords(many, `honu`).fuzzy.length, 0);
});

test(`editDistance and maxEdits`, () => {
    assert.equal(editDistance(`honu`, `hnu`, 2), 1);
    assert.equal(editDistance(`abcd`, `wxyz`, 1), 2);
    assert.deepEqual([3, 4, 6, 7].map(maxEdits), [0, 1, 1, 2]);
});

test(`rankByName orders exact, prefix, word start, substring`, () => {
    const sets = [{ k: `big animals` }, { k: `animalsx` }, { k: `animals` }, { k: `other` }];
    assert.deepEqual(rankByName(sets, `animals`, s => [s.k]).map(s => s.k), [`animals`, `animalsx`, `big animals`]);
});

const mkSet = (id, name, category, pos = `noun`) => ({
    set: { id, part_of_speech: pos },
    keys: [name.toLowerCase(), ``],
    parentKeys: [category.toLowerCase()],
});

test(`rankSets: own name is exact (plural-insensitive), category only when searched exactly`, () => {
    const idx = [
        mkSet(`1`, `Colors`, `Objects & Tools`), mkSet(`2`, `Color Words`, `Objects & Tools`),
        mkSet(`3`, `Tools`, `Objects & Tools`), mkSet(`4`, `Hair Color`, `Body`),
    ];
    const r = rankSets(idx, `color`);
    assert.deepEqual(r.best.map(s => s.id), [`1`]);
    assert.deepEqual(r.rest.map(s => s.id), [`2`, `4`]);
    // category name only counts when it is searched exactly
    assert.deepEqual(rankSets(idx, `objects & tools`).best.map(s => s.id), [`1`, `2`, `3`]);
    assert.equal(rankSets(idx, `objects`).best.length, 0);
});

test(`rankSets: "&" reads as "and" and the order of the parts does not matter`, () => {
    const idx = [mkSet(`1`, `Homes & Rooms`, `Places`), mkSet(`2`, `Furniture`, `Objects & Tools`), mkSet(`3`, `Birds`, `Animals`)];
    for (const q of [`objects and tools`, `Objects & Tools`, `tools and objects`, `tools & objects`]) {
        assert.deepEqual(rankSets(idx, q).best.map(s => s.id), [`2`], q);
    }
    for (const q of [`homes and rooms`, `rooms and homes`, `room & home`]) {
        assert.deepEqual(rankSets(idx, q).best.map(s => s.id), [`1`], q);
    }
    // a partial name still lands in the rest list
    assert.deepEqual(rankSets(idx, `homes and`).rest.map(s => s.id), [`1`]);
    assert.ok(sameName(`bread & butter`, `butter and bread`) && !sameName(`tools`, `tools and objects`));
});

test(`a leading "to" on a verb gloss is ignored for exact matches`, () => {
    const idx = buildWordIndex([w(`holo`, `to run`, `verb`), w(`ʻauwana`, `to wander; to roam`, `verb`), w(`ala`, `running`, `noun`), w(`x`, `to`)]);
    assert.deepEqual(haws(rankWords(idx, `run`).best), [`holo`]);
    assert.deepEqual(haws(rankWords(idx, `to run`).best), [`holo`]);
    assert.deepEqual(haws(rankWords(idx, `wander`).best), [`ʻauwana`]);
    assert.deepEqual(haws(rankWords(idx, `roam`).best), [`ʻauwana`]);
    // the bare word "to" is not stripped to nothing
    assert.deepEqual(haws(rankWords(idx, `to`).best), [`x`]);
});
