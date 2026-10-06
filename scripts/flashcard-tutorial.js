// "How it works" tutorial for the flashcards page: a short guided practice round in its own dialog.
// It runs on three sample cards and is completely separate from the real deck, so it never records
// activity, streaks or study logs.
import { prefersReducedMotion } from "/scripts/word-utils.js";

const openButton = document.getElementById(`tutorial-button`);
if (openButton) openButton.addEventListener(`click`, () => openTutorial(openButton));

const CARDS = [
    { haw: `aloha`, eng: `hello, love` },
    { haw: `mahalo`, eng: `thank you` },
    { haw: `ʻohana`, eng: `family` }
];

// Each step says what to do and which controls are live. `done` is the action that finishes the step.
const STEPS = [
    { card: 0, done: `flip`, spot: `card`, enabled: [`card`],
      text: `Tap the card to flip it and see the English. You can also press Space or Enter.` },
    { card: 0, done: `grade`, spot: `correct`, enabled: [`card`, `correct`],
      text: `Did you know it? Press Correct (or the C key), or swipe the card to the right.` },
    { card: 1, done: `grade-incorrect`, spot: `incorrect`, enabled: [`card`, `incorrect`],
      text: `Not sure of this one? Press Incorrect (or the X key), or swipe left. Missed cards come back until you get them right.` },
    { card: 2, done: `next`, spot: `next`, enabled: [`card`, `next`, `prev`],
      text: `You can look around without grading. Press the Next arrow (or the right arrow key). The left arrow goes back.` },
    { card: 1, done: `grade-correct`, spot: `correct`, enabled: [`card`, `correct`],
      text: `Here is the card you missed, back for another try. Flip it, then press Correct.` }
];

const SHORTCUTS = [
    [`Space / Enter`, `Flip the card`],
    [`C or 2`, `Mark correct`],
    [`X or 1`, `Mark incorrect`],
    [`← →`, `Previous / next card`]
];

let teardown = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function iconButton(id, label, icon) {
    const button = el(`button`, `tut-icon`);
    button.type = `button`;
    button.dataset.control = id;
    button.setAttribute(`aria-label`, label);
    button.innerHTML = `<img src="/assets/icons/${icon}" alt="">`;
    return button;
}

function openTutorial(trigger) {
    if (teardown) return;

    let stepIndex = 0;
    let cardIndex = 0;
    let flipped = false;
    let finished = false;
    let busy = false;
    const reduced = prefersReducedMotion();

    /* ---------- markup ---------- */
    const backdrop = el(`div`, `tut-backdrop`);
    const dialog = el(`div`, `tut`);
    dialog.setAttribute(`role`, `dialog`);
    dialog.setAttribute(`aria-modal`, `true`);
    dialog.setAttribute(`aria-labelledby`, `tut-title`);

    const head = el(`div`, `tut-head`);
    const title = el(`h2`, ``, `How flashcards work`);
    title.id = `tut-title`;
    title.tabIndex = -1;
    const closeButton = el(`button`, `tut-close`, `×`);
    closeButton.type = `button`;
    closeButton.setAttribute(`aria-label`, `Close the tutorial`);
    head.append(title, closeButton);

    const stepLabel = el(`p`, `tut-step-label`);
    const stepText = el(`p`, `tut-step-text`);
    const live = el(`div`, `visually-hidden`);
    live.setAttribute(`role`, `status`);
    live.setAttribute(`aria-live`, `polite`);

    const stage = el(`div`, `tut-stage`);
    const card = el(`button`, `tut-card`);
    card.type = `button`;
    card.dataset.control = `card`;
    card.setAttribute(`aria-label`, `Practice flashcard. Press Space or Enter to flip.`);
    const inner = el(`span`, `tut-card-inner`);
    const front = el(`span`, `tut-face tut-front`);
    const back = el(`span`, `tut-face tut-back`);
    front.lang = `haw`;
    inner.append(front, back);
    card.append(inner);

    const grade = el(`div`, `tut-grade`);
    const incorrect = el(`button`, `tut-grade-btn tut-no`);
    incorrect.type = `button`;
    incorrect.dataset.control = `incorrect`;
    incorrect.innerHTML = `<span aria-hidden="true">✗</span> Incorrect (X)`;
    const correct = el(`button`, `tut-grade-btn tut-yes`);
    correct.type = `button`;
    correct.dataset.control = `correct`;
    correct.innerHTML = `<span aria-hidden="true">✓</span> Correct (C)`;
    grade.append(incorrect, correct);

    const nav = el(`div`, `tut-nav`);
    const prev = iconButton(`prev`, `Previous card`, `previous-card-icon.svg`);
    const next = iconButton(`next`, `Next card`, `next-card-icon.svg`);
    nav.append(prev, next);

    stage.append(card, grade, nav);

    const done = el(`div`, `tut-done`);
    done.hidden = true;
    done.append(el(`h3`, ``, `You've got it!`), el(`p`, ``, `That's the whole flow: flip, grade, and missed cards come back. These keys work on the real deck too:`));
    const list = el(`dl`, `tut-keys`);
    for (const [keys, what] of SHORTCUTS) {
        const row = el(`div`);
        row.append(el(`dt`, ``, keys), el(`dd`, ``, what));
        list.append(row);
    }
    const doneActions = el(`div`, `tut-actions`);
    const replay = el(`button`, `btn btn-quiet btn-sm`, `Practice again`);
    replay.type = `button`;
    const start = el(`button`, `btn btn-primary btn-sm`, `Start studying`);
    start.type = `button`;
    doneActions.append(replay, start);
    done.append(list, doneActions);

    const foot = el(`p`, `tut-foot`, `Practice only. Nothing here counts toward your streak.`);

    dialog.append(head, stepLabel, stepText, live, stage, done, foot);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.body.classList.add(`tut-open`);

    /* ---------- rendering ---------- */
    function say(message) {
        live.textContent = ``;
        setTimeout(() => { live.textContent = message; }, 30);
    }

    function setFlipped(value) {
        flipped = value;
        card.classList.toggle(`is-flipped`, flipped);
    }

    function showCard(index) {
        cardIndex = index;
        const data = CARDS[index];
        front.textContent = data.haw;
        back.textContent = data.eng;
        // unflip instantly so the answer never shows through while the next word appears
        card.classList.add(`no-anim`);
        setFlipped(false);
        void card.offsetWidth;
        card.classList.remove(`no-anim`);
    }

    function render(announceStep = true) {
        if (finished) return;
        const step = STEPS[stepIndex];
        showCard(step.card);
        stepLabel.textContent = `Step ${stepIndex + 1} of ${STEPS.length}`;
        stepText.textContent = step.text;
        for (const control of dialog.querySelectorAll(`[data-control]`)) {
            const isOn = step.enabled.includes(control.dataset.control);
            control.setAttribute(`aria-disabled`, String(!isOn));
            control.classList.toggle(`is-spot`, control.dataset.control === step.spot);
        }
        if (announceStep) say(`${stepLabel.textContent}. ${step.text} Card: ${CARDS[step.card].haw}.`);
    }

    function finish() {
        finished = true;
        stage.hidden = true;
        stepLabel.hidden = true;
        stepText.hidden = true;
        done.hidden = false;
        title.focus();
        say(`You've got it! Flip, grade, and missed cards come back.`);
    }

    function restart() {
        finished = false;
        stepIndex = 0;
        stage.hidden = false;
        stepLabel.hidden = false;
        stepText.hidden = false;
        done.hidden = true;
        render();
        card.focus();
    }

    function advance() {
        stepIndex++;
        if (stepIndex >= STEPS.length) finish();
        else render();
    }

    /* ---------- actions ---------- */
    const isLive = (control) => !finished && !busy && STEPS[stepIndex].enabled.includes(control);

    function doFlip() {
        if (!isLive(`card`)) return;
        setFlipped(!flipped);
        say(flipped ? `Answer: ${CARDS[cardIndex].eng}` : `Front: ${CARDS[cardIndex].haw}`);
        if (flipped && STEPS[stepIndex].done === `flip`) setTimeout(advance, reduced ? 0 : 450);
    }

    function doGrade(result, direction) {
        const control = result === `correct` ? `correct` : `incorrect`;
        if (!isLive(control)) return;
        const step = STEPS[stepIndex];
        const ok = step.done === `grade` || step.done === `grade-${result}`;
        if (!ok) return;
        busy = true;
        say(`Marked ${result}.`);
        const fly = () => { busy = false; advance(); };
        if (reduced) { fly(); return; }
        card.classList.add(direction > 0 ? `fly-right` : `fly-left`);
        setTimeout(() => { card.classList.remove(`fly-right`, `fly-left`); fly(); }, 260);
    }

    function doNav(direction) {
        const control = direction > 0 ? `next` : `prev`;
        if (!isLive(control)) return;
        if (STEPS[stepIndex].done === `next` && direction > 0) { say(`Next card.`); advance(); return; }
        // browsing backward in the browse step just shows the neighbouring practice card
        const target = (cardIndex + direction + CARDS.length) % CARDS.length;
        showCard(target);
        say(`Card: ${CARDS[target].haw}`);
    }

    /* ---------- events ---------- */
    card.addEventListener(`click`, () => { if (suppressClick) { suppressClick = false; return; } doFlip(); });
    correct.addEventListener(`click`, () => doGrade(`correct`, 1));
    incorrect.addEventListener(`click`, () => doGrade(`incorrect`, -1));
    next.addEventListener(`click`, () => doNav(1));
    prev.addEventListener(`click`, () => doNav(-1));
    replay.addEventListener(`click`, restart);
    start.addEventListener(`click`, close);
    closeButton.addEventListener(`click`, close);
    backdrop.addEventListener(`click`, (event) => { if (event.target === backdrop) close(); });

    // swipe on the card
    let suppressClick = false;
    let drag = null;
    card.addEventListener(`pointerdown`, (event) => {
        if (event.pointerType === `mouse` && event.button !== 0) return;
        drag = { id: event.pointerId, x: event.clientX, dx: 0 };
        card.setPointerCapture(event.pointerId);
    });
    card.addEventListener(`pointermove`, (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        drag.dx = event.clientX - drag.x;
        if (Math.abs(drag.dx) > 6) card.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 25}deg)`;
    });
    const endDrag = (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = drag.dx;
        drag = null;
        card.style.transform = ``;
        if (Math.abs(dx) > 6) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
        if (Math.abs(dx) >= 70) doGrade(dx > 0 ? `correct` : `incorrect`, dx > 0 ? 1 : -1);
    };
    card.addEventListener(`pointerup`, endDrag);
    card.addEventListener(`pointercancel`, endDrag);

    // Keys: handled here first, and never allowed through to the real flashcard page behind the dialog
    function onKey(event) {
        if (event.key === `Escape`) { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }

        if (event.key === `Tab`) {
            const focusable = [...dialog.querySelectorAll(`button:not([hidden]), [tabindex="0"]`)].filter(node => node.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
            else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const onButton = event.target instanceof HTMLElement && event.target.closest(`button`);
        let handled = true;
        switch (event.key) {
            case ` `: case `Enter`:
                // a focused button keeps its own Space/Enter behaviour
                if (onButton && event.target !== card) { handled = false; break; }
                event.preventDefault(); doFlip(); break;
            case `c`: case `C`: case `2`: doGrade(`correct`, 1); break;
            case `x`: case `X`: case `1`: doGrade(`incorrect`, -1); break;
            case `ArrowRight`: doNav(1); break;
            case `ArrowLeft`: doNav(-1); break;
            default: handled = false;
        }
        if (handled) event.stopImmediatePropagation();
        else if (!onButton) event.stopImmediatePropagation(); // the page behind must not react either
    }
    window.addEventListener(`keydown`, onKey, true);

    function close() {
        if (!teardown) return;
        window.removeEventListener(`keydown`, onKey, true);
        backdrop.remove();
        document.body.classList.remove(`tut-open`);
        teardown = null;
        trigger.focus();
    }
    teardown = close;

    render(false);
    title.focus();
    say(`Flashcard tutorial. ${STEPS[0].text}`);
}
