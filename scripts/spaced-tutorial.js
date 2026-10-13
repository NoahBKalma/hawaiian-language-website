// "How spaced repetition works" tutorial for the flashcards and writing pages. Same dialog look, focus trap and key handling as
// flashcard-tutorial.js (it reuses the .tut* styles from flashcard-tutorial.css), but it is a short read-through, not a practice
// round. It never touches the real deck or the schedule.
//  - the help button #spaced-help-button reopens it any time
//  - maybeOpenFirstTime() opens it once, the first time the Spaced switch is turned ON (called by the pages after a click, never on load)
import { prefersReducedMotion } from "/scripts/word-utils.js";
import { t, onLangChange } from "/scripts/i18n.js";

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

// title/text are i18n keys (spaced.tut.sN.*), painted through t()
const STEPS = [
    { title: `spaced.tut.s1.title`, text: `spaced.tut.s1.text`, visual: `switch` },
    { title: `spaced.tut.s2.title`, text: `spaced.tut.s2.text`, visual: `deck` },
    { title: `spaced.tut.s3.title`, text: `spaced.tut.s3.text`, visual: `grade` },
    { title: `spaced.tut.s4.title`, text: `spaced.tut.s4.text`, visual: `steps` },
    { title: `spaced.tut.s5.title`, text: `spaced.tut.s5.text`, visual: `badges` },
    { title: `spaced.tut.s6.title`, text: `spaced.tut.s6.text`, visual: `saved` }
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
            off.innerHTML = `<span class="stut-thumb"></span><span class="stut-switch-text"><b></b><i></i></span>`;
            off.querySelector(`b`).textContent = t(`spaced.tut.vis.spaced`);
            off.querySelector(`i`).textContent = t(`spaced.tut.vis.off`);
            const on = el(`span`, `stut-switch is-on`);
            on.innerHTML = `<span class="stut-switch-text"><b></b><i></i></span><span class="stut-thumb"></span>`;
            on.querySelector(`b`).textContent = t(`spaced.tut.vis.spaced`);
            on.querySelector(`i`).textContent = t(`spaced.tut.vis.on`);
            box.append(off, el(`span`, `stut-arrow`, `→`), on);
            break;
        }
        case `deck`:
            box.append(el(`span`, `stut-chip is-due`, t(`spaced.tut.vis.due`)), el(`span`, `stut-plus`, `+`), el(`span`, `stut-chip is-new`, t(`spaced.tut.vis.new`)),
                el(`span`, `stut-plus`, `+`), el(`span`, `stut-chip is-hidden`, t(`spaced.tut.vis.hidden`)));
            break;
        case `grade`:
            box.append(el(`span`, `stut-pill is-no`, `✗ ${t(`spaced.tut.vis.incorrect`)}`), el(`span`, `stut-pill is-yes`, `✓ ${t(`spaced.tut.vis.correct`)}`));
            break;
        case `steps`: {
            [t(`spaced.tut.vis.min10`), t(`spaced.tut.vis.min60`), t(`spaced.tut.vis.day1`), t(`spaced.tut.vis.day6`), t(`spaced.tut.vis.more`)].forEach((label, i) => {
                if (i > 0) box.append(el(`span`, `stut-arrow`, `›`));
                box.append(el(`span`, `stut-chip${i < 2 ? ` is-short` : ``}`, label));
            });
            break;
        }
        case `badges`:
            box.append(el(`span`, `stut-pill is-counts`, `✓ ${t(`spaced.badge.counts.label`)}`), el(`span`, `stut-pill is-practice`, `✎ ${t(`spaced.badge.practice.label`)}`));
            break;
        case `saved`:
            box.append(el(`span`, `stut-chip`, t(`spaced.tut.vis.flashcards`)), el(`span`, `stut-chip`, t(`spaced.tut.vis.writing`)), el(`span`, `stut-chip is-short`, t(`spaced.tut.vis.saved`)));
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
    const title = el(`h2`, ``);
    title.id = `stut-title`;
    title.tabIndex = -1;
    const closeButton = el(`button`, `tut-close`, `×`);
    closeButton.type = `button`;
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
    const back = el(`button`, `btn btn-quiet btn-sm`);
    back.type = `button`;
    const next = el(`button`, `btn btn-primary btn-sm`);
    next.type = `button`;
    actions.append(back, next);

    dialog.append(head, stepLabel, stepTitle, stage, stepText, live, dots, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.body.classList.add(`tut-open`);

    function render(focusTarget) {
        const step = STEPS[index];
        title.textContent = t(`spaced.tut.title`);
        closeButton.setAttribute(`aria-label`, t(`spaced.tut.closeAria`));
        back.textContent = t(`spaced.tut.back`);
        stepLabel.textContent = t(`spaced.tut.stepLabel`, { n: index + 1, total: STEPS.length });
        stepTitle.textContent = t(step.title);
        stepText.textContent = t(step.text);
        stage.replaceChildren(visualFor(step.visual));
        [...dots.children].forEach((dot, i) => dot.classList.toggle(`is-current`, i === index));
        back.hidden = index === 0;
        next.textContent = index === STEPS.length - 1 ? t(`spaced.tut.gotIt`) : t(`spaced.tut.next`);
        live.textContent = ``;
        setTimeout(() => { live.textContent = `${stepLabel.textContent}. ${stepTitle.textContent}. ${stepText.textContent}`; }, 30);
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
    const offLang = onLangChange(() => render(null));   // the dialog is open: repaint in the new language

    function close() {
        if (!teardown) return;
        window.removeEventListener(`keydown`, onKey, true);
        offLang();
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
