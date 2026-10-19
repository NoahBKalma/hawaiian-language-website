import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answerCells, buildPool, generate, validate, seededRng, SIZES } from "../crossword-gen.js";

const root = new URL("../../", import.meta.url);
const index = JSON.parse(readFileSync(new URL("pages/word-bank/words/index.json", root), "utf8"));
const allEntries = index.flatMap(p => JSON.parse(readFileSync(new URL(p.replace(/^\//, ""), root), "utf8")).words);

test("answerCells keeps okina cells and kahako vowels, drops spaces", () => {
    assert.deepEqual(answerCells("hoʻāʻo"), ["h", "o", "ʻ", "ā", "ʻ", "o"]);
    assert.deepEqual(answerCells("Aloha kakahiaka"), [..."alohakakahiaka"]);
    assert.deepEqual(answerCells("ʻaʻā-nui"), ["ʻ", "a", "ʻ", "ā", "n", "u", "i"]);
    assert.deepEqual(answerCells("ho'ola"), ["h", "o", "ʻ", "o", "l", "a"]);
});

test("buildPool filters length, letters, duplicate answers and clues", () => {
    const pool = buildPool([
        { hawaiian: "aloha", english: "love" },
        { hawaiian: "aloha", english: "greeting" },
        { hawaiian: "ʻono", english: "love" },
        { hawaiian: "ka", english: "the" },
        { hawaiian: "hale", english: "" },
        { hawaiian: "x1z", english: "bad" },
        { hawaiian: "kai", english: "sea" },
    ], "mini");
    assert.deepEqual(pool.map(p => p.cells.join("")), ["aloha", "kai"]);
});

test("generate returns null when the pool is too small", () => {
    assert.equal(generate(buildPool([{ hawaiian: "kai", english: "sea" }], "mini"), "mini"), null);
});

for (const size of Object.keys(SIZES)) {
    test(`generate (${size}) from all sets is valid, in bounds, and reaches the minimum`, () => {
        const pool = buildPool(allEntries, size);
        for (let seed = 1; seed <= 15; seed++) {
            const puzzle = generate(pool, size, seededRng(seed));
            assert.ok(puzzle, `seed ${seed} produced no puzzle`);
            assert.deepEqual(validate(puzzle), [], `seed ${seed}`);
            assert.ok(puzzle.words.length >= SIZES[size].min, `seed ${seed}: ${puzzle.words.length} words`);
            assert.ok(puzzle.rows <= SIZES[size].dim && puzzle.cols <= SIZES[size].dim, `seed ${seed}: ${puzzle.rows}x${puzzle.cols}`);
        }
    });
}

test("okina appears as its own cell in a generated grid", () => {
    const pool = buildPool(allEntries.filter(e => e.hawaiian.includes("ʻ")), "standard");
    const puzzle = generate(pool, "standard", seededRng(7));
    assert.ok(puzzle.grid.flat().includes("ʻ"));
});

test(`hashSeed + seededRng give the same daily puzzle every time, and a different one on another day`, async () => {
    const { hashSeed } = await import(`../crossword-gen.js`);
    const entries = [];
    const letters = `aeiouhklmnpw`;
    for (let i = 0; i < 400; i++) {
        const a = letters[i % 12], b = letters[(i * 7 + 3) % 12], c = letters[(i * 5 + 1) % 12], d = letters[(i * 11 + 2) % 12];
        entries.push({ hawaiian: `${a}${b}${c}${d}${i % 3 ? a : ``}`, english: `clue ${i}` });
    }
    const pool = buildPool(entries, `mini`);
    const make = (day) => generate(pool, `mini`, seededRng(hashSeed(`crossword-daily:${day}`)));
    const answers = (puzzle) => puzzle.words.map(w => `${w.dir}:${w.row},${w.col}:${w.cells.join(``)}`).join(`|`);
    assert.equal(answers(make(`2026-10-19`)), answers(make(`2026-10-19`)));
    assert.notEqual(answers(make(`2026-10-19`)), answers(make(`2026-10-20`)));
    assert.equal(hashSeed(`x`), hashSeed(`x`));
});
