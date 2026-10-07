import { setsById, allWordEntries } from "/scripts/compile-words.js";
import { canQuiz, quizQuestionCount, buildQuiz, scoreQuiz, gradeQuestion, attemptEventsFor, isAnswered } from "/scripts/quiz-engine.js";
import { initStudyLog, logSetOpened, logAttempt, logSetCompleted, flush, getVisitorId, uuidv4 } from "/scripts/study-log.js";
import { localDate } from "/scripts/progress.js";
import { showAchievementToasts } from "/components/achievement-toast.js";
import { API_BASE_URL } from "/scripts/config.js";
import { getToken, isLoggedIn } from "/scripts/auth.js";
import { markApiDown, markApiUp } from "/scripts/api-status.js";
import { prefersReducedMotion } from "/scripts/word-utils.js";
import { getPref, setPref } from "/scripts/prefs.js";

const state = {
    set: null,          // chosen set object (picker selection, then the quiz's set)
    words: [],          // the quiz set's words (with pos for distractor matching)
    questions: [],
    answers: [],
    idx: 0,
    quizId: null,
    submitting: false,
    lastResult: null
};

initStudyLog(`quiz`, () => ({ setKey: state.set ? state.set.id : null }));

const $ = (id) => document.getElementById(id);
const live = $(`quiz-live`);
const stages = { picker: $(`quiz-picker`), player: $(`quiz-player`), review: $(`quiz-review`) };

const SVG_NS = `http://www.w3.org/2000/svg`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const ICON_HALF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>`;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function hawText(text, className) {
    const node = el(`span`, className, text);
    node.lang = `haw`;
    return node;
}

function announce(message) {
    live.textContent = ``;
    // a changed string is what screen readers announce; clear first so repeats are read again
    setTimeout(() => { live.textContent = message; }, 30);
}

function showStage(name) {
    for (const [key, node] of Object.entries(stages)) node.hidden = key !== name;
    window.scrollTo(0, 0);
}

function fmt(n) { return String(Math.round(n * 10) / 10); }

/* ==========================================================================
   Picker
   ========================================================================== */

const grid = $(`set-grid`);
const searchInput = $(`set-search`);
const beginButton = $(`begin-button`);
const beginSummary = $(`begin-summary`);
const pickerCount = $(`picker-count`);

const posLabel = (pos) => String(pos ?? ``).replace(/_/g, ` `);
const quizSizeFor = (set) => quizQuestionCount(set.words);

const pickerSets = [...setsById.values()]
    .map(set => ({ set, playable: canQuiz(withPos(set)), search: `${set.category_english} ${set.category_hawaiian} ${set.in_category_english} ${set.in_category_hawaiian} ${posLabel(set.part_of_speech)}`.toLowerCase() }));

function withPos(set) {
    return set.words.map(w => ({ ...w, pos: set.part_of_speech }));
}

function buildPicker() {
    grid.textContent = ``;
    for (const entry of pickerSets) {
        const { set, playable } = entry;
        const li = el(`li`, `set-item`);
        const button = el(`button`, `set-card`);
        button.type = `button`;
        button.dataset.setId = set.id;
        button.setAttribute(`aria-pressed`, `false`);
        if (!playable) { button.classList.add(`is-disabled`); button.setAttribute(`aria-disabled`, `true`); }

        const name = el(`span`, `set-name`, set.category_english);
        const meta = el(`span`, `set-meta`, [set.in_category_english, posLabel(set.part_of_speech)].filter(Boolean).join(` · `));
        const foot = el(`span`, `set-foot`);
        foot.append(el(`span`, `tag`, `${set.words.length} ${set.words.length === 1 ? `word` : `words`}`));
        if (!playable) foot.append(el(`span`, `tag tag-sun`, `Too small to quiz`));
        button.append(name, meta, foot);
        li.append(button);
        entry.node = li;
        entry.button = button;
        grid.append(li);
    }
}

function applyFilter() {
    const term = searchInput.value.trim().toLowerCase();
    let shown = 0;
    for (const entry of pickerSets) {
        const match = term === `` || entry.search.includes(term);
        entry.node.hidden = !match;
        if (match) shown++;
    }
    pickerCount.textContent = `${shown} ${shown === 1 ? `set` : `sets`}`;
}

function selectSet(id) {
    const entry = pickerSets.find(e => e.set.id === id);
    if (!entry || !entry.playable) return;
    state.set = entry.set;
    for (const e of pickerSets) e.button.setAttribute(`aria-pressed`, String(e === entry));
    beginButton.disabled = false;
    beginSummary.textContent = `${entry.set.category_english} · ${entry.set.words.length} words · ${quizSizeFor(entry.set)} questions`;
}

grid.addEventListener(`click`, (e) => {
    const button = e.target.closest(`.set-card`);
    if (!button) return;
    if (button.getAttribute(`aria-disabled`) === `true`) { announce(`That set is too small to quiz.`); return; }
    selectSet(button.dataset.setId);
});
searchInput.addEventListener(`input`, applyFilter);
beginButton.addEventListener(`click`, () => startQuiz());

/* ==========================================================================
   Quiz lifecycle
   ========================================================================== */

function startQuiz() {
    if (!state.set) return;
    state.words = withPos(state.set);
    const built = buildQuiz(state.words, { bank: allWordEntries });
    if (built.error) { announce(`That set is too small to quiz.`); return; }

    state.questions = built.questions;
    state.answers = built.questions.map(q => (q.type === `connect` ? {} : undefined));
    state.idx = 0;
    state.quizId = uuidv4();
    state.submitting = false;
    state.lastResult = null;
    setPref(`lastSet:quiz`, { key: state.set.id, name: state.set.category_english });
    logSetOpened();                 // every quiz begin (Begin and Retake) opens a fresh set_started/set_completed pair

    $(`player-title`).textContent = state.set.category_english;
    $(`submit-button`).textContent = `Submit Quiz`;
    showStage(`player`);
    buildDots();
    renderQuestion();
}

$(`retake-button`).addEventListener(`click`, () => startQuiz());
$(`another-button`).addEventListener(`click`, () => {
    teardownConnect();
    showStage(`picker`);
});

/* ---------- Player chrome ---------- */

const card = $(`question-card`);
const dotStrip = $(`dot-strip`);
const prevButton = $(`prev-button`);
const nextButton = $(`next-button`);
const submitButton = $(`submit-button`);
const submitHelp = $(`submit-help`);

function buildDots() {
    dotStrip.textContent = ``;
    state.questions.forEach((_, i) => {
        const li = el(`li`);
        const button = el(`button`, `dot`, String(i + 1));
        button.type = `button`;
        button.addEventListener(`click`, () => goTo(i));
        li.append(button);
        dotStrip.append(li);
    });
}

function answeredCount() {
    return state.questions.filter((q, i) => isAnswered(q, state.answers[i])).length;
}

function updateChrome() {
    const total = state.questions.length;
    $(`player-progress`).textContent = `Question ${state.idx + 1} of ${total} · ${answeredCount()} answered`;
    [...dotStrip.querySelectorAll(`.dot`)].forEach((dot, i) => {
        const answered = isAnswered(state.questions[i], state.answers[i]);
        dot.classList.toggle(`is-answered`, answered);
        if (i === state.idx) dot.setAttribute(`aria-current`, `step`); else dot.removeAttribute(`aria-current`);
        dot.setAttribute(`aria-label`, `Question ${i + 1}, ${answered ? `answered` : `not answered`}`);
    });
    prevButton.disabled = state.idx === 0;
    nextButton.disabled = state.idx === total - 1;
    const none = answeredCount() === 0;
    submitButton.disabled = none || state.submitting;
    submitHelp.hidden = !none;
}

function goTo(i) {
    if (i < 0 || i >= state.questions.length) return;
    state.idx = i;
    renderQuestion();
    announce(`Question ${i + 1} of ${state.questions.length}`);
}
prevButton.addEventListener(`click`, () => goTo(state.idx - 1));
nextButton.addEventListener(`click`, () => goTo(state.idx + 1));

function setAnswer(value) {
    state.answers[state.idx] = value;
    updateChrome();
}

/* ---------- Question rendering ---------- */

const shownLang = (q) => (q.dir === `to_eng` ? `haw` : `en`);   // language of the prompt
const answerLang = (q) => (q.dir === `to_eng` ? `en` : `haw`);  // language of the answer
const wordIn = (w, lang) => (lang === `haw` ? w.hawaiian : w.english);

function langNode(text, lang, className) {
    return lang === `haw` ? hawText(text, className) : el(`span`, className, text);
}

// glosses like "domestic/internal" should wrap after the slash, not mid-word
function glossNode(text, lang) {
    const node = langNode(text, lang);
    if (lang === `haw` || !text.includes(`/`)) return node;
    node.textContent = ``;
    text.split(`/`).forEach((part, i, all) => {
        node.append(part);
        if (i < all.length - 1) node.append(`/`, document.createElement(`wbr`));
    });
    return node;
}

function renderQuestion() {
    teardownConnect();
    const q = state.questions[state.idx];
    card.textContent = ``;
    if (q.type === `writing`) renderWriting(q);
    else if (q.type === `mc`) renderMc(q);
    else renderConnect(q);
    updateChrome();
}

function instruction(q) {
    const toEng = q.dir === `to_eng`;
    if (q.type === `writing`) return toEng ? `Type the English meaning` : `Type the Hawaiian word`;
    if (q.type === `mc`) return toEng ? `Choose the English meaning` : `Choose the Hawaiian word`;
    return toEng ? `Match each Hawaiian word to its English meaning` : `Match each English word to its Hawaiian word`;
}

function questionHead(q) {
    const head = el(`div`, `q-head`);
    const typeLabel = { writing: `Writing`, mc: `Multiple choice`, connect: `Matching` }[q.type];
    head.append(el(`span`, `tag`, typeLabel), el(`h2`, `q-instruction`, instruction(q)));
    return head;
}

function renderWriting(q) {
    card.append(questionHead(q));
    const plank = el(`div`, `q-prompt plank`);
    plank.append(langNode(wordIn(q.word, shownLang(q)), shownLang(q), `q-word`));
    card.append(plank);

    const field = el(`div`, `field`);
    const label = el(`label`, null, `Your answer`);
    label.htmlFor = `answer-input`;
    const input = el(`input`, `input`);
    input.id = `answer-input`;
    input.type = `text`;
    input.autocomplete = `off`;
    input.spellcheck = false;
    input.setAttribute(`autocapitalize`, `off`);
    input.setAttribute(`autocorrect`, `off`);
    if (answerLang(q) === `haw`) input.lang = `haw`;
    input.value = typeof state.answers[state.idx] === `string` ? state.answers[state.idx] : ``;
    input.addEventListener(`input`, () => setAnswer(input.value));
    field.append(label);
    if (answerLang(q) === `haw`) {
        const keyboard = document.createElement(`hawaiian-keyboard`);
        keyboard.append(input);
        field.append(keyboard);
        field.append(el(`p`, `help`, `Use the ā button for kahakō and ʻokina, or type an apostrophe.`));
    } else {
        field.append(input);
    }
    card.append(field);
}

function renderMc(q) {
    card.append(questionHead(q));
    const plank = el(`div`, `q-prompt plank`);
    plank.append(langNode(wordIn(q.word, shownLang(q)), shownLang(q), `q-word`));
    card.append(plank);

    const group = el(`div`, `mc-options`);
    group.setAttribute(`role`, `radiogroup`);
    group.setAttribute(`aria-label`, instruction(q));
    const chosen = state.answers[state.idx];
    const buttons = q.options.map((option, i) => {
        const button = el(`button`, `mc-option`);
        button.type = `button`;
        button.setAttribute(`role`, `radio`);
        button.setAttribute(`aria-checked`, String(chosen === i));
        button.tabIndex = (chosen === i || (chosen === undefined && i === 0)) ? 0 : -1;
        button.append(el(`span`, `mc-key`, String.fromCharCode(65 + i)), langNode(wordIn(option, answerLang(q)), answerLang(q), `mc-text`));
        button.addEventListener(`click`, () => choose(i));
        group.append(button);
        return button;
    });
    function choose(i) {
        buttons.forEach((b, j) => { b.setAttribute(`aria-checked`, String(i === j)); b.tabIndex = i === j ? 0 : -1; });
        setAnswer(i);
    }
    group.addEventListener(`keydown`, (e) => {
        const at = buttons.indexOf(document.activeElement);
        if (at < 0) return;
        let next = null;
        if (e.key === `ArrowDown` || e.key === `ArrowRight`) next = (at + 1) % buttons.length;
        else if (e.key === `ArrowUp` || e.key === `ArrowLeft`) next = (at + buttons.length - 1) % buttons.length;
        if (next === null) return;
        e.preventDefault();
        buttons[next].focus();
        choose(next);
    });
    card.append(group);
}

/* ==========================================================================
   Connect question (drag a line, or tap-tap / keyboard)
   ========================================================================== */

let ctx = null;                         // the live connect board, or null
let justDragged = false;                // swallows the click that follows a drag
let lastTouchAt = 0;                    // ignores emulated mouse events after touch (no-PointerEvent fallback)

function teardownConnect() {
    if (!ctx) return;
    if (ctx.ro) ctx.ro.disconnect();
    removeDragListeners();
    ctx = null;
}

function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
}

function renderConnect(q) {
    card.append(questionHead(q));
    const lang = { left: shownLang(q), right: answerLang(q) };
    const answer = state.answers[state.idx] ?? (state.answers[state.idx] = {});

    const board = el(`div`, `connect-board`);
    const colLeft = el(`div`, `connect-col`);
    const colRight = el(`div`, `connect-col`);
    const svg = svgEl(`svg`, { class: `connect-lines`, "aria-hidden": `true` });
    const leftEls = [];
    const rightEls = [];

    q.pairs.forEach((w, i) => {
        const item = el(`button`, `connect-item`);
        item.type = `button`;
        item.dataset.side = `l`;
        item.dataset.idx = String(i);
        item.append(glossNode(wordIn(w, lang.left), lang.left));
        leftEls.push(item);
        colLeft.append(item);
    });
    q.rightOrder.forEach((pairIdx) => {
        const item = el(`button`, `connect-item`);
        item.type = `button`;
        item.dataset.side = `r`;
        item.dataset.idx = String(pairIdx);
        item.append(glossNode(wordIn(q.pairs[pairIdx], lang.right), lang.right));
        rightEls.push(item);
        colRight.append(item);
    });
    board.append(colLeft, el(`div`, `connect-gap`), colRight, svg);

    const chips = el(`ul`, `connect-chips`);
    chips.setAttribute(`aria-label`, `Your pairs`);
    const hint = el(`p`, `help`, `Drag from a word to its match, or tap one word and then its match. Tap a pair below to remove it.`);

    card.append(board, hint, chips);

    ctx = { q, lang, answer, board, svg, leftEls, rightEls, chips, drag: null, sel: null, ro: null, raf: 0 };

    board.addEventListener(`click`, onBoardClick);
    board.addEventListener(`keydown`, onBoardKey);
    if (window.PointerEvent) board.addEventListener(`pointerdown`, onPointerDown);
    else {
        board.addEventListener(`touchstart`, onTouchStart, { passive: true });
        board.addEventListener(`mousedown`, onMouseDown);
    }
    if (typeof ResizeObserver === `function`) {
        ctx.ro = new ResizeObserver(() => scheduleDraw());
        ctx.ro.observe(board);
    }
    refreshConnect();
    requestAnimationFrame(() => { draw(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (ctx && ctx.board === board) draw(); });
}

function itemText(side, idx) {
    const { q, lang } = ctx;
    return side === `l` ? wordIn(q.pairs[idx], lang.left) : wordIn(q.pairs[idx], lang.right);
}

// reflect answers in item states, chips, and lines
function refreshConnect() {
    const { q, answer, leftEls, rightEls, chips } = ctx;
    const pairedRight = new Map(Object.entries(answer).map(([l, r]) => [Number(r), Number(l)]));
    leftEls.forEach((item, i) => {
        const r = answer[i];
        const paired = r !== undefined;
        item.classList.toggle(`is-paired`, paired);
        item.setAttribute(`aria-label`, paired ? `${itemText(`l`, i)}, paired with ${itemText(`r`, r)}` : itemText(`l`, i));
        item.setAttribute(`aria-pressed`, String(!!ctx.sel && ctx.sel.side === `l` && ctx.sel.idx === i));
    });
    rightEls.forEach((item) => {
        const idx = Number(item.dataset.idx);
        const l = pairedRight.get(idx);
        const paired = l !== undefined;
        item.classList.toggle(`is-paired`, paired);
        item.setAttribute(`aria-label`, paired ? `${itemText(`r`, idx)}, paired with ${itemText(`l`, l)}` : itemText(`r`, idx));
        item.setAttribute(`aria-pressed`, String(!!ctx.sel && ctx.sel.side === `r` && ctx.sel.idx === idx));
    });
    [...leftEls, ...rightEls].forEach(item => {
        const sel = ctx.sel;
        item.classList.toggle(`is-selected`, !!sel && sel.side === item.dataset.side && sel.idx === Number(item.dataset.idx));
    });

    chips.textContent = ``;
    for (let i = 0; i < q.pairs.length; i++) {
        if (answer[i] === undefined) continue;
        const li = el(`li`);
        const chip = el(`button`, `pair-chip`);
        chip.type = `button`;
        chip.setAttribute(`aria-label`, `Remove pair: ${itemText(`l`, i)} with ${itemText(`r`, answer[i])}`);
        chip.append(langNode(itemText(`l`, i), ctx.lang.left), el(`span`, `pair-arrow`, `↔`), langNode(itemText(`r`, answer[i]), ctx.lang.right), el(`span`, `pair-x`, `×`));
        chip.addEventListener(`click`, () => unpair(i));
        li.append(chip);
        chips.append(li);
    }
    draw();
}

function anchor(item, side) {
    const r = item.getBoundingClientRect();
    const b = ctx.board.getBoundingClientRect();
    return { x: (side === `l` ? r.right : r.left) - b.left, y: r.top - b.top + r.height / 2 };
}

function rightElFor(pairIdx) {
    return ctx.rightEls.find(item => Number(item.dataset.idx) === pairIdx);
}

function scheduleDraw() {
    if (!ctx || ctx.raf) return;
    ctx.raf = requestAnimationFrame(() => { if (ctx) { ctx.raf = 0; draw(); } });
}

function draw() {
    if (!ctx) return;
    const { svg, board, answer, leftEls } = ctx;
    const w = board.clientWidth, h = board.clientHeight;
    svg.setAttribute(`viewBox`, `0 0 ${w} ${h}`);
    svg.setAttribute(`width`, String(w));
    svg.setAttribute(`height`, String(h));
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    void board.offsetWidth;                         // force a reflow so old iOS drops the removed lines

    for (const [lKey, r] of Object.entries(answer)) {
        const l = Number(lKey);
        const a = anchor(leftEls[l], `l`);
        const b = anchor(rightElFor(r), `r`);
        const g = svgEl(`g`, { class: `pair-line` });
        const hit = svgEl(`line`, { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `pair-hit` });
        hit.addEventListener(`click`, () => unpair(l));
        g.append(
            hit,
            svgEl(`line`, { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `pair-stroke` }),
            svgEl(`circle`, { cx: a.x, cy: a.y, r: 5, class: `pair-dot` }),
            svgEl(`circle`, { cx: b.x, cy: b.y, r: 5, class: `pair-dot` })
        );
        svg.append(g);
    }
    if (ctx.drag && ctx.drag.moved) {
        const d = ctx.drag;
        const a = anchor(d.el, d.side);
        const br = board.getBoundingClientRect();
        svg.append(
            svgEl(`line`, { x1: a.x, y1: a.y, x2: d.x - br.left, y2: d.y - br.top, class: `drag-stroke` }),
            svgEl(`circle`, { cx: a.x, cy: a.y, r: 5, class: `pair-dot` })
        );
    }
}

function pair(l, r) {
    const { answer, q } = ctx;
    for (const key of Object.keys(answer)) if (answer[key] === r) delete answer[key];   // a word takes one pair
    answer[l] = r;
    ctx.sel = null;
    const lText = itemText(`l`, l), rText = itemText(`r`, r);
    state.answers[state.idx] = answer;
    refreshConnect();
    updateChrome();
    announce(`Paired ${lText} with ${rText}. ${Object.keys(answer).length} of ${q.pairs.length} paired.`);
}

function unpair(l) {
    if (!ctx || ctx.answer[l] === undefined) return;
    const text = `${itemText(`l`, l)} with ${itemText(`r`, ctx.answer[l])}`;
    delete ctx.answer[l];
    refreshConnect();
    updateChrome();
    announce(`Removed pair ${text}.`);
}

/* ---------- Tap / keyboard ---------- */

function onBoardClick(e) {
    const item = e.target.closest(`.connect-item`);
    if (!item || !ctx) return;
    if (justDragged) return;
    const side = item.dataset.side, idx = Number(item.dataset.idx);
    const sel = ctx.sel;
    if (sel && sel.side !== side) {
        if (side === `r`) pair(sel.idx, idx); else pair(idx, sel.idx);
        return;
    }
    if (sel && sel.side === side && sel.idx === idx) ctx.sel = null;
    else ctx.sel = { side, idx };
    refreshConnect();
    if (ctx.sel) announce(`Selected ${itemText(side, idx)}. Now choose its match in the other column.`);
}

function onBoardKey(e) {
    const item = e.target.closest(`.connect-item`);
    if (!item || !ctx) return;
    const side = item.dataset.side;
    const list = side === `l` ? ctx.leftEls : ctx.rightEls;
    const other = side === `l` ? ctx.rightEls : ctx.leftEls;
    const at = list.indexOf(item);
    let target = null;
    if (e.key === `ArrowDown`) target = list[Math.min(list.length - 1, at + 1)];
    else if (e.key === `ArrowUp`) target = list[Math.max(0, at - 1)];
    else if (e.key === `ArrowRight` && side === `l`) target = other[Math.min(other.length - 1, at)];
    else if (e.key === `ArrowLeft` && side === `r`) target = other[Math.min(other.length - 1, at)];
    else if (e.key === `Escape` && ctx.sel) { ctx.sel = null; refreshConnect(); announce(`Selection cleared.`); e.stopPropagation(); return; }
    if (!target) return;
    e.preventDefault();
    target.focus();
}

/* ---------- Drag ---------- */

function beginDrag(item, x, y, pointerId) {
    ctx.drag = { el: item, side: item.dataset.side, idx: Number(item.dataset.idx), sx: x, sy: y, x, y, moved: false, pointerId, over: null };
}

function moveDrag(x, y) {
    const d = ctx && ctx.drag;
    if (!d) return;
    d.x = x; d.y = y;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 6) { d.moved = true; ctx.board.classList.add(`is-dragging`); }
    if (!d.moved) return;
    const over = document.elementFromPoint(x, y);
    const target = over && over.closest ? over.closest(`.connect-item`) : null;
    const valid = target && ctx.board.contains(target) && target.dataset.side !== d.side ? target : null;
    if (valid !== d.over) {
        if (d.over) d.over.classList.remove(`is-target`);
        if (valid) valid.classList.add(`is-target`);
        d.over = valid;
    }
    scheduleDraw();
}

function endDrag(x, y, cancelled) {
    const d = ctx && ctx.drag;
    if (!d) return;
    removeDragListeners();
    if (d.over) d.over.classList.remove(`is-target`);
    ctx.board.classList.remove(`is-dragging`);
    ctx.drag = null;
    if (d.moved) {
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 0);
        const over = document.elementFromPoint(x, y);
        const target = over && over.closest ? over.closest(`.connect-item`) : null;
        if (!cancelled && target && ctx.board.contains(target) && target.dataset.side !== d.side) {
            const idx = Number(target.dataset.idx);
            if (d.side === `l`) pair(d.idx, idx); else pair(idx, d.idx);
            return;
        }
        announce(`Pairing cancelled.`);
    }
    draw();
}

let dragListeners = [];
function addDragListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    dragListeners.push([target, type, handler, options]);
}
function removeDragListeners() {
    for (const [target, type, handler, options] of dragListeners) target.removeEventListener(type, handler, options);
    dragListeners = [];
}

function onPointerDown(e) {
    const item = e.target.closest(`.connect-item`);
    if (!item || !ctx || ctx.drag) return;
    if (e.pointerType === `mouse` && e.button !== 0) return;
    beginDrag(item, e.clientX, e.clientY, e.pointerId);
    // listeners live on document (no setPointerCapture) so events are never retargeted
    addDragListener(document, `pointermove`, (ev) => { if (ev.pointerId === ctx?.drag?.pointerId) moveDrag(ev.clientX, ev.clientY); });
    addDragListener(document, `pointerup`, (ev) => { if (ev.pointerId === ctx?.drag?.pointerId) endDrag(ev.clientX, ev.clientY, false); });
    addDragListener(document, `pointercancel`, (ev) => { if (ev.pointerId === ctx?.drag?.pointerId) endDrag(ev.clientX, ev.clientY, true); });
}

// Fallback for browsers without Pointer Events
function onTouchStart(e) {
    const item = e.target.closest(`.connect-item`);
    if (!item || !ctx || ctx.drag || e.touches.length !== 1) return;
    lastTouchAt = Date.now();
    const t = e.touches[0];
    beginDrag(item, t.clientX, t.clientY, null);
    addDragListener(document, `touchmove`, (ev) => {
        const touch = ev.touches[0];
        if (!touch) return;
        moveDrag(touch.clientX, touch.clientY);
        if (ctx && ctx.drag && ctx.drag.moved && ev.cancelable) ev.preventDefault();   // no page scroll while dragging
    }, { passive: false });
    const finish = (cancelled) => (ev) => {
        const touch = ev.changedTouches[0] || { clientX: ctx.drag.x, clientY: ctx.drag.y };
        endDrag(touch.clientX, touch.clientY, cancelled);
    };
    addDragListener(document, `touchend`, finish(false));
    addDragListener(document, `touchcancel`, finish(true));
}

function onMouseDown(e) {
    if (Date.now() - lastTouchAt < 800 || e.button !== 0) return;
    const item = e.target.closest(`.connect-item`);
    if (!item || !ctx || ctx.drag) return;
    beginDrag(item, e.clientX, e.clientY, null);
    addDragListener(document, `mousemove`, (ev) => moveDrag(ev.clientX, ev.clientY));
    addDragListener(document, `mouseup`, (ev) => endDrag(ev.clientX, ev.clientY, false));
}

window.addEventListener(`resize`, scheduleDraw);
window.addEventListener(`orientationchange`, () => { scheduleDraw(); setTimeout(scheduleDraw, 300); });

/* ==========================================================================
   Submit modal (custom, focus-trapped; not <dialog> for older iOS)
   ========================================================================== */

const modal = $(`submit-modal`);
const modalBack = $(`modal-back`);
const modalConfirm = $(`modal-confirm`);

function openModal(unanswered) {
    $(`modal-text`).textContent = `${unanswered} ${unanswered === 1 ? `question is` : `questions are`} unanswered and will score 0. You can go back and answer ${unanswered === 1 ? `it` : `them`}, or submit now.`;
    modal.hidden = false;
    modalBack.focus();
}

function closeModal() {
    modal.hidden = true;
    submitButton.focus();
}

modalBack.addEventListener(`click`, closeModal);
modalConfirm.addEventListener(`click`, () => { modal.hidden = true; submitQuiz(); });
modal.addEventListener(`click`, (e) => { if (e.target === modal) closeModal(); });
document.addEventListener(`keydown`, (e) => {
    if (modal.hidden) return;
    if (e.key === `Escape`) { e.preventDefault(); closeModal(); return; }
    if (e.key !== `Tab`) return;
    const first = modalBack, last = modalConfirm;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
});

submitButton.addEventListener(`click`, () => {
    if (state.submitting || answeredCount() === 0) return;
    const unanswered = state.questions.length - answeredCount();
    if (unanswered > 0) openModal(unanswered); else submitQuiz();
});

/* ==========================================================================
   Submit, grade, log
   ========================================================================== */

async function submitQuiz() {
    if (state.submitting) return;
    state.submitting = true;
    submitButton.disabled = true;
    teardownConnect();

    const { questions, answers, words } = state;
    const result = scoreQuiz(questions, answers, words);
    for (const ev of attemptEventsFor(questions, answers, words)) {
        logAttempt(ev.word_hawaiian, ev.outcome, ev.is_retry, { variant: ev.variant });
    }
    logSetCompleted();
    flush();

    state.lastResult = result;
    renderReview(result);
    showStage(`review`);
    $(`review-title`).focus();

    const body = { quiz_id: state.quizId, visitor_id: getVisitorId(), set_key: state.set.id, local_date: localDate(), ...result };
    const note = $(`submit-note`);
    note.textContent = ``;
    try {
        const headers = { 'Content-Type': `application/json` };
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${API_BASE_URL}/quiz-results`, { method: `POST`, headers, body: JSON.stringify(body) });
        if (response.ok) {
            markApiUp();
            const data = await response.json();
            if (Array.isArray(data.new_achievements) && data.new_achievements.length > 0) showAchievementToasts(data.new_achievements);
        } else if (response.status >= 500 && isLoggedIn()) markApiDown();
        // 401 (expired login) and other failures are ignored: the result is already on screen
    } catch { if (isLoggedIn()) markApiDown(); /* the result is already on screen */ }
}

/* ==========================================================================
   Review
   ========================================================================== */

const reviewList = $(`review-list`);
const mistakesToggle = $(`mistakes-toggle`);

function renderReview(result) {
    $(`score-value`).textContent = `${fmt(result.score)} / ${result.question_count}`;
    $(`score-percent`).textContent = `${Math.round((result.score / result.question_count) * 100)}%`;
    const parts = [];
    if (result.writing_total) parts.push(`Writing ${result.writing_correct}/${result.writing_total}`);
    if (result.mc_total) parts.push(`Multiple choice ${result.mc_correct}/${result.mc_total}`);
    if (result.connect_total) parts.push(`Matching ${fmt(result.connect_score)}/${result.connect_total}`);
    if (result.unanswered) parts.push(`${result.unanswered} unanswered`);
    $(`score-detail`).textContent = parts.join(` · `);

    reviewList.textContent = ``;
    state.questions.forEach((q, i) => reviewList.append(reviewItem(q, state.answers[i], i)));
    mistakesToggle.checked = false;
    applyMistakeFilter();
}

function statusOf(g) {
    if (!g.answered) return { cls: `skip`, icon: ICON_HALF, label: `Not answered` };
    if (g.correct) return { cls: `ok`, icon: ICON_CHECK, label: `Correct` };
    if (g.score > 0) return { cls: `partial`, icon: ICON_HALF, label: `Partly correct` };
    return { cls: `bad`, icon: ICON_X, label: `Incorrect` };
}

function line(label, valueNode) {
    const row = el(`div`, `review-line`);
    row.append(el(`span`, `review-label`, label), valueNode);
    return row;
}

function reviewItem(q, answer, i) {
    const g = gradeQuestion(q, answer, state.words);
    const status = statusOf(g);
    const li = el(`li`, `review-item is-${status.cls}`);
    li.dataset.mistake = g.correct ? `0` : `1`;

    const head = el(`div`, `review-head`);
    const badge = el(`span`, `status status-${status.cls}`);
    badge.innerHTML = status.icon;
    badge.append(status.label + (q.type === `connect` && g.answered ? ` (${g.correctPairs}/${g.k})` : ``));
    head.append(el(`span`, `review-num`, `Question ${i + 1}`), el(`span`, `tag`, { writing: `Writing`, mc: `Multiple choice`, connect: `Matching` }[q.type]), badge);
    li.append(head);
    li.append(el(`p`, `review-instruction`, instruction(q)));

    if (q.type === `connect`) {
        const rows = el(`ul`, `review-pairs`);
        q.pairs.forEach((w, j) => {
            const picked = answer && answer[j] !== undefined ? q.pairs[answer[j]] : null;
            const ok = g.pairs[j];
            const row = el(`li`, `review-pair ${ok ? `ok` : `bad`}`);
            const mark = el(`span`, `pair-mark`);
            mark.innerHTML = ok ? ICON_CHECK : ICON_X;
            mark.append(el(`span`, `visually-hidden`, ok ? `Correct` : `Incorrect`));
            const left = langNode(wordIn(w, shownLang(q)), shownLang(q), `rp-word`);
            const mine = picked ? langNode(wordIn(picked, answerLang(q)), answerLang(q), `rp-answer`) : el(`span`, `rp-answer muted`, `No pair`);
            row.append(mark, left, el(`span`, `pair-arrow`, `→`), mine);
            if (!ok) {
                const right = langNode(wordIn(w, answerLang(q)), answerLang(q), `rp-correct`);
                row.append(el(`span`, `rp-sep`, `correct:`), right);
            }
            rows.append(row);
        });
        li.append(rows);
        return li;
    }

    const prompt = langNode(wordIn(q.word, shownLang(q)), shownLang(q), `review-word`);
    li.append(line(`Prompt`, prompt));
    let yours;
    if (q.type === `mc`) {
        yours = isAnswered(q, answer) ? langNode(wordIn(q.options[answer], answerLang(q)), answerLang(q)) : el(`span`, `muted`, `No answer`);
    } else {
        yours = isAnswered(q, answer) ? langNode(answer.trim(), answerLang(q)) : el(`span`, `muted`, `No answer`);
    }
    li.append(line(`Your answer`, yours));
    if (!g.correct) {
        li.append(line(`Correct answer`, langNode(wordIn(q.word, answerLang(q)), answerLang(q), `review-correct`)));
    }
    if (g.nearMiss) li.append(el(`p`, `review-note`, `Close, but check kahakō and ʻokina. Hawaiian answers must match exactly.`));
    return li;
}

function applyMistakeFilter() {
    const only = mistakesToggle.checked;
    let shown = 0;
    for (const item of reviewList.children) {
        const hide = only && item.dataset.mistake === `0`;
        item.hidden = hide;
        if (!hide) shown++;
    }
    $(`review-empty`).hidden = shown !== 0;
}
mistakesToggle.addEventListener(`change`, applyMistakeFilter);

/* ==========================================================================
   Init
   ========================================================================== */

buildPicker();
applyFilter();
const deepLink = new URLSearchParams(location.search).get(`set`);

// "Resume where you left off": link back to the last quiz set when none was picked from the URL
const lastQuiz = getPref(`lastSet:quiz`);
if (!deepLink && lastQuiz?.key && pickerSets.some(e => e.set.id === lastQuiz.key && e.playable)) {
    const resume = el(`p`, `resume-link`);
    const link = el(`a`, ``, `Resume where you left off: ${lastQuiz.name}`);
    link.href = `${location.pathname}?set=${encodeURIComponent(lastQuiz.key)}`;
    resume.append(link);
    searchInput.closest(`.picker-search`).before(resume);
}
if (deepLink) {
    selectSet(deepLink);
    const entry = pickerSets.find(e => e.set.id === deepLink);
    if (entry && entry.playable) entry.node.scrollIntoView({ block: `center`, behavior: prefersReducedMotion() ? `auto` : `smooth` });
}
