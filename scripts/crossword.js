// Mini Crossword page: size -> sets -> play. Generation lives in /scripts/crossword-gen.js.
import { setsById } from "/scripts/compile-words.js";
import { t, getLang, onLangChange } from "/scripts/i18n.js";
import { setDisplayName, POS_LABELS } from "/scripts/vocab-shared.js";
import { buildPool, generate, isAllowedCell, seededRng, hashSeed } from "/scripts/crossword-gen.js";

const $ = (id) => document.getElementById(id);
const OKINA = `ʻ`;
const SPECIAL_KEYS = [OKINA, `ā`, `ē`, `ī`, `ō`, `ū`];

const state = {
    size: null,
    selected: new Set(),
    config: null,          // { size, ids: string[] | null (all) } of the current puzzle, for "play again"
    puzzle: null,
    user: [],
    wrong: new Set(),
    revealed: new Set(),
    cellWords: [],
    sel: { r: 0, c: 0, dir: `across` },
    seconds: 0,
    timer: null,
    solved: false,
    composing: false,
};

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/* ---------- steps ---------- */

const STEPS = [`size`, `sets`, `play`];

function showStep(name) {
    for (const panel of document.querySelectorAll(`[data-panel]`)) panel.hidden = panel.dataset.panel !== name;
    const at = STEPS.indexOf(name);
    document.querySelectorAll(`#cw-steps li`).forEach((li, i) => {
        li.classList.toggle(`is-current`, i === at);
        li.classList.toggle(`is-done`, i < at);
        if (i === at) li.setAttribute(`aria-current`, `step`); else li.removeAttribute(`aria-current`);
    });
    $(`cw-error`).hidden = true;
    $(`cw-confirm`).hidden = true;
    if (name !== `play`) stopTimer();
    if (name === `sets`) $(`cw-small`).hidden = true;
}

/* ---------- step 1: size ---------- */

document.querySelectorAll(`.cw-size-card`).forEach(button => {
    button.addEventListener(`click`, () => {
        state.size = button.dataset.size;
        showStep(`sets`);
        $(`cw-search`).focus({ preventScroll: true });
    });
});

/* ---------- step 2: sets ---------- */

// short phrases are not used in crosswords
const usableSets = () => [...setsById.values()].filter(set => set.part_of_speech !== `short_phrases`);

// all six pronoun sets (personal + possessive) are offered as one choice
const isPronounSet = (set) => /^(Personal|Possessive)-Pronouns\//.test(set.id);
const PRONOUN_GROUP = `group:pronouns`;

const nameCounts = { en: new Map(), haw: new Map() };
for (const set of usableSets().filter(set => !isPronounSet(set))) {
    for (const lang of [`en`, `haw`]) {
        const name = setDisplayName(set, lang);
        nameCounts[lang].set(name, (nameCounts[lang].get(name) ?? 0) + 1);
    }
}

const pickerSets = (() => {
    const entries = [];
    const pronouns = [];
    for (const set of usableSets()) {
        if (isPronounSet(set)) { pronouns.push(set); continue; }
        entries.push({
            id: set.id,
            sets: [set],
            label: (lang) => {
                const name = setDisplayName(set, lang);
                // same name in more than one set (e.g. Colors): add the word type, "Colors (Adjectives)"
                return (nameCounts[lang].get(name) ?? 0) > 1 ? `${name} (${POS_LABELS[set.part_of_speech]?.[lang] ?? set.part_of_speech})` : name;
            },
            search: `${set.category_english} ${set.category_hawaiian} ${set.in_category_english} ${set.in_category_hawaiian}`.toLowerCase(),
        });
    }
    if (pronouns.length) {
        // keep the group where the first pronoun set was
        const at = Math.max(0, usableSets().findIndex(isPronounSet));
        entries.splice(at, 0, {
            id: PRONOUN_GROUP,
            sets: pronouns,
            label: () => t(`cw.sets.pronouns`),
            search: `pronouns ${pronouns.map(set => `${set.category_english} ${set.category_hawaiian} ${set.in_category_english}`).join(` `)}`.toLowerCase(),
        });
    }
    return entries;
})();
const entryById = new Map(pickerSets.map(entry => [entry.id, entry]));

function buildSetList() {
    const lang = getLang();
    const list = $(`cw-set-list`);
    list.textContent = ``;
    for (const entry of pickerSets) {
        const li = el(`li`);
        const button = el(`button`, `cw-set`);
        button.type = `button`;
        button.dataset.setId = entry.id;
        button.setAttribute(`aria-pressed`, String(state.selected.has(entry.id)));
        const name = el(`span`, `cw-set-name`, entry.label(lang));
        if (lang === `haw`) name.lang = `haw`;
        const total = entry.sets.reduce((sum, set) => sum + set.words.length, 0);
        const meta = el(`span`, `cw-set-meta`, t(total === 1 ? `quiz.set.wordOne` : `quiz.set.wordOther`, { n: total }));
        button.append(name, meta);
        li.append(button);
        entry.node = li;
        list.append(li);
    }
    applyFilter();
    $(`cw-loading`).hidden = true;
}

function applyFilter() {
    const term = $(`cw-search`).value.trim().toLowerCase();
    for (const entry of pickerSets) entry.node.hidden = term !== `` && !entry.search.includes(term);
}

function updateCount() {
    const n = state.selected.size;
    $(`cw-count`).textContent = n === 0 ? t(`cw.sets.selectedNone`) : t(n === 1 ? `cw.sets.selectedOne` : `cw.sets.selectedOther`, { n });
    $(`cw-start`).disabled = n === 0;
}

$(`cw-set-list`).addEventListener(`click`, (e) => {
    const button = e.target.closest(`.cw-set`);
    if (!button) return;
    const id = button.dataset.setId;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    button.setAttribute(`aria-pressed`, String(state.selected.has(id)));
    $(`cw-small`).hidden = true;
    updateCount();
});
$(`cw-search`).addEventListener(`input`, applyFilter);
$(`cw-clear`).addEventListener(`click`, () => {
    state.selected.clear();
    document.querySelectorAll(`.cw-set`).forEach(b => b.setAttribute(`aria-pressed`, `false`));
    $(`cw-small`).hidden = true;
    updateCount();
});
$(`cw-sets-back`).addEventListener(`click`, () => showStep(`size`));
$(`cw-use-all`).addEventListener(`click`, () => start(null));
$(`cw-small-all`).addEventListener(`click`, () => start(null));
$(`cw-small-keep`).addEventListener(`click`, () => { $(`cw-small`).hidden = true; $(`cw-search`).focus({ preventScroll: true }); });
$(`cw-start`).addEventListener(`click`, () => start([...state.selected]));

/* ---------- starting a puzzle ---------- */

function start(ids) {
    const size = state.size;
    const sets = ids === null ? usableSets() : ids.flatMap(id => entryById.get(id)?.sets ?? []);
    const pool = buildPool(sets.flatMap(set => set.words), size);
    const puzzle = generate(pool, size);
    if (!puzzle) {
        if (ids !== null) {
            $(`cw-small-text`).textContent = t(`cw.small.text`, { size: t(`cw.size.${size}`) });
            $(`cw-small`).hidden = false;
            $(`cw-small-all`).focus();
        } else {
            showStep(`sets`);
            $(`cw-error`).hidden = false;
        }
        return;
    }
    state.config = { size, ids };
    beginPlay(puzzle);
}

/* ---------- daily puzzle (?daily) ---------- */

// Same Mini puzzle for everyone on a given date, built from every set; nothing is saved.
// The seed is the visitor's local date, so the puzzle changes at their midnight. Sets are sorted by id
// so the word pool is the same whatever order the sets loaded in.
function startDaily() {
    document.body.classList.add(`cw-daily`);
    const date = new Date().toLocaleDateString(`en-CA`);
    const sets = usableSets().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const pool = buildPool(sets.flatMap(set => set.words), `mini`);
    const puzzle = generate(pool, `mini`, seededRng(hashSeed(`crossword-daily:${date}`)));
    if (!puzzle) {
        $(`cw-error`).hidden = false;
        return;
    }
    state.size = `mini`;
    state.config = null;
    beginPlay(puzzle);
}

/* ---------- step 3: play ---------- */

function beginPlay(puzzle) {
    state.puzzle = puzzle;
    state.user = puzzle.grid.map(row => row.map(() => ``));
    state.wrong = new Set();
    state.revealed = new Set();
    state.solved = false;
    state.cellWords = puzzle.grid.map(row => row.map(() => ({})));
    puzzle.words.forEach((word, index) => {
        wordCells(word).forEach(([r, c]) => { state.cellWords[r][c][word.dir] = index; });
    });
    const first = puzzle.words[0];
    state.sel = { r: first.row, c: first.col, dir: first.dir };

    $(`cw-done`).hidden = true;
    $(`cw-feedback`).textContent = ``;
    buildGrid();
    buildClues();
    showStep(`play`);
    render();
    startTimer();
    $(`cw-input`).focus({ preventScroll: true });
}

const wordCells = (word) => word.cells.map((_, i) => [word.row + (word.dir === `down` ? i : 0), word.col + (word.dir === `across` ? i : 0)]);

function buildGrid() {
    const { grid, rows, cols, words } = state.puzzle;
    const gridEl = $(`cw-grid`);
    gridEl.style.setProperty(`--cw-cols`, cols);
    gridEl.textContent = ``;
    const numbers = new Map(words.map(w => [`${w.row},${w.col}`, w.num]));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === null) {
                const block = el(`div`, `cw-block`);
                block.setAttribute(`aria-hidden`, `true`);
                gridEl.append(block);
                continue;
            }
            const cell = el(`div`, `cw-cell`);
            cell.setAttribute(`role`, `gridcell`);
            cell.dataset.r = r;
            cell.dataset.c = c;
            const num = numbers.get(`${r},${c}`);
            if (num) cell.append(el(`span`, `cw-num`, String(num)));
            cell.append(el(`span`, `cw-letter`));
            gridEl.append(cell);
        }
    }
}

function buildClues() {
    for (const dir of [`across`, `down`]) {
        const list = $(`cw-${dir}`);
        list.textContent = ``;
        state.puzzle.words.forEach((word, index) => {
            if (word.dir !== dir) return;
            const li = el(`li`);
            const button = el(`button`, `cw-clue`);
            button.type = `button`;
            button.dataset.index = index;
            button.append(el(`span`, `cw-clue-num`, String(word.num)), el(`span`, `cw-clue-text`, word.clue));
            li.append(button);
            list.append(li);
        });
    }
}

const activeWord = () => {
    const index = state.cellWords[state.sel.r][state.sel.c][state.sel.dir];
    return index === undefined ? null : state.puzzle.words[index];
};

const dirName = (dir) => t(dir === `across` ? `cw.play.across` : `cw.play.down`);

function render() {
    const word = activeWord();
    const inWord = new Set(word ? wordCells(word).map(([r, c]) => `${r},${c}`) : []);
    document.querySelectorAll(`.cw-cell`).forEach(cell => {
        const r = +cell.dataset.r, c = +cell.dataset.c, k = `${r},${c}`;
        const letter = state.user[r][c];
        cell.querySelector(`.cw-letter`).textContent = letter;
        cell.classList.toggle(`is-active`, r === state.sel.r && c === state.sel.c);
        cell.classList.toggle(`is-word`, inWord.has(k));
        cell.classList.toggle(`is-wrong`, state.wrong.has(k));
        cell.classList.toggle(`is-revealed`, state.revealed.has(k));
        cell.setAttribute(`aria-label`, t(`cw.play.cell`, { r: r + 1, c: c + 1 }) + (letter ? `: ${letter}` : ``));
        cell.setAttribute(`aria-selected`, String(r === state.sel.r && c === state.sel.c));
    });
    document.querySelectorAll(`.cw-clue`).forEach(button => {
        const index = +button.dataset.index;
        button.classList.toggle(`is-active`, word === state.puzzle.words[index]);
        button.classList.toggle(`is-solved`, isSolvedWord(state.puzzle.words[index]));
    });
    $(`cw-active`).textContent = word ? t(`cw.play.activeClue`, { num: word.num, dir: dirName(word.dir), clue: word.clue }) : ``;
}

const isSolvedWord = (word) => wordCells(word).every(([r, c], i) => state.user[r][c] === word.cells[i]);

function select(r, c, dir = state.sel.dir) {
    const here = state.cellWords[r]?.[c];
    if (!here) return;
    const other = dir === `across` ? `down` : `across`;
    state.sel = { r, c, dir: here[dir] !== undefined ? dir : other };
    render();
    scrollCellIntoView();
}

function scrollCellIntoView() {
    const cell = document.querySelector(`.cw-cell.is-active`);
    const wrap = $(`cw-grid`).parentElement;
    if (!cell || wrap.scrollWidth <= wrap.clientWidth) return;
    const left = cell.offsetLeft, right = left + cell.offsetWidth;
    if (left < wrap.scrollLeft) wrap.scrollLeft = left - 8;
    else if (right > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = right - wrap.clientWidth + 8;
}

function toggleDirection() {
    const dir = state.sel.dir === `across` ? `down` : `across`;
    select(state.sel.r, state.sel.c, dir);
}

$(`cw-grid`).addEventListener(`click`, (e) => {
    const cell = e.target.closest(`.cw-cell`);
    if (!cell) return;
    const r = +cell.dataset.r, c = +cell.dataset.c;
    if (r === state.sel.r && c === state.sel.c) toggleDirection(); else select(r, c);
    $(`cw-input`).focus({ preventScroll: true });
});

for (const dir of [`across`, `down`]) {
    $(`cw-${dir}`).addEventListener(`click`, (e) => {
        const button = e.target.closest(`.cw-clue`);
        if (!button) return;
        const word = state.puzzle.words[+button.dataset.index];
        select(word.row, word.col, word.dir);
        $(`cw-input`).focus({ preventScroll: true });
    });
}

/* ---------- entering letters ---------- */

function normalizeTyped(ch) {
    const c = ch.normalize(`NFC`).replace(/[‘’ʼ'`]/g, OKINA).toLowerCase();
    return isAllowedCell(c) ? c : null;
}

function putLetter(letter) {
    const { r, c } = state.sel;
    state.user[r][c] = letter;
    state.wrong.delete(`${r},${c}`);
    state.revealed.delete(`${r},${c}`);
    const word = activeWord();
    if (word) {
        const cells = wordCells(word);
        const at = cells.findIndex(([rr, cc]) => rr === r && cc === c);
        if (at >= 0 && at < cells.length - 1) { const [nr, nc] = cells[at + 1]; state.sel = { ...state.sel, r: nr, c: nc }; }
    }
    afterChange();
}

function backspace() {
    const { r, c } = state.sel;
    if (state.user[r][c] !== ``) {
        state.user[r][c] = ``;
        state.wrong.delete(`${r},${c}`);
        state.revealed.delete(`${r},${c}`);
    } else {
        const word = activeWord();
        if (word) {
            const cells = wordCells(word);
            const at = cells.findIndex(([rr, cc]) => rr === r && cc === c);
            if (at > 0) {
                const [pr, pc] = cells[at - 1];
                state.sel = { ...state.sel, r: pr, c: pc };
                state.user[pr][pc] = ``;
                state.wrong.delete(`${pr},${pc}`);
                state.revealed.delete(`${pr},${pc}`);
            }
        }
    }
    afterChange();
}

function afterChange() {
    $(`cw-feedback`).textContent = ``;
    render();
    scrollCellIntoView();
    checkSolved();
}

function moveBy(dr, dc) {
    const { grid, rows, cols } = state.puzzle;
    let r = state.sel.r + dr, c = state.sel.c + dc;
    while (r >= 0 && c >= 0 && r < rows && c < cols) {
        if (grid[r][c] !== null) { select(r, c, dr !== 0 ? `down` : `across`); return; }
        r += dr; c += dc;
    }
}

const input = $(`cw-input`);

function takeTyped() {
    for (const ch of [...input.value.normalize(`NFC`)]) {
        const letter = normalizeTyped(ch);
        if (letter) putLetter(letter);
    }
    input.value = ``;
}

input.addEventListener(`compositionstart`, () => { state.composing = true; });
input.addEventListener(`compositionend`, () => { state.composing = false; takeTyped(); });
input.addEventListener(`input`, () => { if (!state.composing) takeTyped(); });
input.addEventListener(`keydown`, (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const handled = {
        ArrowLeft: () => moveBy(0, -1),
        ArrowRight: () => moveBy(0, 1),
        ArrowUp: () => moveBy(-1, 0),
        ArrowDown: () => moveBy(1, 0),
        Backspace: backspace,
        Delete: backspace,
        Enter: toggleDirection,
        " ": toggleDirection,
    }[e.key];
    if (!handled) return;
    e.preventDefault();
    handled();
});

// special-letter keys (mousedown is cancelled so the text input keeps focus and the phone keyboard stays up)
const keys = $(`cw-keys`);
for (const ch of SPECIAL_KEYS) {
    const button = el(`button`, `cw-key`, ch);
    button.type = `button`;
    button.lang = `haw`;
    button.dataset.letter = ch;
    keys.append(button);
}
const del = el(`button`, `cw-key cw-key--wide`);
del.type = `button`;
del.dataset.i18n = `cw.play.delete`;
del.textContent = t(`cw.play.delete`);
del.dataset.action = `delete`;
keys.append(del);
keys.addEventListener(`mousedown`, (e) => e.preventDefault());
keys.addEventListener(`click`, (e) => {
    const button = e.target.closest(`.cw-key`);
    if (!button) return;
    if (button.dataset.action === `delete`) backspace(); else putLetter(button.dataset.letter);
    input.focus({ preventScroll: true });
});

/* ---------- check / reveal / finish ---------- */

$(`cw-check`).addEventListener(`click`, () => {
    const { grid } = state.puzzle;
    state.wrong = new Set();
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] !== null && state.user[r][c] !== `` && state.user[r][c] !== grid[r][c]) state.wrong.add(`${r},${c}`);
        }
    }
    const n = state.wrong.size;
    $(`cw-feedback`).textContent = n === 0 ? t(`cw.play.allGood`) : t(n === 1 ? `cw.play.wrongOne` : `cw.play.wrongOther`, { n });
    render();
    input.focus({ preventScroll: true });
});

function reveal(cells) {
    for (const [r, c] of cells) {
        if (state.user[r][c] !== state.puzzle.grid[r][c]) state.revealed.add(`${r},${c}`);
        state.user[r][c] = state.puzzle.grid[r][c];
        state.wrong.delete(`${r},${c}`);
    }
    afterChange();
    input.focus({ preventScroll: true });
}
$(`cw-reveal-letter`).addEventListener(`click`, () => reveal([[state.sel.r, state.sel.c]]));
$(`cw-reveal-word`).addEventListener(`click`, () => { const word = activeWord(); if (word) reveal(wordCells(word)); });
// "New puzzle" throws away the grid, so ask first once there is something to lose
const hasProgress = () => !state.solved && state.user.some(row => row.some(letter => letter !== ``));
const confirmBar = $(`cw-confirm`);
let confirmAction = null;
const setKey = (node, key) => { node.dataset.i18n = key; node.textContent = t(key); }; // data-i18n so a language switch keeps it right
function askConfirm(textKey, yesKey, action) {
    confirmAction = action;
    setKey($(`cw-confirm-text`), textKey);
    setKey($(`cw-confirm-yes`), yesKey);
    confirmBar.hidden = false;
    $(`cw-confirm-yes`).focus();
}
$(`cw-new`).addEventListener(`click`, () => {
    if (!hasProgress()) return replay();
    askConfirm(`cw.new.confirm`, `cw.new.yes`, replay);
});
$(`cw-confirm-yes`).addEventListener(`click`, () => {
    confirmBar.hidden = true;
    const action = confirmAction;
    confirmAction = null;
    action?.();
});

// Daily puzzle only: no reveals, so the way out is to give up, which shows the answers and ends the puzzle
$(`cw-give-up`).addEventListener(`click`, () => {
    if (state.solved) return;
    askConfirm(`cw.giveUp.confirm`, `cw.giveUp.yes`, giveUp);
});
function giveUp() {
    const { grid } = state.puzzle;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] === null) continue;
            if (state.user[r][c] !== grid[r][c]) state.revealed.add(`${r},${c}`);
            state.user[r][c] = grid[r][c];
        }
    }
    state.wrong = new Set();
    state.solved = true;
    stopTimer();
    render();
    showDone(true);
}
function keepPlaying() { confirmBar.hidden = true; input.focus({ preventScroll: true }); }
$(`cw-confirm-no`).addEventListener(`click`, keepPlaying);
confirmBar.addEventListener(`keydown`, (e) => { if (e.key === `Escape`) keepPlaying(); });
$(`cw-again`).addEventListener(`click`, () => replay());
$(`cw-change`).addEventListener(`click`, () => showStep(`sets`));

function replay() {
    if (!state.config) return showStep(`size`);
    state.size = state.config.size;
    start(state.config.ids);
}

function checkSolved() {
    if (state.solved) return;
    const { grid } = state.puzzle;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] !== null && state.user[r][c] !== grid[r][c]) return;
        }
    }
    state.solved = true;
    stopTimer();
    showDone(false);
}

function showDone(gaveUp) {
    setKey($(`cw-done-title`), gaveUp ? `cw.done.gaveUp` : `cw.done.title`);
    $(`cw-done-time`).textContent = gaveUp ? `` : t(`cw.done.time`, { time: formatTime(state.seconds) });
    const list = $(`cw-answers`);
    list.textContent = ``;
    for (const word of state.puzzle.words) {
        const li = el(`li`);
        const strong = el(`strong`, ``, word.hawaiian);
        strong.lang = `haw`;
        li.append(strong, document.createTextNode(` · ${word.clue}`));
        list.append(li);
    }
    $(`cw-done`).hidden = false;
    $(`cw-done`).focus();
}

/* ---------- timer ---------- */

const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, `0`)}`;

function runTimer() {
    state.timer = setInterval(() => {
        state.seconds++;
        $(`cw-time`).textContent = formatTime(state.seconds);
    }, 1000);
}
function startTimer() {
    stopTimer();
    state.seconds = 0;
    $(`cw-time`).textContent = formatTime(0);
    runTimer();
}
// time spent in another tab doesn't count: stop when hidden, carry on from the same second when back
document.addEventListener(`visibilitychange`, () => {
    if (document.hidden) stopTimer();
    else if (state.puzzle && !state.solved && !$(`cw-play`).hidden && !state.timer) runTimer();
});
function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
}

/* ---------- boot ---------- */

buildSetList();
updateCount();
showStep(`size`);
if (new URLSearchParams(window.location.search).has(`daily`)) startDaily();
onLangChange(() => {
    buildSetList();
    updateCount();
    del.textContent = t(`cw.play.delete`);
    if (state.puzzle && !$(`cw-play`).hidden) render();
});
