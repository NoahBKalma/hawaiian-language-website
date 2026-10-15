// Site language (English / ʻŌlelo Hawaiʻi). The ONLY importer of ./i18n-strings.js (bump ?v= there after a
// translation import); every other module imports the bare "/scripts/i18n.js" so there is one module instance.
// Storage: olelo:siteLang = "en" | "haw". The inline head bootstrap (scripts/i18n-bootstrap.txt) mirrors resolveLang.
import { STRINGS } from "./i18n-strings.js?v=2";
import { isFakeFill, fakeWrap } from "./i18n-fake-fill.mjs";

const KEY = `olelo:siteLang`;
const WRITING_KEY = `olelo:lang:writing`;
const EVENT = `olelo:langchange`;
const hasDom = typeof document !== `undefined`;

function isDev() {
    return typeof location !== `undefined` && (location.hostname === `localhost` || location.hostname === `127.0.0.1`);
}

function browserStore() {
    try { return localStorage; } catch { return null; }
}

// Pure: decides the saved language from a Storage-like { getItem, setItem, removeItem }. With no valid saved
// language it migrates once from the writing page's old "Set names" pref, saves the result and deletes that pref.
export function resolveLang(store) {
    let lang;
    try {
        lang = store.getItem(KEY);
        if (lang !== `en` && lang !== `haw`) {
            let writing;
            try { writing = JSON.parse(store.getItem(WRITING_KEY)); } catch { /* not JSON */ }
            lang = writing === `hawaiian` ? `haw` : `en`;
            store.setItem(KEY, lang);
            store.removeItem(WRITING_KEY);
        }
    } catch { /* storage blocked */ }
    return lang === `haw` ? `haw` : `en`;
}

// Current site language, read from <html data-lang> (set by the bootstrap and setLang).
export function getLang() {
    return hasDom && document.documentElement.dataset.lang === `haw` ? `haw` : `en`;
}

const warned = new Set();

// Pure core of t(): haw -> en -> key, {name} interpolation, NFC. opts: { strings, fake } (for tests/tools).
export function translate(key, vars, lang, opts = {}) {
    const table = opts.strings || STRINGS;
    const entry = table[key];
    let text;
    if (!entry) {
        if (!warned.has(key) && (opts.warn ?? isDev())) { warned.add(key); console.warn(`[i18n] unknown key: ${key}`); }
        text = key;
    } else if (lang === `haw` && entry.haw) text = entry.haw;
    else text = entry.en;
    if (vars) text = text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
    text = text.normalize(`NFC`);
    return entry && lang === `haw` && !entry.haw && opts.fake ? fakeWrap(text) : text;
}

const fakeOn = () => typeof location !== `undefined` && isFakeFill(location.search);

export function t(key, vars) {
    return translate(key, vars, getLang(), { fake: fakeOn() });
}

// True when t(key) would currently render real Hawaiian (used to set lang="haw" on the element).
function hasHaw(key) {
    return getLang() === `haw` && !!STRINGS[key]?.haw;
}

// True when the table has this key (lets other modules pick between optional templates without importing the table).
export function hasKey(key) {
    return Object.hasOwn(STRINGS, key);
}

export function onLangChange(fn) {
    if (!hasDom) return () => {};
    const handler = e => fn(e.detail.lang);
    document.addEventListener(EVENT, handler);
    return () => document.removeEventListener(EVENT, handler);
}

const ATTRS = [`title`, `aria-label`, `alt`, `placeholder`];

function within(root, selector) {
    const list = [...root.querySelectorAll(selector)];
    if (root.matches && root.matches(selector)) list.unshift(root);
    return list;
}

function setText(el, value, key) {
    if (el.textContent !== value) el.textContent = value;
    markLang(el, key);
}
function setHtml(el, value, key) {
    if (el.innerHTML !== value) el.innerHTML = value;
    markLang(el, key);
}
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function markLang(el, key) {
    if (hasHaw(key)) { if (el.getAttribute(`lang`) !== `haw`) el.setAttribute(`lang`, `haw`); }
    else if (el.getAttribute(`lang`) === `haw`) el.removeAttribute(`lang`);
}
function varsOf(el) {
    try { return el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : undefined; } catch { return undefined; }
}

// Idempotent: writes only values that differ. Safe to call on document or on a component after each render.
export function applyI18n(root = document) {
    if (!hasDom || !root) return;
    for (const el of within(root, `[data-i18n]`)) setText(el, t(el.dataset.i18n, varsOf(el)), el.dataset.i18n);
    for (const el of within(root, `[data-i18n-html]`)) setHtml(el, t(el.dataset.i18nHtml, varsOf(el)), el.dataset.i18nHtml);
    for (const attr of ATTRS) {
        const data = `data-i18n-${attr}`;
        for (const el of within(root, `[${data}]`)) setAttr(el, attr, t(el.getAttribute(data), varsOf(el)));
    }
    for (const el of within(root, `[data-i18n-doc-title]`)) {
        const value = t(el.dataset.i18nDocTitle);
        if (el.textContent !== value) el.textContent = value;
    }
    for (const el of within(root, `[data-i18n-meta]`)) setAttr(el, `content`, t(el.dataset.i18nMeta));
    document.documentElement.classList.remove(`i18n-pending`);
}

export function setLang(lang) {
    if (lang !== `en` && lang !== `haw`) return;
    const store = browserStore();
    try { store?.setItem(KEY, lang); } catch { /* storage blocked */ }
    if (!hasDom) return;
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    applyI18n(document);
    document.dispatchEvent(new CustomEvent(EVENT, { detail: { lang } }));
}

if (hasDom) {
    // Safety net when a page lacks the bootstrap: derive lang/data-lang once, then translate static markup.
    const root = document.documentElement;
    if (!root.dataset.lang) {
        const store = browserStore();
        const lang = store ? resolveLang(store) : `en`;
        root.lang = lang;
        root.dataset.lang = lang;
    }
    if (document.readyState === `loading`) document.addEventListener(`DOMContentLoaded`, () => applyI18n(document), { once: true });
    else applyI18n(document);
}
