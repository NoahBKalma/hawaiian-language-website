// "How writing practice works" tutorial: a guided mini-round on three sample words (English prompt -> type the Hawaiian), in its own
// dialog. Same dialog look, focus handling and reduced-motion rules as flashcard-tutorial.js / spaced-tutorial.js (it reuses the
// .tut* styles from flashcard-tutorial.css, plus a few .wtut* bits from writing-tutorial.css).
// It records NOTHING: no requests, no review-state writes, and it never touches the real deck behind it.
import { canonical, normalize, prefersReducedMotion } from "/scripts/word-utils.js";
import "/components/hawaiian-keyboard.js";

const WORDS = [
    { english: `water`, hawaiian: `wai` },
    { english: `house`, hawaiian: `hale` },
    { english: `family`, hawaiian: `ʻohana` }
].map(word => ({ ...word, hawaiian: word.hawaiian.normalize(`NFC`) }));

const TOTAL_STEPS = 5;

// Coach text per phase. Constants only (the Hawaiian bits carry lang="haw"), so innerHTML is safe here.
const haw = text => `<span lang="haw">${text}</span>`;
const COACH = {
    prompt: { title: `Read the prompt`,
        html: `The English word is on the card. Type its Hawaiian in the box, then press Enter or Check. Try ${haw(`wai`)}.` },
    wrong: { title: `Wrong answers are free`,
        html: `A wrong answer just says try again. Type something else first (like "home") and press Enter, then type ${haw(`hale`)}. Capital letters and extra spaces do not matter.` },
    hint: { title: `Stuck? Use Hint`,
        html: `Press Hint: first blanks for each letter, then the first letter, then Give up shows the answer. Or type ${haw(`ʻohana`)} yourself.` },
    retry: { title: `Missed words come back`,
        html: `Words you needed help on return in a retry pass until you get them unaided. Type ${haw(`ohana`)} with no ʻokina and press Enter to see the near-miss message, then use the ${haw(`ā`)} button to add the ʻ.` },
    done: { title: `That is the whole round`,
        html: `Kahakō and ʻokina count, but a missing one gets its own "Almost!" message. Nothing from this practice was saved or counted.` }
};

let teardown = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
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
    const title = el(`h2`, ``, `How writing practice works`);
    title.id = `wtut-title`;
    title.tabIndex = -1;
    const closeButton = el(`button`, `tut-close`, `×`);
    closeButton.type = `button`;
    closeButton.setAttribute(`aria-label`, `Close the tutorial`);
    head.append(title, closeButton);

    const stepLabel = el(`p`, `tut-step-label`);
    const stepTitle = el(`h3`, `wtut-step-title`);
    const coach = el(`p`, `tut-step-text wtut-coach`);
    const live = el(`div`, `visually-hidden`);
    live.setAttribute(`role`, `status`);
    live.setAttribute(`aria-live`, `polite`);

    const round = el(`div`, `wtut-round`);
    const promptLabel = el(`p`, `wtut-prompt-label`, `Type the Hawaiian for`);
    const prompt = el(`p`, `wtut-prompt`);
    prompt.id = `wtut-prompt`;
    const retryTag = el(`p`, `wtut-retry-tag`, `Retry pass`);
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
    const hintButton = el(`button`, `btn btn-quiet btn-sm`, `Hint`);
    hintButton.type = `button`;
    const checkButton = el(`button`, `btn btn-primary btn-sm`, `Check`);
    checkButton.type = `button`;
    const doneButton = el(`button`, `btn btn-primary btn-sm`, `Got it`);
    doneButton.type = `button`;
    actions.append(hintButton, checkButton, doneButton);

    dialog.append(head, stepLabel, stepTitle, coach, live, round, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.body.classList.add(`tut-open`);

    const current = () => (pass === `main` ? WORDS[index] : retryList[0]);

    function say(message, kind) {
        feedback.textContent = message;
        feedback.classList.toggle(`is-bad`, kind === `bad`);
        feedback.classList.toggle(`is-good`, kind === `good`);
    }

    function setCoach(key, stepNo) {
        const entry = COACH[key];
        stepLabel.textContent = `Step ${stepNo} of ${TOTAL_STEPS}`;
        stepTitle.textContent = entry.title;
        coach.innerHTML = entry.html;
        live.textContent = ``;
        setTimeout(() => { live.textContent = `${stepLabel.textContent}. ${entry.title}. ${coach.textContent}`; }, 30);
    }

    function resetHint() {
        hintStage = 0;
        usedHelp = false;
        hintDisplay.textContent = ``;
        hintButton.textContent = `Hint`;
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
        if (canonical(typed) === ``) { say(`Type an answer first.`, `bad`); input.focus(); return; }
        if (canonical(typed) === canonical(word.hawaiian)) {
            say(`Correct!`, `good`);
            advance();
            return;
        }
        // Same letters, but a kahakō or ʻokina is missing or wrong
        const nearMiss = normalize(typed.normalize(`NFC`)) === normalize(word.hawaiian);
        say(nearMiss ? `Almost! Check your kahakō and ʻokina.` : `Incorrect. Try again.`, `bad`);
        input.focus();
    }

    function hint() {
        const word = current();
        if (hintStage === 3) { advance(); return; }
        hintStage++;
        usedHelp = true;
        if (hintStage === 1) hintDisplay.textContent = hintText(word.hawaiian, false);
        else if (hintStage === 2) { hintDisplay.textContent = hintText(word.hawaiian, true); hintButton.textContent = `Give up`; }
        else { hintDisplay.textContent = word.hawaiian; hintButton.textContent = `Continue`; }
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
