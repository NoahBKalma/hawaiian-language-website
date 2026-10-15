/* Warm tooltip: reusable label for icon-only buttons (vanilla port of the "WarmTooltip" pattern).

   Markup: add `data-tip` to any element. Label = data-tip value, else its title, else aria-label,
   so i18n-updated attributes flow through. Native `title` is stripped on hover to avoid a double tooltip.
     data-tip-shortcut="←"    keycap beside the label
     data-tip-side="top|bottom|left|right"   (default top)
     data-tip-size="sm|md|lg"                (default md)
     data-tip-gap="8"  data-tip-delay="400"  data-tip-arrow="off"  data-tip-disabled
   JS: import { warmTooltip, configureWarmTooltips, resetWarmTooltips } from "/scripts/warm-tooltip.js".
   Importing the module installs the (delegated) listeners once; nothing else is needed.

   Behaviour: a cold hover waits `delay`; after a label closes the group stays warm for `warmWindow`,
   so the next trigger shows at once and the one shared label glides over (`travel` ms). Keyboard focus
   (focus-visible) opens instantly, Escape closes, touch opens on long press (the click is swallowed).
   Pair with styles/warm-tooltip.css. */

const DEFAULTS = {
    delay: 400, warmWindow: 300, travel: 320, side: `top`, size: `md`, gap: 8, arrow: true,
    radius: 10, popDuration: 160, popScale: .94, popBlur: 4, longPress: 500,
};
const SIZES = { sm: { font: 11.5, px: 8, py: 5 }, md: { font: 12.5, px: 10, py: 6 }, lg: { font: 13.5, px: 12, py: 7 } };
const ORIGIN = { top: `center bottom`, bottom: `center top`, left: `right center`, right: `left center` };
const RISE = 4;
const MARGIN = 8;
const HOLD_SLOP = 10;
const GRACE = 80;
const SWAP_SHIFT = 10;
const SELECTOR = `[data-tip]`;

const config = { ...DEFAULTS };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const now = () => performance.now();
const isHoriz = (side) => side === `top` || side === `bottom`;
const reduced = () => matchMedia(`(prefers-reduced-motion: reduce)`).matches;

let root, box, textEl, labelEl, kbdEl, arrowEl;
let state = `closed`;            // closed | open | closing
let current = null;              // { el, side, gap, ... }
let mode = `cold`;
let instantOpen = false;
let warmUntil = -Infinity;
let openTimer, closeTimer, leaveTimer, pressTimer;
let press0 = null;
let suppressClick = false;
let hoverEl = null;
let describedBefore = null;

function build() {
    if (root) return;
    root = document.createElement(`span`);
    root.className = `warm-tooltip`;
    root.id = `warm-tooltip`;
    root.setAttribute(`role`, `tooltip`);
    root.innerHTML = `<span class="warm-tooltip__box"><span class="warm-tooltip__text"><span class="warm-tooltip__label"></span><kbd class="warm-tooltip__kbd" hidden></kbd></span><span class="warm-tooltip__arrow" aria-hidden="true"></span></span>`;
    box = root.firstElementChild;
    textEl = box.querySelector(`.warm-tooltip__text`);
    labelEl = box.querySelector(`.warm-tooltip__label`);
    kbdEl = box.querySelector(`.warm-tooltip__kbd`);
    arrowEl = box.querySelector(`.warm-tooltip__arrow`);
    document.body.append(root);
}

const num = (v, fallback) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

// Label text for a trigger. Strips the native title (it would pop up beside ours) but remembers it.
function contentOf(el) {
    if (el.hasAttribute(`title`)) { el.dataset.tipTitle = el.getAttribute(`title`); el.removeAttribute(`title`); }
    return (el.dataset.tip || el.dataset.tipTitle || el.getAttribute(`aria-label`) || ``).trim();
}

function optionsOf(el) {
    const d = el.dataset;
    const size = SIZES[d.tipSize] ? d.tipSize : config.size;
    const side = ORIGIN[d.tipSide] ? d.tipSide : config.side;
    return {
        el, side, size, ...SIZES[size],
        content: contentOf(el),
        shortcut: d.tipShortcut || ``,
        gap: num(d.tipGap, config.gap),
        arrow: d.tipArrow !== `off` && config.arrow,
        delay: num(d.tipDelay, config.delay),
    };
}

function anchorOf(rect, side, gap) {
    if (side === `top`) return [rect.left + rect.width / 2, rect.top - gap];
    if (side === `bottom`) return [rect.left + rect.width / 2, rect.bottom + gap];
    if (side === `left`) return [rect.left - gap, rect.top + rect.height / 2];
    return [rect.right + gap, rect.top + rect.height / 2];
}

// Top-left of the label for an anchor point, kept inside the viewport
function layoutOf(x, y, w, h, side) {
    if (isHoriz(side)) {
        return { X: clamp(x - w / 2, MARGIN, Math.max(MARGIN, innerWidth - MARGIN - w)), Y: side === `top` ? y - h : y };
    }
    return { X: side === `left` ? x - w : x, Y: clamp(y - h / 2, MARGIN, Math.max(MARGIN, innerHeight - MARGIN - h)) };
}

function place(c) {
    const [ax, ay] = anchorOf(c.el.getBoundingClientRect(), c.side, c.gap);
    const w = c.w, h = c.h;
    const { X, Y } = layoutOf(ax, ay, w, h, c.side);
    root.style.transform = `translate(${X}px, ${Y}px)`;
    root.style.width = `${w}px`;
    root.style.height = `${h}px`;
    const horiz = isHoriz(c.side);
    arrowEl.style.left = horiz ? `${clamp(ax - X, 10, w - 10)}px` : ``;
    arrowEl.style.top = horiz ? `` : `${clamp(ay - Y, 10, h - 10)}px`;
}

function applyStyle(c) {
    const s = root.style;
    const rise = c.side === `top` || c.side === `left` ? RISE : -RISE;
    s.setProperty(`--wt-radius`, `${config.radius}px`);
    s.setProperty(`--wt-font`, `${c.font}px`);
    s.setProperty(`--wt-origin`, ORIGIN[c.side]);
    s.setProperty(`--wt-pop-ms`, `${config.popDuration}ms`);
    s.setProperty(`--wt-exit-ms`, `${Math.round(config.popDuration * .8)}ms`);
    s.setProperty(`--wt-scale`, String(config.popScale));
    s.setProperty(`--wt-blur`, `${config.popBlur}px`);
    s.setProperty(`--wt-rise-x`, isHoriz(c.side) ? `0px` : `${rise}px`);
    s.setProperty(`--wt-rise-y`, isHoriz(c.side) ? `${rise}px` : `0px`);
    s.setProperty(`--wt-travel`, `${config.travel}ms`);
    root.dataset.side = c.side;
    root.dataset.arrow = c.arrow ? `on` : `off`;
}

function setContent(c) {
    labelEl.textContent = c.content;
    kbdEl.textContent = c.shortcut;
    kbdEl.hidden = !c.shortcut;
    // text is absolutely centred, so its size is the label's natural size
    c.w = Math.ceil(textEl.offsetWidth) + c.px * 2;
    c.h = Math.ceil(textEl.offsetHeight) + c.py * 2;
}

function describe(el) {
    undescribe();
    describedBefore = { el, value: el.getAttribute(`aria-describedby`) };
    el.setAttribute(`aria-describedby`, root.id);
}

function undescribe() {
    if (!describedBefore) return;
    const { el, value } = describedBefore;
    if (value === null) el.removeAttribute(`aria-describedby`); else el.setAttribute(`aria-describedby`, value);
    describedBefore = null;
}

const isWarm = () => state !== `closed` || now() < warmUntil;

function show(el, how) {
    const opts = optionsOf(el);
    if (!opts.content || !el.isConnected || el.hasAttribute(`data-tip-disabled`)) return;
    build();
    clearTimeout(closeTimer);
    clearTimeout(leaveTimer);
    const prev = current;
    const wasOpen = state === `open`;
    const moving = wasOpen && prev && prev.el !== el;

    let dir = 1;
    if (moving) {
        const [px, py] = anchorOf(prev.el.getBoundingClientRect(), prev.side, prev.gap);
        const [nx, ny] = anchorOf(el.getBoundingClientRect(), opts.side, opts.gap);
        dir = Math.sign(isHoriz(opts.side) ? nx - px : ny - py) || 1;
    }

    current = opts;
    const glide = moving && !reduced() && config.travel > 0;
    mode = wasOpen ? (how === `instant` ? `instant` : `move`) : how;
    instantOpen = how === `instant`;

    root.style.display = `block`;
    applyStyle(opts);
    setContent(opts);
    root.classList.toggle(`is-gliding`, glide);
    if (!glide) root.classList.remove(`is-gliding`);
    place(opts);
    describe(el);

    if (wasOpen) {
        root.classList.add(`is-open`);
        if (moving && !reduced()) {
            const horiz = isHoriz(opts.side);
            const from = `translate(${horiz ? SWAP_SHIFT * dir : 0}px, ${horiz ? 0 : SWAP_SHIFT * dir}px)`;
            textEl.animate([{ opacity: 0, filter: `blur(3px)`, transform: `translate(-50%, -50%) ${from}` },
                { opacity: 1, filter: `blur(0)`, transform: `translate(-50%, -50%)` }],
                { duration: 140, easing: `cubic-bezier(.23, 1, .32, 1)` });
        }
    } else {
        // cold pops in; warm / keyboard focus appears at once
        const pop = mode === `cold` && !reduced();
        root.classList.toggle(`is-instant`, !pop);
        root.classList.remove(`is-open`);
        void root.offsetWidth;   // commit the closed state so the pop transition runs
        root.classList.add(`is-open`);
    }
    state = `open`;
}

function finishClose() {
    state = `closed`;
    current = null;
    if (root) { root.style.display = `none`; root.classList.remove(`is-open`, `is-gliding`, `is-instant`); }
    undescribe();
}

function beginClose(instant) {
    if (state !== `open` || !current) return;
    state = `closing`;
    warmUntil = now() + config.warmWindow;
    if (instant || reduced()) { finishClose(); return; }
    root.classList.remove(`is-open`, `is-gliding`);
    closeTimer = setTimeout(finishClose, Math.round(config.popDuration * .8));
}

function hide(el, instant) {
    clearTimeout(openTimer);
    if (!current || current.el !== el || state !== `open`) return;
    clearTimeout(leaveTimer);
    if (instant || instantOpen) { beginClose(true); return; }
    leaveTimer = setTimeout(() => beginClose(false), GRACE);
}

function arm(el) {
    clearTimeout(openTimer);
    if (isWarm()) { show(el, `warm`); return; }
    openTimer = setTimeout(() => show(el, `cold`), optionsOf(el).delay);
}

function cancelPress() {
    clearTimeout(pressTimer);
    press0 = null;
}

function follow() {
    if (state !== `open` || !current) return;
    if (!current.el.isConnected) { beginClose(true); return; }
    root.classList.remove(`is-gliding`);
    place(current);
}

function install() {
    const trigger = (e) => (e.target instanceof Element ? e.target.closest(SELECTOR) : null);

    document.addEventListener(`pointerover`, (e) => {
        const el = trigger(e);
        if (!el || e.pointerType === `touch` || e.buttons !== 0 || el.contains(e.relatedTarget)) return;
        hoverEl = el;
        arm(el);
    });
    document.addEventListener(`pointerout`, (e) => {
        const el = trigger(e);
        if (!el || e.pointerType === `touch` || el.contains(e.relatedTarget)) return;
        if (hoverEl === el) hoverEl = null;
        hide(el, false);
    });
    document.addEventListener(`pointerdown`, (e) => {
        const el = trigger(e);
        // tapping anywhere else dismisses an open label
        if (current && state === `open` && current.el !== el) hide(current.el, false);
        if (!el) return;
        if (e.pointerType === `mouse`) { clearTimeout(openTimer); hide(el, false); return; }
        press0 = { x: e.clientX, y: e.clientY, id: e.pointerId };
        pressTimer = setTimeout(() => {
            suppressClick = true;
            press0 = null;
            show(el, `cold`);
        }, optionsOf(el).longPress ?? config.longPress);
    });
    document.addEventListener(`pointermove`, (e) => {
        if (press0 && press0.id === e.pointerId && Math.hypot(e.clientX - press0.x, e.clientY - press0.y) > HOLD_SLOP) cancelPress();
    });
    document.addEventListener(`pointerup`, cancelPress);
    document.addEventListener(`pointercancel`, cancelPress);
    document.addEventListener(`contextmenu`, (e) => { if (press0 || (suppressClick && trigger(e))) e.preventDefault(); }, true);
    document.addEventListener(`click`, (e) => {
        if (!suppressClick) return;
        suppressClick = false;
        if (!trigger(e)) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);
    document.addEventListener(`focusin`, (e) => {
        const el = trigger(e);
        if (el && el.matches(`:focus-visible`)) { clearTimeout(openTimer); show(el, `instant`); }
    });
    document.addEventListener(`focusout`, (e) => { const el = trigger(e); if (el) hide(el, true); });
    document.addEventListener(`keydown`, (e) => {
        if (e.key === `Escape` && state === `open` && current) hide(current.el, true);
    });
    addEventListener(`scroll`, follow, { capture: true, passive: true });
    addEventListener(`resize`, follow);
    document.addEventListener(`visibilitychange`, () => {
        if (document.visibilityState === `hidden` && current) { clearTimeout(openTimer); hide(current.el, true); }
    });
}

/** Change the shared defaults (delay, warmWindow, travel, popDuration, popScale, popBlur, radius, gap, side, size, arrow, longPress). */
export function configureWarmTooltips(options = {}) {
    Object.assign(config, options);
}

/** Close any open label and make the next hover cold again. */
export function resetWarmTooltips() {
    clearTimeout(openTimer);
    if (current) hide(current.el, true);
    warmUntil = -Infinity;
}

/** Give an element a tooltip from script: warmTooltip(btn, { content, shortcut, side, size, gap, arrow }). */
export function warmTooltip(el, { content, shortcut, side, size, gap, delay, arrow } = {}) {
    el.dataset.tip = content ?? el.dataset.tip ?? ``;
    if (shortcut) el.dataset.tipShortcut = shortcut;
    if (side) el.dataset.tipSide = side;
    if (size) el.dataset.tipSize = size;
    if (gap !== undefined) el.dataset.tipGap = String(gap);
    if (delay !== undefined) el.dataset.tipDelay = String(delay);
    if (arrow === false) el.dataset.tipArrow = `off`;
    return el;
}

if (!window.__warmTooltipInstalled) {
    window.__warmTooltipInstalled = true;
    install();
}
