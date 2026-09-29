import { achievementIcon } from '/scripts/achievement-icons.js';

const SHOW_MS = 4000;
const MAX_QUEUE = 3;

let container = null;
let queue = [];
let showing = false;

function getContainer() {
    if (container) return container;
    container = document.createElement(`div`);
    container.id = `achievement-toasts`;
    container.setAttribute(`role`, `status`);
    container.setAttribute(`aria-live`, `polite`);
    document.body.appendChild(container);
    return container;
}

function buildToast(item) {
    const toast = document.createElement(`div`);
    toast.className = `achievement-toast`;

    const icon = document.createElement(`div`);
    icon.className = `toast-icon`;
    icon.innerHTML = achievementIcon(item.more ? `stack` : item.icon);

    const text = document.createElement(`div`);
    text.className = `toast-text`;
    const label = document.createElement(`span`);
    label.className = `toast-label`;
    label.textContent = `Achievement unlocked`;
    const title = document.createElement(`strong`);
    title.className = `toast-title`;
    title.textContent = item.title;
    text.append(label, title);

    const dismiss = document.createElement(`button`);
    dismiss.type = `button`;
    dismiss.className = `toast-dismiss`;
    dismiss.setAttribute(`aria-label`, `Dismiss`);
    dismiss.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
    // Writing practice swallows Enter globally, so keep key events on the button
    dismiss.addEventListener(`keydown`, e => e.stopPropagation());

    toast.append(icon, text, dismiss);
    return { toast, dismiss };
}

function showNext() {
    if (queue.length === 0) { showing = false; return; }
    showing = true;
    const { toast, dismiss } = buildToast(queue.shift());
    getContainer().appendChild(toast);
    requestAnimationFrame(() => toast.classList.add(`is-visible`));

    let remaining = SHOW_MS;
    let started = 0;
    let timer = null;
    let done = false;

    const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        toast.classList.remove(`is-visible`);
        const ms = parseFloat(getComputedStyle(toast).transitionDuration) * 1000 || 0;
        setTimeout(() => { toast.remove(); showNext(); }, ms);
    };
    let running = false;
    const hovered = { mouse: false, focus: false };
    const start = () => {
        if (running || done || hovered.mouse || hovered.focus) return;
        running = true;
        started = Date.now();
        timer = setTimeout(finish, remaining);
    };
    const pause = () => {
        if (!running) return;
        running = false;
        clearTimeout(timer);
        remaining -= Date.now() - started;
    };

    // Timer only runs while the toast is neither hovered nor focused
    toast.addEventListener(`mouseenter`, () => { hovered.mouse = true; pause(); });
    toast.addEventListener(`mouseleave`, () => { hovered.mouse = false; start(); });
    toast.addEventListener(`focusin`, () => { hovered.focus = true; pause(); });
    toast.addEventListener(`focusout`, () => { hovered.focus = false; start(); });
    dismiss.addEventListener(`click`, finish);
    start();
}

// list items: { id, title, icon, ladder, tier }
export function showAchievementToasts(list) {
    if (!Array.isArray(list) || list.length === 0) return;
    const room = Math.max(MAX_QUEUE - queue.length, 0);
    const items = list.slice(0, room);
    const extra = list.length - items.length;
    if (extra > 0 && items.length > 0) {
        // Last slot summarises the rest instead of listing them
        items[items.length - 1] = { title: `+${extra + 1} more achievements, see your profile`, more: true };
    }
    queue.push(...items);
    if (!showing) showNext();
}
