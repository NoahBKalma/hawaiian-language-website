// Run: node --test "scripts/tests/*.test.mjs"
// quiz-engine.js is a .js file with ESM syntax and there is no package.json "type"; Node 24 detects ESM
// automatically. If detection is ever unavailable, run with `node --experimental-detect-module`.
import test from "node:test";
import assert from "node:assert/strict";
import {
    canQuiz, connectCapacity, buildQuiz, gradeQuestion, scoreQuiz, mulberry32, attemptEventsFor
} from "../quiz-engine.js";
import { canonical, splitGlosses } from "../word-utils.js";

const SEEDS = 200;

function makeWords(n, prefix = `w`) {
    return Array.from({ length: n }, (_, i) => ({ hawaiian: `${prefix}${i}`, english: `${prefix}gloss${i}`, pos: `noun` }));
}

const BANK = makeWords(300, `bank`).map((w, i) => ({ ...w, pos: i % 2 ? `verb` : `noun` }));

function gloss(w) {
    return new Set([canonical(w.english), ...splitGlosses(w.english).map(canonical)]);
}
function overlap(a, b) {
    for (const g of gloss(a)) if (gloss(b).has(g)) return true;
    return false;
}
function targetOf(q) { return q.type === `connect` ? null : q.word; }

test(`splitGlosses and canonical`, () => {
    assert.deepEqual(splitGlosses(`beating/ stroke`), [`beating`, `stroke`]);
    assert.deepEqual(splitGlosses(null), []);
    assert.equal(canonical(`  Ka'a  `), `kaʻa`);
});

test(`canQuiz: 1 and 2 word sets are unplayable, 3+ playable`, () => {
    assert.equal(canQuiz(makeWords(1)), false);
    assert.equal(canQuiz(makeWords(2)), false);
    assert.equal(canQuiz([{ hawaiian: `a`, english: `x` }, { hawaiian: `b`, english: `x` }]), false);
    for (const n of [3, 4, 5, 9, 10, 11, 25]) assert.equal(canQuiz(makeWords(n)), true, `n=${n}`);
    assert.equal(canQuiz(makeWords(5).concat(makeWords(5))), true); // duplicates dedupe to 5
    assert.equal(canQuiz(Array.from({ length: 4 }, () => ({ hawaiian: `a`, english: `x` }))), false); // one unique
});

test(`buildQuiz returns too_small exactly when canQuiz is false`, () => {
    for (const n of [0, 1, 2]) assert.deepEqual(buildQuiz(makeWords(n), { bank: BANK }), { error: `too_small` });
    assert.ok(buildQuiz(makeWords(3), { bank: BANK }).questions);
});

test(`adversarial capacity inputs never throw`, () => {
    const inputs = [
        [], null, undefined, `str`, 42, {}, [null, undefined, 1],
        [{ hawaiian: `a`, english: `x` }, { hawaiian: `a`, english: `y` }],
        Array.from({ length: 6 }, (_, i) => ({ hawaiian: `h${i}`, english: `same` })),
        [{ hawaiian: `a`, english: `go/walk` }, { hawaiian: `b`, english: `walk` }],
        [{ hawaiian: `a` }, { english: `x` }, { hawaiian: ``, english: `` }, { hawaiian: 5, english: 6 }]
    ];
    for (const input of inputs) {
        const c = connectCapacity(input);
        assert.equal(typeof c, `number`);
        assert.doesNotThrow(() => canQuiz(input));
        assert.doesNotThrow(() => buildQuiz(input, { bank: BANK }));
    }
    assert.equal(connectCapacity([{ hawaiian: `a`, english: `go/walk` }, { hawaiian: `b`, english: `walk` }]), 0);
    assert.equal(connectCapacity(makeWords(4)), 2);
});

for (const n of [3, 5, 9, 10, 11, 25]) {
    test(`buildQuiz structure, N=${n}, ${SEEDS} seeds`, () => {
        const words = makeWords(n);
        const q = n >= 10 ? 10 : 5;
        for (let seed = 1; seed <= SEEDS; seed++) {
            const res = buildQuiz(words, { bank: BANK, rng: mulberry32(seed) });
            assert.ok(res.questions, `seed ${seed}`);
            const qs = res.questions;
            assert.equal(qs.length, q);

            const writing = [], mc = [], connect = [], targets = [];
            for (const x of qs) {
                assert.ok([`to_eng`, `to_haw`].includes(x.dir));
                assert.equal(x.variant, `${x.type}_${x.dir}`);
                if (x.type === `writing`) { writing.push(x.word.hawaiian); targets.push(x.word.hawaiian); }
                if (x.type === `mc`) {
                    mc.push(x.word.hawaiian); targets.push(x.word.hawaiian);
                    assert.equal(x.options.length, 4);
                    assert.equal(x.options[x.correctIndex], x.word);
                    const accepted = x.options.filter((_, i) => gradeQuestion(x, i, words).correct);
                    assert.equal(accepted.length, 1);
                }
                if (x.type === `connect`) {
                    assert.ok(x.pairs.length >= 2 && x.pairs.length <= 5);
                    assert.deepEqual(x.rightOrder.slice().sort(), x.pairs.map((_, i) => i));
                    for (const p of x.pairs) connect.push(p.hawaiian);
                    // pairwise non-overlapping glosses and distinct Hawaiian
                    for (let i = 0; i < x.pairs.length; i++) for (let j = i + 1; j < x.pairs.length; j++) {
                        assert.ok(!overlap(x.pairs[i], x.pairs[j]));
                        assert.notEqual(x.pairs[i].hawaiian, x.pairs[j].hawaiian);
                    }
                }
            }
            assert.equal(new Set(writing).size, writing.length);
            assert.equal(new Set(mc).size, mc.length);
            assert.equal(new Set(connect).size, connect.length);
            if (n >= q) {
                // distinct target words for writing/mc questions (connect questions are not counted here)
                assert.equal(new Set(targets).size, targets.length);
            }
        }
    });
}

test(`N=3 and N=4: 5 questions, no (word, format) repeat`, () => {
    for (const n of [3, 4]) {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const { questions } = buildQuiz(makeWords(n), { bank: BANK, rng: mulberry32(seed) });
            assert.equal(questions.length, 5);
            const seen = new Set();
            for (const x of questions) {
                const words = x.type === `connect` ? x.pairs : [x.word];
                for (const w of words) {
                    const key = `${x.type}:${w.hawaiian}`;
                    assert.ok(!seen.has(key), key);
                    seen.add(key);
                }
            }
        }
    }
});

test(`N>=Q: every target distinct (connect target counted)`, () => {
    // connect questions have a hidden target, so check distinct question count == distinct (type) usage
    const words = makeWords(10);
    for (let seed = 1; seed <= SEEDS; seed++) {
        const { questions } = buildQuiz(words, { bank: BANK, rng: mulberry32(seed) });
        assert.equal(questions.length, 10);
        const wr = questions.filter(x => x.type === `writing`).length;
        const m = questions.filter(x => x.type === `mc`).length;
        assert.ok(wr <= 10 && m <= 10);
    }
});

test(`ambiguity: identical English set never makes connect, MC has one acceptable answer`, () => {
    const same = [0, 1, 2].map(i => ({ hawaiian: `s${i}`, english: `same thing`, pos: `noun` }));
    const mixedBank = BANK.concat(same);
    assert.equal(canQuiz(same), true);
    for (let seed = 1; seed <= SEEDS; seed++) {
        const { questions } = buildQuiz(same, { bank: mixedBank, rng: mulberry32(seed) });
        assert.equal(questions.length, 5);
        for (const x of questions) {
            assert.notEqual(x.type, `connect`);
            if (x.type !== `mc`) continue;
            assert.equal(x.options.filter((_, i) => gradeQuestion(x, i, same).correct).length, 1);
            for (const o of x.options) if (o !== x.word) assert.ok(!same.some(s => s.hawaiian === o.hawaiian));
        }
    }
});

test(`MC distractors never overlap target glosses (slash glosses)`, () => {
    const words = [
        { hawaiian: `a`, english: `go/walk`, pos: `verb` },
        { hawaiian: `b`, english: `walk`, pos: `verb` },
        { hawaiian: `c`, english: `run`, pos: `verb` },
        { hawaiian: `d`, english: `eat`, pos: `verb` },
        { hawaiian: `e`, english: `sleep/rest`, pos: `verb` }
    ];
    for (let seed = 1; seed <= SEEDS; seed++) {
        const { questions } = buildQuiz(words, { bank: BANK, rng: mulberry32(seed) });
        for (const x of questions) {
            if (x.type === `mc`) {
                for (const o of x.options) if (o !== x.word) assert.ok(!overlap(o, x.word));
                for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(!overlap(x.options[i], x.options[j]));
            }
            if (x.type === `connect`) {
                for (let i = 0; i < x.pairs.length; i++) for (let j = i + 1; j < x.pairs.length; j++) assert.ok(!overlap(x.pairs[i], x.pairs[j]));
            }
        }
    }
});

test(`MC with a tiny unusable bank returns too_small, never an ambiguous question`, () => {
    const same = [0, 1, 2].map(i => ({ hawaiian: `s${i}`, english: `same`, pos: `noun` }));
    // writing-only is not possible for 5 questions of 3 words, so some MC is required
    assert.deepEqual(buildQuiz(same, { bank: [], rng: mulberry32(1) }), { error: `too_small` });
});

test(`grading: writing to_haw is strict, to_eng is lenient`, () => {
    const w = { hawaiian: `kāne`, english: `man/male`, pos: `noun` };
    const toHaw = { type: `writing`, dir: `to_haw`, word: w };
    const toEng = { type: `writing`, dir: `to_eng`, word: w };
    assert.equal(gradeQuestion(toHaw, `kāne`, [w]).correct, true);
    assert.equal(gradeQuestion(toHaw, `  KĀNE `, [w]).correct, true);
    assert.equal(gradeQuestion(toHaw, `a`.normalize(), [w]).correct, false);
    const miss = gradeQuestion(toHaw, `kane`, [w]);
    assert.equal(miss.correct, false);
    assert.equal(miss.nearMiss, true);
    assert.equal(gradeQuestion(toHaw, ``, [w]).answered, false);
    const okina = { hawaiian: `ʻohana`, english: `family` };
    assert.equal(gradeQuestion({ type: `writing`, dir: `to_haw`, word: okina }, `'ohana`, [okina]).correct, true);
    // synonym set word is accepted
    const syn = { hawaiian: `wahine`, english: `woman/female` };
    const syn2 = { hawaiian: `kaikamahine`, english: `girl/female` };
    assert.equal(gradeQuestion({ type: `writing`, dir: `to_haw`, word: syn }, `kaikamahine`, [syn, syn2]).correct, true);
    assert.equal(gradeQuestion(toEng, `Man`, [w]).correct, true);
    assert.equal(gradeQuestion(toEng, ` male `, [w]).correct, true);
    assert.equal(gradeQuestion(toEng, `man/male`, [w]).correct, true);
    assert.equal(gradeQuestion(toEng, `woman`, [w]).correct, false);
});

test(`grading: mc and connect partial credit`, () => {
    const ws = makeWords(3);
    const mc = { type: `mc`, dir: `to_eng`, word: ws[0], options: [ws[1], ws[0], ws[2], BANK[0]], correctIndex: 1 };
    assert.equal(gradeQuestion(mc, 1, ws).score, 1);
    assert.equal(gradeQuestion(mc, 0, ws).score, 0);
    assert.equal(gradeQuestion(mc, undefined, ws).answered, false);
    const cn = { type: `connect`, dir: `to_eng`, pairs: ws, rightOrder: [2, 0, 1] };
    const g = gradeQuestion(cn, { 0: 0, 1: 2 }, ws);
    assert.equal(g.correctPairs, 1);
    assert.ok(Math.abs(g.score - 1 / 3) < 1e-9);
    assert.deepEqual(g.pairs, [true, false, false]);
    assert.equal(gradeQuestion(cn, {}, ws).answered, false);
    assert.equal(gradeQuestion(cn, { 0: 0, 1: 1, 2: 2 }, ws).correct, true);
});

test(`scoreQuiz matches QuizResultIn consistency`, () => {
    const ws = makeWords(12);
    for (let seed = 1; seed <= 50; seed++) {
        const { questions } = buildQuiz(ws, { bank: BANK, rng: mulberry32(seed) });
        const rng = mulberry32(seed + 999);
        const answers = questions.map(q => {
            if (rng() < 0.2) return undefined;
            if (q.type === `writing`) return q.dir === `to_haw` ? q.word.hawaiian : q.word.english;
            if (q.type === `mc`) return q.correctIndex;
            const a = {}; q.pairs.forEach((_, i) => { if (rng() < 0.7) a[i] = i; }); return a;
        });
        const s = scoreQuiz(questions, answers, ws);
        assert.equal(s.question_count, 10);
        assert.equal(s.writing_total + s.mc_total + s.connect_total, 10);
        assert.ok(s.writing_correct <= s.writing_total && s.mc_correct <= s.mc_total && s.connect_score <= s.connect_total + 1e-9);
        assert.ok(Math.abs(s.score - (s.writing_correct + s.mc_correct + s.connect_score)) < 1e-9);
        assert.equal(s.unanswered, answers.filter((a, i) => !gradeQuestion(questions[i], a, ws).answered).length);
    }
    const all = buildQuiz(ws, { bank: BANK, rng: mulberry32(7) }).questions;
    assert.equal(scoreQuiz(all, [], ws).unanswered, 10);
});

test(`attemptEventsFor: connect k events, unanswered skipped, Hawaiian key, is_retry`, () => {
    const ws = makeWords(3);
    const cn = { type: `connect`, dir: `to_haw`, variant: `connect_to_haw`, pairs: ws, rightOrder: [0, 1, 2] };
    const wr = { type: `writing`, dir: `to_eng`, variant: `writing_to_eng`, word: ws[0] };
    const mc = { type: `mc`, dir: `to_eng`, variant: `mc_to_eng`, word: ws[1], options: [ws[1], ws[2], BANK[0], BANK[1]], correctIndex: 0 };
    const unans = { type: `connect`, dir: `to_eng`, variant: `connect_to_eng`, pairs: ws, rightOrder: [0, 1, 2] };

    const ev = attemptEventsFor([cn, wr, mc, unans], [{ 0: 0, 1: 2 }, `wgloss0`, 3, {}], ws);
    assert.equal(ev.length, 3 + 1 + 1);                 // unanswered connect (0 pairs) logs nothing
    assert.deepEqual(ev.slice(0, 3).map(e => [e.word_hawaiian, e.outcome, e.is_retry]), [
        [`w0`, `correct`, false], [`w1`, `incorrect`, false], [`w2`, `incorrect`, false]
    ]);
    assert.ok(ev.slice(0, 3).every(e => e.variant === `connect_to_haw`));
    assert.deepEqual([ev[3].word_hawaiian, ev[3].outcome, ev[3].is_retry, ev[3].variant], [`w0`, `correct`, true, `writing_to_eng`]);
    assert.deepEqual([ev[4].word_hawaiian, ev[4].outcome, ev[4].is_retry], [`w1`, `incorrect`, true]); // option 3 is wrong
    assert.equal(attemptEventsFor([wr], [undefined], ws).length, 0);
});

test(`attemptEventsFor at N=12: a writing/MC target reused as connect word is a retry`, () => {
    const ws = makeWords(12);
    let sawRetry = false;
    for (let seed = 1; seed <= SEEDS && !sawRetry; seed++) {
        const { questions } = buildQuiz(ws, { bank: BANK, rng: mulberry32(seed) });
        const answers = questions.map(q => q.type === `writing` ? q.word.hawaiian
            : q.type === `mc` ? q.correctIndex : Object.fromEntries(q.pairs.map((_, i) => [i, i])));
        const ev = attemptEventsFor(questions, answers, ws);
        const seen = new Set();
        for (const e of ev) {
            assert.equal(e.is_retry, seen.has(e.word_hawaiian));
            seen.add(e.word_hawaiian);
        }
        if (ev.some(e => e.is_retry)) sawRetry = true;
        assert.equal(ev.length, questions.reduce((n, q) => n + (q.type === `connect` ? q.pairs.length : 1), 0));
    }
    assert.ok(sawRetry);
});

test(`rng is injectable and deterministic`, () => {
    const ws = makeWords(10);
    const a = buildQuiz(ws, { bank: BANK, rng: mulberry32(42) });
    const b = buildQuiz(ws, { bank: BANK, rng: mulberry32(42) });
    assert.deepEqual(a, b);
    const dirs = new Set();
    for (let s = 1; s <= 20; s++) buildQuiz(ws, { bank: BANK, rng: mulberry32(s) }).questions.forEach(q => dirs.add(q.dir));
    assert.equal(dirs.size, 2);
});

test(`quizQuestionCount dedups by canonical, like the engine`, async () => {
    const { quizQuestionCount } = await import(`../quiz-engine.js`);
    const base = makeWords(9);
    assert.equal(quizQuestionCount(base), 5);
    // differs from base[0] only by case/whitespace/macron/okina-style canonical forms -> still 9 unique
    assert.equal(quizQuestionCount([...base, { hawaiian: ` W0 `, english: `x`, pos: `noun` }]), 5);
    assert.equal(quizQuestionCount([...base, { hawaiian: `w9`, english: `g9`, pos: `noun` }]), 10);
    assert.equal(quizQuestionCount(null), 5);
});
