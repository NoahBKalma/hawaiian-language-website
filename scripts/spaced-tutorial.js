// "How spaced repetition works" tutorial for the flashcards and writing pages. Same dialog look, focus trap and key handling as
// flashcard-tutorial.js (it reuses the .tut* styles from flashcard-tutorial.css), but it is a short read-through, not a practice
// round. It never touches the real deck or the schedule.
//  - the help button #spaced-help-button reopens it any time
//  - maybeOpenFirstTime() opens it once, the first time the Spaced switch is turned ON (called by the pages after a click, never on load)
import { prefersReducedMotion } from "/scripts/word-utils.js";

const SEEN_KEY = `olelo:spaced-tutorial-seen`;
let seenInMemory = false;   // fallback when localStorage is blocked

function hasSeen() {
    if (seenInMemory) return true;
    try { return window.localStorage.getItem(SEEN_KEY) === `1`; } catch { return false; }
}

function markSeen() {
    seenInMemory = true;
    try { window.localStorage.setItem(SEEN_KEY, `1`); } catch { /* blocked: remembered for this visit only */ }
}

const STEPS = [
    { title: `Turn it on`, visual: `switch`,
      text: `The Spaced switch gives you a smart schedule. Each word comes back just before you would forget it, so you spend time where it helps most. Flip it on or off any time.` },
    { title: `Due and new cards`, visual: `deck`,
      text: `Your deck is the words that are due, plus a few new ones (5 in a small set, 10 in a bigger one). Words that are not due yet stay hidden until their time.` },
    { title: `Correct and Incorrect`, visual: `grade`,
      text: `Correct pushes a word further away. Incorrect brings it back soon. In Writing, a right answer on the first try counts as correct; hints and give-ups bring it back sooner.` },
    { title: `Short steps, then days`, visual: `steps`,
      text: `New and missed words start with short steps: 10 minutes, then 60 minutes. After that the gaps grow: 1 day, 6 days, and longer each time you get it right.` },
    { title: `Counts or practice`, visual: `badges`,
      text: `A badge above the card says what is happening. "Review missed" and "Study full set anyway" are practice only: they never change your schedule.` },
    { title: `Saved for you`, visual: `saved`,
      text: `Schedules are kept per word and per mode, so Flashcards and Writing are separate. They save to your account when you are signed in, or to this browser if not. Your answers are saved when you finish the deck; leave early and nothing is saved. The page checks what is due only when it builds a deck, so reload or reopen the set to refresh.` }
];

let teardown = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function visualFor(kind) {
    const box = el(`div`, `stut-visual`);
    box.setAttribute(`aria-hidden`, `true`);
    switch (kind) {
        case `switch`: {
            const off = el(`span`, `stut-switch`);
            off.innerHTML = `<span class="stut-thumb"></span><span class="stut-switch-text"><b>Spaced</b><i>Off</i></span>`;
            const on = el(`span`, `stut-switch is-on`);
            on.innerHTML = `<span class="stut-switch-text"><b>Spaced</b><i>On</i></span><span class="stut-thumb"></span>`;
            box.append(off, el(`span`, `stut-arrow`, `→`), on);
            break;
        }
        case `deck`:
            box.append(el(`span`, `stut-chip is-due`, `Due 3`), el(`span`, `stut-plus`, `+`), el(`span`, `stut-chip is-new`, `New 5`),
                el(`span`, `stut-plus`, `+`), el(`span`, `stut-chip is-hidden`, `Not due yet: hidden`));
            break;
        case `grade`:
            box.append(el(`span`, `stut-pill is-no`, `✗ Incorrect: back soon`), el(`span`, `stut-pill is-yes`, `✓ Correct: later`));
            break;
        case `steps`: {
            ["10 min", "60 min", "1 day", "6 days", "more…"].forEach((label, i) => {
                if (i > 0) box.append(el(`span`, `stut-arrow`, `›`));
                box.append(el(`span`, `stut-chip${i < 2 ? ` is-short` : ``}`, label));
            });
            break;
        }
        case `badges`:
            box.append(el(`span`, `stut-pill is-counts`, `✓ Spaced review · counts`), el(`span`, `stut-pill is-practice`, `✎ Practice · doesn't count`));
            break;
        case `saved`:
            box.append(el(`span`, `stut-chip`, `Flashcards`), el(`span`, `stut-chip`, `Writing`), el(`span`, `stut-chip is-short`, `Saved to your account`));
            break;
        default: break;
    }
    return box;
}

export function openSpacedTutorial(trigger) {
    if (teardown) return;
    markSeen();
    const returnTo = trigger || document.getElementById(`spaced-help-button`) || document.activeElement;
    let index = 0;

    const backdrop = el(`div`, `tut-backdrop`);
    const dialog = el(`div`, `tut stut`);
    dialog.setAttribute(`role`, `dialog`);
    dialog.setAttribute(`aria-modal`, `true`);
    dialog.setAttribute(`aria-labelledby`, `stut-title`);

    const head = el(`div`, `tut-head`);
    const title = el(`h2`, ``, `How spaced repetition works`);
    title.id = `stut-title`;
    title.tabIndex = -1;
    const closeButton = el(`button`, `tut-close`, `×`);
    closeButton.type = `button`;
    closeButton.setAttribute(`aria-label`, `Close the tutorial`);
    head.append(title, closeButton);

    const stepLabel = el(`p`, `tut-step-label`);
    const stepTitle = el(`h3`, `stut-step-title`);
    const stage = el(`div`, `stut-stage`);
    const stepText = el(`p`, `tut-step-text stut-text`);
    const live = el(`div`, `visually-hidden`);
    live.setAttribute(`role`, `status`);
    live.setAttribute(`aria-live`, `polite`);

    const dots = el(`div`, `stut-dots`);
    dots.setAttribute(`aria-hidden`, `true`);
    STEPS.forEach(() => dots.append(el(`span`, `stut-dot`)));

    const actions = el(`div`, `tut-actions`);
    const back = el(`button`, `btn btn-quiet btn-sm`, `Back`);
    back.type = `button`;
    const next = el(`button`, `btn btn-primary btn-sm`, `Next`);
    next.type = `button`;
    actions.append(back, next);

    dialog.append(head, stepLabel, stepTitle, stage, stepText, live, dots, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.body.classList.add(`tut-open`);

    function render(focusTarget) {
        const step = STEPS[index];
        stepLabel.textContent = `Step ${index + 1} of ${STEPS.length}`;
        stepTitle.textContent = step.title;
        stepText.textContent = step.text;
        stage.replaceChildren(visualFor(step.visual));
        [...dots.children].forEach((dot, i) => dot.classList.toggle(`is-current`, i === index));
        back.hidden = index === 0;
        next.textContent = index === STEPS.length - 1 ? `Got it` : `Next`;
        live.textContent = ``;
        setTimeout(() => { live.textContent = `${stepLabel.textContent}. ${step.title}. ${step.text}`; }, 30);
        if (focusTarget) focusTarget.focus();
    }

    function go(delta) {
        const target = index + delta;
        if (target < 0) return;
        if (target >= STEPS.length) { close(); return; }
        index = target;
        // keep focus on a visible control when Back disappears on the first step
        render(index === 0 && document.activeElement === back ? next : null);
    }

    next.addEventListener(`click`, () => go(1));
    back.addEventListener(`click`, () => go(-1));
    closeButton.addEventListener(`click`, close);
    backdrop.addEventListener(`click`, event => { if (event.target === backdrop) close(); });

    // Keys are handled here first and never reach the page behind the dialog
    function onKey(event) {
        if (event.key === `Escape`) { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
        if (event.key === `Tab`) {
            const focusable = [...dialog.querySelectorAll(`button:not([hidden])`)].filter(node => node.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
            else if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === `ArrowRight`) { event.preventDefault(); go(1); event.stopImmediatePropagation(); return; }
        if (event.key === `ArrowLeft`) { event.preventDefault(); go(-1); event.stopImmediatePropagation(); return; }
        // The page behind must not react to any key (the writing page grades on Enter). Stopping propagation does not cancel
        // the default action, so Enter/Space still press the focused dialog button.
        event.stopImmediatePropagation();
    }
    window.addEventListener(`keydown`, onKey, true);

    function close() {
        if (!teardown) return;
        window.removeEventListener(`keydown`, onKey, true);
        backdrop.remove();
        document.body.classList.remove(`tut-open`);
        teardown = null;
        if (returnTo && typeof returnTo.focus === `function`) returnTo.focus();
    }
    teardown = close;

    dialog.classList.toggle(`stut-reduced`, prefersReducedMotion());
    render(null);
    title.focus();
}

// Opens the tutorial once ever (per browser) and only when called; the pages call it right after the switch turns ON.
export function maybeOpenFirstTime(trigger) {
    if (hasSeen()) return false;
    openSpacedTutorial(trigger);
    return true;
}

const helpButton = document.getElementById(`spaced-help-button`);
if (helpButton) helpButton.addEventListener(`click`, () => openSpacedTutorial(helpButton));
