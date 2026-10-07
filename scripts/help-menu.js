// Help (?) menu next to the fullscreen button on the flashcards and writing pages.
//  - the trigger carries data-tutorial-page="flashcards|writing"; its menu has that page's tutorial plus the spaced repetition tutorial
// Both tutorials return focus to the trigger we pass them when they close.
// The page's own tutorial also auto-opens once on the first visit (first-visit.js).
import { openSpacedTutorial } from "/scripts/spaced-tutorial.js";
import { autoOpenFirstVisit, noteManualOpen } from "/scripts/first-visit.js";

const SPACED = { label: `How spaced repetition works`, run: (trigger) => openSpacedTutorial(trigger) };

const PAGES = {
    flashcards: { label: `How flashcards work`, open: async (t) => { const mod = await import(`/scripts/flashcard-tutorial.js`); return mod.openTutorial(t); } },
    writing: { label: `How writing practice works`, open: async (t) => { const mod = await import(`/scripts/writing-tutorial.js`); return mod.openWritingTutorial(t); } }
};

const trigger = document.querySelector(`[data-tutorial-page]`);
const page = trigger && PAGES[trigger.dataset.tutorialPage] ? trigger.dataset.tutorialPage : null;
if (trigger && page) {
    setup(trigger);
    autoOpenFirstVisit(page, PAGES[page].open, trigger);
}

async function setup(button) {
    const items = [{
        label: PAGES[page].label,
        run: async (t) => { await PAGES[page].open(t); noteManualOpen(page); }
    }, SPACED];

    button.setAttribute(`aria-label`, `Help`);
    button.setAttribute(`title`, `Help`);
    button.setAttribute(`aria-haspopup`, `menu`);
    button.setAttribute(`aria-expanded`, `false`);

    let menu = null;
    let nodes = [];

    function place() {
        const r = button.getBoundingClientRect();
        const margin = 8;
        const width = Math.min(menu.offsetWidth, window.innerWidth - 2 * margin);
        let left = r.right - width;                       // right edges line up
        left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
        menu.style.left = `${left}px`;
        const height = menu.offsetHeight;
        const below = r.bottom + 6;
        // open upward when there is no room below (the options row sits near the bottom of the screen)
        const top = below + height > window.innerHeight - margin ? Math.max(margin, r.top - 6 - height) : below;
        menu.style.top = `${top}px`;
    }

    function focusItem(index) {
        const i = (index + nodes.length) % nodes.length;
        nodes[i].focus();
    }

    function open(focusFirst) {
        if (menu) return;
        closeOthers();
        menu = document.createElement(`div`);
        menu.className = `help-menu`;
        menu.setAttribute(`role`, `menu`);
        menu.setAttribute(`aria-label`, `Help`);
        nodes = items.map((item) => {
            const node = document.createElement(`button`);
            node.type = `button`;
            node.className = `help-menu-item`;
            node.setAttribute(`role`, `menuitem`);
            node.tabIndex = -1;
            node.textContent = item.label;
            node.addEventListener(`click`, () => { close(false); item.run(button); });
            menu.append(node);
            return node;
        });
        menu.addEventListener(`keydown`, onMenuKey);
        document.body.append(menu);
        button.setAttribute(`aria-expanded`, `true`);
        place();
        if (focusFirst) focusItem(0);
        document.addEventListener(`pointerdown`, onOutside, true);
        window.addEventListener(`resize`, place);
        window.addEventListener(`scroll`, place, true);
        document.addEventListener(`help-menu:open`, onOtherOpen);
    }

    function close(returnFocus = true) {
        if (!menu) return;
        menu.remove();
        menu = null;
        nodes = [];
        button.setAttribute(`aria-expanded`, `false`);
        document.removeEventListener(`pointerdown`, onOutside, true);
        window.removeEventListener(`resize`, place);
        window.removeEventListener(`scroll`, place, true);
        document.removeEventListener(`help-menu:open`, onOtherOpen);
        if (returnFocus) button.focus();
    }

    // only one menu at a time
    function closeOthers() { document.dispatchEvent(new CustomEvent(`help-menu:open`, { detail: button })); }
    function onOtherOpen(event) { if (event.detail !== button) close(false); }

    function onOutside(event) {
        if (menu && !menu.contains(event.target) && !button.contains(event.target)) close(false);
    }

    function onMenuKey(event) {
        const current = nodes.indexOf(document.activeElement);
        switch (event.key) {
            case `ArrowDown`: event.preventDefault(); focusItem(current + 1); break;
            case `ArrowUp`: event.preventDefault(); focusItem(current - 1); break;
            case `Home`: event.preventDefault(); focusItem(0); break;
            case `End`: event.preventDefault(); focusItem(nodes.length - 1); break;
            case `Escape`: event.preventDefault(); event.stopPropagation(); close(true); break;
            case `Tab`: close(false); break;   // focus moves on naturally
            default: break;
        }
    }

    button.addEventListener(`click`, (event) => {
        // keyboard activation (detail 0) focuses the first item; mouse just opens
        if (menu) close(true); else open(event.detail === 0);
    });
    button.addEventListener(`keydown`, (event) => {
        if (event.key === `ArrowDown` && !menu) { event.preventDefault(); open(true); }
        else if (event.key === `Escape` && menu) { event.preventDefault(); event.stopPropagation(); close(true); }
    });
}
