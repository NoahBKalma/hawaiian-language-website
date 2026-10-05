// Pure quiz engine: question generation, grading, scoring and attempt-event building. No DOM.
// Relative imports only so Node can run the unit tests; never import compile-words.js.
import { canonical, normalize, splitGlosses } from "./word-utils.js";

const MIN_WORDS = 3;               // sets with fewer unique words are unplayable
const MAX_CONNECT_PAIRS = 5;
const MAX_TRIES = 50;
const TYPES = [`writing`, `mc`, `connect`];

// ---------- small helpers ----------

export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffled(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

function randInt(lo, hi, rng) {
    return lo + Math.floor(rng() * (hi - lo + 1));
}

function isValidWord(w) {
    return w !== null && typeof w === `object`
        && typeof w.hawaiian === `string` && w.hawaiian.trim() !== ``
        && typeof w.english === `string` && w.english.trim() !== ``;
}

// valid entries, deduplicated by canonical(hawaiian); never throws
function uniqueWords(words) {
    const seen = new Set();
    const out = [];
    if (!Array.isArray(words)) return out;
    for (const w of words) {
        if (!isValidWord(w)) continue;
        const key = canonical(w.hawaiian);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(w);
    }
    return out;
}

// G(w): canonical full gloss plus each "/" alternative
function glossSet(w) {
    const set = new Set([canonical(w.english)]);
    for (const g of splitGlosses(w.english)) set.add(canonical(g));
    return set;
}

function overlaps(a, b) {
    for (const g of a) if (b.has(g)) return true;
    return false;
}

function compatible(a, b) {
    return canonical(a.hawaiian) !== canonical(b.hawaiian) && !overlaps(glossSet(a), glossSet(b));
}

function quizSize(n) {
    return n >= 10 ? 10 : 5;
}

// ---------- feasibility ----------

// Deterministic greedy matching: number of disjoint compatible pairs. Lower bound on the true maximum.
function greedyPairs(unique) {
    const sorted = unique.slice().sort((a, b) => {
        const x = canonical(a.hawaiian), y = canonical(b.hawaiian);
        return x < y ? -1 : x > y ? 1 : 0;
    });
    const matched = new Array(sorted.length).fill(false);
    const pairs = [];
    for (let i = 0; i < sorted.length; i++) {
        if (matched[i]) continue;
        for (let j = i + 1; j < sorted.length; j++) {
            if (matched[j] || !compatible(sorted[i], sorted[j])) continue;
            matched[i] = matched[j] = true;
            pairs.push([sorted[i], sorted[j]]);
            break;
        }
    }
    return pairs;
}

// number of distinct (canonical) valid words; the picker uses this to label the question count
export function quizQuestionCount(words) {
    try {
        return quizSize(uniqueWords(words).length);
    } catch {
        return 5;
    }
}

export function connectCapacity(words) {
    try {
        return greedyPairs(uniqueWords(words)).length;
    } catch {
        return 0;
    }
}

export function canQuiz(words) {
    try {
        const n = uniqueWords(words).length;
        if (n < MIN_WORDS) return false;
        return 2 * n >= quizSize(n) || 2 * n + connectCapacity(words) >= quizSize(n);
    } catch {
        return false;
    }
}

// ---------- generation ----------

// mutually compatible group starting with t, built greedily over the shuffled free words
function compatibleGroup(t, freeWords, rng) {
    const group = [t];
    for (const w of shuffled(freeWords, rng)) {
        if (group.length >= MAX_CONNECT_PAIRS) break;
        if (group.every(m => compatible(m, w))) group.push(w);
    }
    return group;
}

function makeConnect(group, dir, rng) {
    const pairs = shuffled(group, rng);
    return { type: `connect`, dir, variant: `connect_${dir}`, pairs, rightOrder: shuffled(pairs.map((_, i) => i), rng) };
}

function makeMc(t, unique, bank, dir, rng) {
    const tKey = canonical(t.hawaiian);
    const tGloss = glossSet(t);
    const chosen = [];
    const chosenGloss = [];
    const shown = (w) => canonical(dir === `to_haw` ? w.hawaiian : w.english);
    const taken = new Set([shown(t)]);

    const tryAdd = (c) => {
        if (!isValidWord(c) || canonical(c.hawaiian) === tKey) return;
        const g = glossSet(c);
        if (overlaps(g, tGloss) || chosenGloss.some(o => overlaps(g, o)) || taken.has(shown(c))) return;
        chosen.push(c);
        chosenGloss.push(g);
        taken.add(shown(c));
    };

    const bankList = Array.isArray(bank) ? bank : [];
    const tiers = [
        unique.filter(w => w !== t),
        bankList.filter(w => w && w.pos !== undefined && w.pos === t.pos),
        bankList
    ];
    for (const tier of tiers) {
        for (const c of shuffled(tier, rng)) {
            if (chosen.length >= 3) break;
            tryAdd(c);
        }
        if (chosen.length >= 3) break;
    }
    if (chosen.length < 3) return null;
    const options = shuffled([t, ...chosen], rng);
    return { type: `mc`, dir, variant: `mc_${dir}`, word: t, options, correctIndex: options.indexOf(t) };
}

function attemptBuild(unique, q, rng) {
    const n = unique.length;
    let targets = shuffled(unique, rng);
    if (n >= q) targets = targets.slice(0, q);
    else while (targets.length < q) targets = targets.concat(shuffled(unique, rng)).slice(0, q);

    const used = { writing: new Set(), mc: new Set(), connect: new Set() };
    const specs = [];
    for (const t of targets) {
        const key = canonical(t.hawaiian);
        let made = null;
        for (const type of shuffled(TYPES, rng)) {
            if (used[type].has(key)) continue;
            if (type === `connect`) {
                const free = unique.filter(w => w !== t && !used.connect.has(canonical(w.hawaiian)));
                const group = compatibleGroup(t, free, rng);
                if (group.length < 2) continue;
                const k = randInt(2, Math.min(MAX_CONNECT_PAIRS, group.length), rng);
                const picked = group.slice(0, k);
                picked.forEach(w => used.connect.add(canonical(w.hawaiian)));
                made = { type, picked };
            } else {
                used[type].add(key);
                made = { type, word: t };
            }
            break;
        }
        if (!made) return null;
        specs.push(made);
    }
    return specs;
}

// deterministic fallback: writing for every word, then MC, then greedy connect pairs
function fallbackSpecs(unique, q, rng) {
    const specs = [];
    const order = shuffled(unique, rng);
    for (const type of [`writing`, `mc`]) {
        for (const w of order) {
            if (specs.length < q) specs.push({ type, word: w });
        }
    }
    for (const pair of greedyPairs(unique)) {
        if (specs.length < q) specs.push({ type: `connect`, picked: pair });
    }
    return specs.length === q ? specs : null;
}

export function buildQuiz(words, { bank = [], rng = Math.random } = {}) {
    try {
        if (!canQuiz(words)) return { error: `too_small` };
        const unique = uniqueWords(words);
        const q = quizSize(unique.length);

        let specs = null;
        for (let i = 0; i < MAX_TRIES && !specs; i++) specs = attemptBuild(unique, q, rng);
        if (!specs) specs = fallbackSpecs(unique, q, rng);
        if (!specs) return { error: `too_small` };

        const questions = [];
        for (const spec of specs) {
            const dir = rng() < 0.5 ? `to_eng` : `to_haw`;
            if (spec.type === `connect`) {
                questions.push(makeConnect(spec.picked, dir, rng));
            } else if (spec.type === `writing`) {
                questions.push({ type: `writing`, dir, variant: `writing_${dir}`, word: spec.word });
            } else {
                const mc = makeMc(spec.word, unique, bank, dir, rng);
                if (!mc) return { error: `too_small` };
                questions.push(mc);
            }
        }
        return { questions };
    } catch {
        return { error: `too_small` };
    }
}

// ---------- grading ----------

function connectAnswerMap(question, answer) {
    const map = {};
    if (answer === null || typeof answer !== `object`) return map;
    const k = question.pairs.length;
    for (const key of Object.keys(answer)) {
        const i = Number(key), j = answer[key];
        if (Number.isInteger(i) && i >= 0 && i < k && Number.isInteger(j) && j >= 0 && j < k) map[i] = j;
    }
    return map;
}

export function isAnswered(question, answer) {
    if (question.type === `writing`) return typeof answer === `string` && answer.trim() !== ``;
    if (question.type === `mc`) return Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
    return Object.keys(connectAnswerMap(question, answer)).length > 0;
}

export function gradeQuestion(question, answer, setWords) {
    const answered = isAnswered(question, answer);
    if (question.type === `connect`) {
        const map = connectAnswerMap(question, answer);
        const pairs = question.pairs.map((_, i) => map[i] === i);
        const correctPairs = pairs.filter(Boolean).length;
        const k = pairs.length;
        return { answered, correct: answered && correctPairs === k, score: correctPairs / k, correctPairs, k, pairs };
    }
    if (!answered) return { answered, correct: false, score: 0 };

    if (question.type === `mc`) {
        const t = question.word;
        const picked = question.options[answer];
        const ok = canonical(picked.hawaiian) === canonical(t.hawaiian) || overlaps(glossSet(picked), glossSet(t));
        return { answered, correct: ok, score: ok ? 1 : 0 };
    }

    const t = question.word;
    if (question.dir === `to_eng`) {
        const ok = glossSet(t).has(canonical(answer));
        return { answered, correct: ok, score: ok ? 1 : 0 };
    }
    // to_haw: strict, plus any set word whose gloss set overlaps the target's
    const tGloss = glossSet(t);
    const accepted = [t];
    for (const w of uniqueWords(setWords)) if (w !== t && overlaps(glossSet(w), tGloss)) accepted.push(w);
    const input = canonical(answer);
    const ok = accepted.some(w => canonical(w.hawaiian) === input);
    const nearMiss = !ok && accepted.some(w => normalize(w.hawaiian) === normalize(answer.trim()));
    return { answered, correct: ok, score: ok ? 1 : 0, nearMiss };
}

// fields match the backend QuizResultIn (quiz_id, visitor_id, set_key, local_date are added by the caller)
export function scoreQuiz(questions, answers, setWords) {
    const out = {
        question_count: questions.length, score: 0,
        writing_total: 0, writing_correct: 0, mc_total: 0, mc_correct: 0,
        connect_total: 0, connect_score: 0, unanswered: 0
    };
    questions.forEach((q, i) => {
        const g = gradeQuestion(q, answers ? answers[i] : undefined, setWords);
        if (!g.answered) out.unanswered++;
        if (q.type === `writing`) { out.writing_total++; out.writing_correct += g.correct ? 1 : 0; }
        else if (q.type === `mc`) { out.mc_total++; out.mc_correct += g.correct ? 1 : 0; }
        else { out.connect_total++; out.connect_score += g.score; }
    });
    out.score = out.writing_correct + out.mc_correct + out.connect_score;
    return out;
}

// ---------- logging ----------

// One entry per word attempt for study-log: writing/MC per answered question, connect per pair of an
// answered question (keyed by the Hawaiian word). Unanswered questions are not logged.
export function attemptEventsFor(questions, answers, setWords) {
    const events = [];
    const seen = new Set();
    const push = (word, correct, variant) => {
        const key = canonical(word.hawaiian);
        events.push({ word_hawaiian: word.hawaiian, outcome: correct ? `correct` : `incorrect`, is_retry: seen.has(key), variant });
        seen.add(key);
    };
    questions.forEach((q, i) => {
        const answer = answers ? answers[i] : undefined;
        const g = gradeQuestion(q, answer, setWords);
        if (!g.answered) return;
        if (q.type === `connect`) q.pairs.forEach((w, j) => push(w, g.pairs[j], q.variant));
        else push(q.word, g.correct, q.variant);
    });
    return events;
}
