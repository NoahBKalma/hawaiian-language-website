// Crossword generator (pure, no DOM). Used by scripts/crossword.js; tested in scripts/tests/crossword-gen.test.mjs.
//
// Answers keep full Hawaiian fidelity: the ʻokina is its own cell, kahakō vowels are single (NFC) cells,
// spaces and hyphens are dropped. generate() returns { rows, cols, grid, words } or null when the pool
// cannot reach the size's minimum word count.

export const SIZES = {
    tiny: { words: 5, min: 4, dim: 7, maxLen: 7 },
    mini: { words: 7, min: 6, dim: 9, maxLen: 9 },
    standard: { words: 12, min: 10, dim: 13, maxLen: 12 },
};

const MIN_LEN = 3;
const OKINA = `ʻ`;
const BOARD = 41; // working board; the result is cropped to the bounding box

// "ʻAʻā Nui" -> ["ʻ","a","ʻ","ā","n","u","i"]
export function answerCells(hawaiian) {
    const text = String(hawaiian ?? ``)
        .normalize(`NFC`)
        .toLowerCase()
        .replace(/[‘’ʼ'`]/g, OKINA)
        .replace(/[\s\-–—]+/g, ``);
    return [...text];
}

export const isAllowedCell =(c) => /^[aeiouāēīōūhklmnpwʻ]$/.test(c);

// Eligible answers: 3..maxLen cells, only Hawaiian letters, unique answer and unique clue.
export function buildPool(entries, size) {
    const { maxLen } = SIZES[size];
    const seenAnswer = new Set();
    const seenClue = new Set();
    const pool = [];
    for (const entry of entries) {
        const cells = answerCells(entry.hawaiian);
        if (cells.length < MIN_LEN || cells.length > maxLen) continue;
        if (!cells.every(isAllowedCell)) continue;
        const clue = String(entry.english ?? ``).trim();
        if (clue === ``) continue;
        const answer = cells.join(``);
        const clueKey = clue.toLowerCase();
        if (seenAnswer.has(answer) || seenClue.has(clueKey)) continue;
        seenAnswer.add(answer);
        seenClue.add(clueKey);
        pool.push({ cells, clue, hawaiian: String(entry.hawaiian).normalize(`NFC`).trim() });
    }
    return pool;
}

function shuffled(list, rng) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const key = (r, c) => r * BOARD + c;

function makeBoard() {
    return { cells: new Map(), words: [], minR: BOARD, maxR: -1, minC: BOARD, maxC: -1 };
}

// can `cells` be placed starting at (r,c) in direction dir ("across"/"down") without breaking crossword rules?
// returns the number of crossings, or -1 when illegal
function fit(board, cells, r, c, dir, limit) {
    const dr = dir === `down` ? 1 : 0;
    const dc = dir === `across` ? 1 : 0;
    const endR = r + dr * (cells.length - 1);
    const endC = c + dc * (cells.length - 1);
    if (r < 0 || c < 0 || endR >= BOARD || endC >= BOARD) return -1;
    const minR = Math.min(board.minR, r), maxR = Math.max(board.maxR, endR);
    const minC = Math.min(board.minC, c), maxC = Math.max(board.maxC, endC);
    if (maxR - minR + 1 > limit || maxC - minC + 1 > limit) return -1;

    // cells directly before and after the word must be empty
    if (board.cells.has(key(r - dr, c - dc)) || board.cells.has(key(endR + dr, endC + dc))) return -1;

    let crossings = 0;
    for (let i = 0; i < cells.length; i++) {
        const rr = r + dr * i, cc = c + dc * i;
        const existing = board.cells.get(key(rr, cc));
        if (existing !== undefined) {
            if (existing !== cells[i]) return -1;
            crossings++;
            continue;
        }
        // a new cell must not touch a neighbour sideways (that would create an accidental word)
        if (board.cells.has(key(rr + dc, cc + dr)) || board.cells.has(key(rr - dc, cc - dr))) return -1;
    }
    // a word that only overlaps existing cells (no new cells) would duplicate one
    return crossings === cells.length ? -1 : crossings;
}

function place(board, word, r, c, dir) {
    const dr = dir === `down` ? 1 : 0;
    const dc = dir === `across` ? 1 : 0;
    for (let i = 0; i < word.cells.length; i++) board.cells.set(key(r + dr * i, c + dc * i), word.cells[i]);
    const endR = r + dr * (word.cells.length - 1), endC = c + dc * (word.cells.length - 1);
    board.minR = Math.min(board.minR, r); board.maxR = Math.max(board.maxR, endR);
    board.minC = Math.min(board.minC, c); board.maxC = Math.max(board.maxC, endC);
    board.words.push({ ...word, row: r, col: c, dir });
}

function attempt(pool, target, limit, rng) {
    const order = shuffled(pool, rng).sort((a, b) => b.cells.length - a.cells.length + (rng() - 0.5) * 3);
    const board = makeBoard();
    const first = order[0];
    const mid = Math.floor(BOARD / 2);
    place(board, first, mid, mid - Math.floor(first.cells.length / 2), `across`);
    const used = new Set([first]);

    for (let pass = 0; pass < 3 && board.words.length < target; pass++) {
        for (const word of order) {
            if (board.words.length >= target) break;
            if (used.has(word)) continue;
            let best = null;
            for (const placed of board.words) {
                const dir = placed.dir === `across` ? `down` : `across`;
                for (let i = 0; i < placed.cells.length; i++) {
                    for (let j = 0; j < word.cells.length; j++) {
                        if (placed.cells[i] !== word.cells[j]) continue;
                        const r = placed.dir === `across` ? placed.row - j : placed.row + i;
                        const c = placed.dir === `across` ? placed.col + i : placed.col - j;
                        const crossings = fit(board, word.cells, r, c, dir, limit);
                        if (crossings < 1) continue;
                        const score = crossings + rng() * 0.5;
                        if (best === null || score > best.score) best = { score, r, c, dir };
                    }
                }
            }
            if (best) { place(board, word, best.r, best.c, best.dir); used.add(word); }
        }
    }
    return board;
}

// Crop to the bounding box, number the starts, and return the final puzzle.
function finish(board) {
    const rows = board.maxR - board.minR + 1;
    const cols = board.maxC - board.minC + 1;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (const [k, letter] of board.cells) {
        grid[Math.floor(k / BOARD) - board.minR][(k % BOARD) - board.minC] = letter;
    }
    const words = board.words.map(w => ({ ...w, row: w.row - board.minR, col: w.col - board.minC }));

    const starts = new Map(); // "r,c" -> number
    const sorted = [...words].sort((a, b) => a.row - b.row || a.col - b.col);
    let n = 0;
    for (const w of sorted) {
        const k = `${w.row},${w.col}`;
        if (!starts.has(k)) starts.set(k, ++n);
        w.num = starts.get(k);
    }
    words.sort((a, b) => a.num - b.num || (a.dir === `across` ? -1 : 1));
    return { rows, cols, grid, words };
}

// pool: result of buildPool(); size: tiny|mini|standard; rng: () => [0,1)
export function generate(pool, size, rng = Math.random) {
    const spec = SIZES[size];
    if (!spec || pool.length < spec.min) return null;
    let best = null;
    for (let i = 0; i < 80; i++) {
        const board = attempt(pool, spec.words, spec.dim, rng);
        if (best === null || board.words.length > best.words.length) best = board;
        if (best.words.length >= spec.words) break;
    }
    if (best.words.length < spec.min) return null;
    return finish(best);
}

// seeded rng for tests
export function seededRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Validate a finished puzzle (used by tests): every word matches the grid, no stray words, no duplicates.
export function validate(puzzle) {
    const problems = [];
    const { grid, words, rows, cols } = puzzle;
    const covered = new Set();
    const seen = new Set();
    for (const w of words) {
        const answer = w.cells.join(``);
        if (seen.has(answer)) problems.push(`duplicate answer ${answer}`);
        seen.add(answer);
        for (let i = 0; i < w.cells.length; i++) {
            const r = w.row + (w.dir === `down` ? i : 0);
            const c = w.col + (w.dir === `across` ? i : 0);
            if (grid[r]?.[c] !== w.cells[i]) problems.push(`${answer} mismatch at ${r},${c}`);
            covered.add(`${r},${c}`);
        }
    }
    // every run of 2+ filled cells must be a placed word
    const runs = (get, n, m, dir) => {
        for (let a = 0; a < n; a++) {
            let b = 0;
            while (b < m) {
                if (get(a, b) === null) { b++; continue; }
                let e = b;
                while (e < m && get(a, e) !== null) e++;
                if (e - b >= 2) {
                    const text = Array.from({ length: e - b }, (_, k) => get(a, b + k)).join(``);
                    const ok = words.some(w => w.dir === dir && w.cells.join(``) === text
                        && (dir === `across` ? w.row === a && w.col === b : w.col === a && w.row === b));
                    if (!ok) problems.push(`stray ${dir} run "${text}"`);
                }
                b = e;
            }
        }
    };
    runs((r, c) => grid[r][c], rows, cols, `across`);
    runs((c, r) => grid[r][c], cols, rows, `down`);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null && !covered.has(`${r},${c}`)) problems.push(`orphan cell ${r},${c}`);
    }
    return problems;
}
