// "How writing practice works" tutorial: a guided mini-round on three sample words (English prompt -> type the Hawaiian), in its own
// dialog. Same dialog look, focus handling and reduced-motion rules as flashcard-tutorial.js / spaced-tutorial.js (it reuses the
// .tut* styles from flashcard-tutorial.css, plus a few .wtut* bits from writing-tutorial.css).
// It records NOTHING: no requests, no review-state writes, and it never touches the real deck behind it.
import { canonical, normalize, prefersReducedMotion } from "/scripts/word-utils.js";
import "/components/hawaiian-keyboard.js";
import { applyI18n } from "/scripts/i18n.js";

const WORDS = [
    { english: `water`, hawaiian: `wai` },
    { english: `house`, hawaiian: `hale` },
    { english: `family`, hawaiian: `ʻohana` }
].map(word => ({ ...word, hawaiian: word.hawaiian.normalize(`NFC`) }));

const TOTAL_STEPS = 5;

// Coach text per phase: keys in scripts/i18n-strings.js (the Hawaiian bits carry lang="haw" inside the key's markup, so innerHTML is safe).
// The dialog is keyed with data-i18n, so a site language change updates it live (setLang runs applyI18n(document)).
const COACH = {
    prompt: { title: `tutorial.write.prompt.title`, html: `tutorial.write.prompt.body-html` },
    wrong: { title: `tutorial.write.wrong.title`, html: `tutorial.write.wrong.body-html` },
    hint: { title: `tutorial.write.hint.title`, html: `tutorial.write.hint.body-html` },
    retry: { title: `tutorial.write.retry.title`, html: `tutorial.write.retry.body-html` },
    done: { title: `tutorial.write.done.title`, html: `tutorial.write.done.body-html` }
};

let teardown = null;

// i18nKey: the node's text is that key's string (applyI18n fills it)
function el(tag, className, i18nKey) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (i18nKey !== undefined) node.dataset.i18n = i18nKey;
    return node;
}

// Same hint shape as writing-practice.js hintText(): blanks, optionally the first letter
function hintText(answer, showFirst) {
    return Array.from(answer.normalize(`NFC`)).map((char, i) => {
        if (char === ` `) return `  `;
        if (!/\p{L}/u.test(char)) return char;
        return showFirst && i === 0 ? char : `_`;
    }).join(` `);
}

// Returns true if it opened, false if one is already open
export function openWritingTutorial(trigger) {
    if (teardown) return false;
    const returnTo = trigger || document.getElementById(`tutorial-button`) || document.getElementById(`help-button`) || document.activeElement;

    let pass = `main`;        // main | retry | done
    let index = 0;
    let retryList = [];
    let hintStage = 0;        // 0 none, 1 blanks, 2 first letter, 3 revealed
    let usedHelp = false;

    const backdrop = el(`div`, `tut-backdrop`);
    const dialog = el(`div`, `tut wtut`);
    dialog.setAttribute(`role`, `dialog`);
    dialog.setAttribute(`aria-modal`, `true`);
    dialog.setAttribute(`aria-labelledby`, `wtut-title`);

    const head = el(`div`, `tut-head`);
    const title = el(`h2`, ``, `tutorial.write.title`);
    title.id = `wtut-title`;
    title.tabIndex = -1;
    const closeButton = el(`button`, `tut-close`);
    closeButton.textContent = `×`;
    closeButton.type = `button`;
    closeButton.dataset.i18nAriaLabel = `tutorial.close.aria`;
    head.append(title, closeButton);

    const stepLabel = el(`p`, `tut-step-label`);
    const stepTitle = el(`h3`, `wtut-step-title`);
    const coach = el(`p`, `tut-step-text wtut-coach`);
    const live = el(`div`, `visually-hidden`);
    live.setAttribute(`role`, `status`);
    live.setAttribute(`aria-live`, `polite`);

    const round = el(`div`, `wtut-round`);
    const promptLabel = el(`p`, `wtut-prompt-label`, `tutorial.write.promptLabel`);
    const prompt = el(`p`, `wtut-prompt`);
    prompt.id = `wtut-prompt`;
    const retryTag = el(`p`, `wtut-retry-tag`, `tutorial.write.retryTag`);
    const hintDisplay = el(`p`, `wtut-hint-display`);
    hintDisplay.lang = `haw`;
    const keyboard = document.createElement(`hawaiian-keyboard`);
    const input = el(`input`, `wtut-input`);
    input.type = `text`;
    input.id = `wtut-input`;
    input.setAttribute(`aria-labelledby`, `wtut-prompt-label wtut-prompt`);
    promptLabel.id = `wtut-prompt-label`;
    input.setAttribute(`autocomplete`, `off`);
    input.setAttribute(`autocapitalize`, `off`);
    input.setAttribute(`autocorrect`, `off`);
    input.setAttribute(`spellcheck`, `false`);
    input.setAttribute(`enterkeyhint`, `go`);
    input.lang = `haw`;
    keyboard.append(input);
    const feedback = el(`p`, `wtut-feedback`);
    feedback.setAttribute(`role`, `status`);
    feedback.setAttribute(`aria-live`, `polite`);
    round.append(promptLabel, prompt, retryTag, keyboard, hintDisplay, feedback);

    const actions = el(`div`, `tut-actions`);
    const hintButton = el(`button`, `btn btn-quiet btn-sm`, `writing.hint`);
    hintButton.type = `button`;
    const checkButton = el(`button`, `btn btn-primary btn-sm`, `tutorial.write.check`);
    checkButton.type = `button`;
    const doneButton = el(`button`, `btn btn-primary btn-sm`, `tutorial.write.gotIt`);
    doneButton.type = `button`;
    actions.append(hintButton, checkButton, doneButton);

    dialog.append(head, stepLabel, stepTitle, coach, live, round, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.body.classList.add(`tut-open`);
    applyI18n(dialog);

    const current = () => (pass === `main` ? WORDS[index] : retryList[0]);

    // key: a string key for the feedback line, or `` to clear it
    function say(key, kind) {
        if (key) feedback.dataset.i18n = key;
        else delete feedback.dataset.i18n;
        feedback.textContent = ``;
        applyI18n(feedback);
        feedback.classList.toggle(`is-bad`, kind === `bad`);
        feedback.classList.toggle(`is-good`, kind === `good`);
    }

    function setCoach(key, stepNo) {
        const entry = COACH[key];
        stepLabel.dataset.i18n = `tutorial.stepOf`;
        stepLabel.dataset.i18nVars = JSON.stringify({ n: stepNo, total: TOTAL_STEPS });
        stepTitle.dataset.i18n = entry.title;
        coach.dataset.i18nHtml = entry.html;
        applyI18n(dialog);
        live.textContent = ``;
        setTimeout(() => { live.textContent = `${stepLabel.textContent}. ${entry.title}. ${coach.textContent}`; }, 30);
    }

    function resetHint() {
        hintStage = 0;
        usedHelp = false;
        hintDisplay.textContent = ``;
        labelHint(`writing.hint`);
    }

    function labelHint(key) {
        hintButton.dataset.i18n = key;
        applyI18n(hintButton);
    }

    function showWord(focusInput) {
        resetHint();
        input.value = ``;
        say(``);
        const word = current();
        prompt.textContent = word.english;
        retryTag.hidden = pass !== `retry`;
        if (pass === `retry`) setCoach(`retry`, 4);
        else setCoach([`prompt`, `wrong`, `hint`][index], index + 1);
        if (focusInput) input.focus();
    }

    function showDone() {
        pass = `done`;
        setCoach(`done`, 5);
        round.hidden = true;
        hintButton.hidden = true;
        checkButton.hidden = true;
        doneButton.hidden = false;
        doneButton.focus();
    }

    function advance() {
        const word = current();
        if (pass === `main`) {
            if (usedHelp) retryList.push(word);
            index++;
            if (index < WORDS.length) { showWord(true); return; }
        } else {
            retryList.shift();
            if (usedHelp) retryList.push(word);   // helped again: it keeps coming back, as on the real page
        }
        if (retryList.length > 0) { pass = `retry`; showWord(true); return; }
        showDone();
    }

    function check() {
        const word = current();
        const typed = input.value;
        if (canonical(typed) === ``) { say(`tutorial.write.empty`, `bad`); input.focus(); return; }
        if (canonical(typed) === canonical(word.hawaiian)) {
            say(`tutorial.write.correct`, `good`);
            advance();
            return;
        }
        // Same letters, but a kahakō or ʻokina is missing or wrong
        const nearMiss = normalize(typed.normalize(`NFC`)) === normalize(word.hawaiian);
        say(nearMiss ? `writing.popup.nearMiss` : `writing.popup.incorrect`, `bad`);
        input.focus();
    }

    function hint() {
        const word = current();
        if (hintStage === 3) { advance(); return; }
        hintStage++;
        usedHelp = true;
        if (hintStage === 1) hintDisplay.textContent = hintText(word.hawaiian, false);
        else if (hintStage === 2) { hintDisplay.textContent = hintText(word.hawaiian, true); labelHint(`writing.giveUp`); }
        else { hintDisplay.textContent = word.hawaiian; labelHint(`writing.continue`); }
        input.focus();
    }

    checkButton.addEventListener(`click`, check);
    hintButton.addEventListener(`click`, hint);
    doneButton.addEventListener(`click`, close);
    closeButton.addEventListener(`click`, close);
    backdrop.addEventListener(`click`, event => { if (event.target === backdrop) close(); });

    function focusables() {
        return [...dialog.querySelectorAll(`button:not([hidden]), input:not([hidden])`)]
            .filter(node => node.offsetParent !== null && !node.disabled);
    }

    // Keys are handled here first and never reach the page behind the dialog (the writing page grades on Enter), including keys typed
    // into our own input. Stopping propagation does not cancel the default action, so characters still land in the input and
    // Enter/Space still press a focused dialog button.
    function onKey(event) {
        event.stopImmediatePropagation();
        if (event.isComposing) return;
        if (event.key === `Escape`) {
            event.preventDefault();
            if (keyboard.isOpen && keyboard.isOpen()) { keyboard.close(); input.focus(); return; }
            close();
            return;
        }
        if (event.key === `Tab`) {
            const list = focusables();
            if (list.length === 0) return;
            const first = list[0];
            const last = list[list.length - 1];
            const active = document.activeElement;
            if (!dialog.contains(active)) { event.preventDefault(); first.focus(); }
            else if (event.shiftKey && (active === first || active === title)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
            return;
        }
        if (event.key === `Enter` && event.target === input) {
            event.preventDefault();
            check();
        }
    }
    window.addEventListener(`keydown`, onKey, true);

    // The page behind calls wordInput.focus() on its own; pull focus back if it escapes
    function onFocusIn(event) {
        if (!dialog.contains(event.target)) (round.hidden ? doneButton : input).focus();
    }
    document.addEventListener(`focusin`, onFocusIn, true);

    function close() {
        if (!teardown) return;
        window.removeEventListener(`keydown`, onKey, true);
        document.removeEventListener(`focusin`, onFocusIn, true);
        backdrop.remove();
        document.body.classList.remove(`tut-open`);
        teardown = null;
        if (returnTo && typeof returnTo.focus === `function`) returnTo.focus();
    }
    teardown = close;

    dialog.classList.toggle(`wtut-reduced`, prefersReducedMotion());
    doneButton.hidden = true;
    showWord(false);
    title.focus();
    return true;
}
