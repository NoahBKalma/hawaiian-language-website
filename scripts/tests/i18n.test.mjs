import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), `..`, `..`);
const read = p => readFileSync(join(ROOT, p), `utf8`);
const url = p => pathToFileURL(join(ROOT, p)).href;

const STRINGS = JSON.parse(read(`scripts/i18n-strings.json`));
const i18n = await import(url(`scripts/i18n.js`));
const { resolveLang, translate, getLang } = i18n;
const { isFakeFill } = i18n;
const check = await import(url(`scripts/i18n-tool.mjs`));

// Browser modules import the bare "/scripts/i18n.js"; load a copy whose specifier points at the real file.
function loadBrowserModule(path) {
    const src = read(path).replace(`"/scripts/i18n.js"`, `"${url(`scripts/i18n.js`)}"`);
    const file = join(mkdtempSync(join(tmpdir(), `i18n-test-`)), `module.mjs`);
    writeFileSync(file, src);
    return import(pathToFileURL(file).href);
}

function makeStore(init = {}) {
    const data = { ...init }, log = [];
    return {
        data, log,
        getItem: k => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); log.push([`set`, k, String(v)]); },
        removeItem: k => { delete data[k]; log.push([`remove`, k]); },
    };
}

// ---------- t / translate ----------
test(`translate falls back haw -> en -> key`, () => {
    const strings = { a: { page: `p`, en: `Hello`, haw: `Aloha` }, b: { page: `p`, en: `Only English`, haw: `` } };
    const o = { strings, warn: false };
    assert.equal(translate(`a`, undefined, `haw`, o), `Aloha`);
    assert.equal(translate(`a`, undefined, `en`, o), `Hello`);
    assert.equal(translate(`b`, undefined, `haw`, o), `Only English`);
    assert.equal(translate(`missing.key`, undefined, `haw`, o), `missing.key`);
});

test(`translate interpolates {vars} and leaves unknown ones`, () => {
    const strings = { a: { page: `p`, en: `{n} of {total} for {who}`, haw: `` } };
    assert.equal(translate(`a`, { n: 3, total: `1,000` }, `en`, { strings }), `3 of 1,000 for {who}`);
});

test(`translate returns NFC`, () => {
    const strings = { a: { page: `p`, en: `x`, haw: `ā{v}` } };
    const out = translate(`a`, { v: `ē` }, `haw`, { strings });
    assert.equal(out, `āē`);
    assert.equal(out, out.normalize(`NFC`));
});

test(`fake fill wraps only an empty haw`, () => {
    const strings = { a: { page: `p`, en: `Hi {n}`, haw: `` }, b: { page: `p`, en: `Hi`, haw: `Aloha` } };
    assert.equal(translate(`a`, { n: 1 }, `haw`, { strings, fake: true }), `⟦Hi 1⟧`);
    assert.equal(translate(`b`, undefined, `haw`, { strings, fake: true }), `Aloha`);
    assert.equal(translate(`a`, { n: 1 }, `en`, { strings, fake: true }), `Hi 1`);
    assert.equal(isFakeFill(`?x=1&i18n=fake`), true);
    assert.equal(isFakeFill(`?i18n=fakes`), false);
    assert.equal(isFakeFill(``), false);
});

test(`getLang is en without a document`, () => assert.equal(getLang(), `en`));

// ---------- resolveLang + bootstrap parity ----------
const CASES = [
    { name: `nothing saved`, init: {}, lang: `en` },
    { name: `siteLang haw wins`, init: { "olelo:siteLang": `haw`, "olelo:lang:writing": `"english"` }, lang: `haw` },
    { name: `siteLang en wins over hawaiian writing`, init: { "olelo:siteLang": `en`, "olelo:lang:writing": `"hawaiian"` }, lang: `en` },
    { name: `hawaiian writing migrates`, init: { "olelo:lang:writing": `"hawaiian"` }, lang: `haw` },
    { name: `english writing migrates`, init: { "olelo:lang:writing": `"english"` }, lang: `en` },
    { name: `flashcards alone is not migrated`, init: { "olelo:lang:flashcards": `"hawaiian"` }, lang: `en` },
    { name: `junk siteLang is replaced`, init: { "olelo:siteLang": `fr` }, lang: `en` },
    { name: `writing pref is not JSON`, init: { "olelo:lang:writing": `hawaiian` }, lang: `en` },
];

for (const c of CASES) {
    test(`resolveLang: ${c.name}`, () => {
        const store = makeStore(c.init);
        assert.equal(resolveLang(store), c.lang);
        if (!(`olelo:siteLang` in c.init) || ![`en`, `haw`].includes(c.init[`olelo:siteLang`])) {
            assert.equal(store.data[`olelo:siteLang`], c.lang);
            assert.equal(`olelo:lang:writing` in store.data, false);
        }
        assert.equal(store.data[`olelo:lang:flashcards`], c.init[`olelo:lang:flashcards`]);
    });
}

function runBootstrap(init) {
    const store = makeStore(init);
    const timers = [];
    const classes = new Set();
    const html = { lang: ``, dataset: {}, classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } };
    const body = read(`scripts/i18n-bootstrap.txt`);
    new Function(`document`, `localStorage`, `setTimeout`, body)({ documentElement: html }, store, fn => timers.push(fn));
    return { store, html, classes, timers };
}

test(`bootstrap text is plain JS and has a matching html wrapper`, () => {
    assert.equal(read(`scripts/i18n-bootstrap.html`).trim(), `<script>\n${read(`scripts/i18n-bootstrap.txt`).trim()}\n</script>`);
    assert.ok(read(`scripts/i18n-bootstrap.txt`).split(`\n`).length <= 16);
});

for (const c of CASES) {
    test(`bootstrap parity: ${c.name}`, () => {
        const ref = makeStore(c.init);
        const lang = resolveLang(ref);
        const run = runBootstrap(c.init);
        assert.equal(run.html.dataset.lang, lang);
        assert.equal(run.html.lang, lang);
        assert.deepEqual(run.store.log, ref.log);
        assert.deepEqual(run.store.data, ref.data);
        assert.equal(run.classes.has(`i18n-pending`), lang === `haw`);
        assert.equal(run.timers.length, lang === `haw` ? 1 : 0);
        run.timers.forEach(fn => fn());
        assert.equal(run.classes.has(`i18n-pending`), false);
    });
}

test(`bootstrap survives blocked storage`, () => {
    const classes = new Set();
    const html = { lang: ``, dataset: {}, classList: { add: c => classes.add(c), remove: c => classes.delete(c) } };
    const blocked = { getItem() { throw new Error(`blocked`); } };
    new Function(`document`, `localStorage`, `setTimeout`, read(`scripts/i18n-bootstrap.txt`))({ documentElement: html }, blocked, () => {});
    assert.equal(html.dataset.lang, `en`);
    assert.equal(resolveLang(blocked), `en`);
});

// ---------- card front default ----------
test(`card front default is hawaiian and independent of siteLang`, async () => {
    const store = makeStore({ "olelo:siteLang": `haw` });
    globalThis.localStorage = store;
    try {
        const { getPref } = await import(url(`scripts/prefs.js`));
        assert.equal(getPref(`lang:flashcards`, `hawaiian`), `hawaiian`);
        store.data[`olelo:lang:flashcards`] = JSON.stringify(`english`);
        assert.equal(getPref(`lang:flashcards`, `hawaiian`), `english`);
        assert.equal(store.data[`olelo:siteLang`], `haw`);
    } finally { delete globalThis.localStorage; }
});

// ---------- table shape ----------
test(`table shape: en present, key pattern, one line each, vars match`, () => {
    const keys = Object.keys(STRINGS);
    assert.ok(keys.length > 0);
    assert.equal(new Set(keys).size, keys.length);
    for (const [k, v] of Object.entries(STRINGS)) {
        assert.match(k, /^[A-Za-z0-9]+(\.[A-Za-z0-9_-]+)+$/, k);
        assert.equal(typeof v.en, `string`, k);
        assert.ok(v.en, k);
        assert.equal(typeof v.haw, `string`, k);
        assert.deepEqual(Object.keys(v), [`en`, `haw`], k);
        assert.equal(v.haw, v.haw.normalize(`NFC`), `${k} haw not NFC`);
        const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
        if (v.haw) assert.deepEqual(vars(v.haw), vars(v.en), `${k} placeholders differ`);
    }
    const lines = read(`scripts/i18n-strings.json`).split(`\n`).filter(l => /^\s*"[^"]+":\s*\{/.test(l));
    assert.equal(lines.length, keys.length, `every entry must be on one line`);
    for (const l of lines) assert.match(l, /{"en":".*","haw":".*"},?$/);
    const { entries } = check.parseTable(read(`i18n.csv`));
    assert.equal(read(`scripts/i18n-strings.json`), check.toJson(entries), `scripts/i18n-strings.json is stale; run node scripts/i18n-tool.mjs build`);
});

test(`seeded Hawaiian writing popups are unchanged`, () => {
    assert.equal(STRINGS[`writing.popup.reused`].haw, `Hoʻaʻo kekahi huaʻōlelo eaʻe.`);
    assert.equal(STRINGS[`writing.popup.nearMiss`].haw, `Pehea kau kahakō a me ʻokina.`);
    assert.equal(STRINGS[`writing.popup.incorrect`].haw, `Hewa. E hoʻāʻo hou.`);
});

// ---------- achievements (drift against backend/achievements.py) ----------
function backendAchievementIds() {
    const py = read(`backend/achievements.py`);
    const steps = {};
    for (const m of py.matchAll(/^([A-Z_]+_STEPS)\s*=\s*\[([^\]]*)\]/gm)) steps[m[1]] = m[2].split(`,`).map(s => Number(s.trim()));
    const ladders = [];
    const ids = [];
    for (const m of py.matchAll(/_tiers\(\s*"(\w+)",\s*"\w+",\s*(\w+)/g)) {
        assert.ok(steps[m[2]], `unparsed steps constant ${m[2]}`);
        ladders.push(m[1]);
        for (const t of steps[m[2]]) ids.push({ id: `${m[1]}-${t}`, ladder: m[1], t });
    }
    assert.match(py, /"id":\s*"setstreak-perfect"/);
    ids.push({ id: `setstreak-perfect`, ladder: `setstreak`, t: null });
    return { ids, ladders };
}

test(`every backend achievement id resolves to a template`, async () => {
    const { achievementKey, achievementTitle } = await loadBrowserModule(`scripts/achievement-text.js`);
    const { ids, ladders } = backendAchievementIds();
    assert.equal(ladders.length, 7);
    assert.ok(ids.length > 40);
    for (const a of ids) {
        const hit = achievementKey({ id: a.id });
        assert.ok(hit, `no template for ${a.id}`);
        assert.ok(hit.key in STRINGS, `${hit.key} missing in table`);
        assert.notEqual(achievementTitle({ id: a.id, title: `FALLBACK` }), `FALLBACK`, a.id);
    }
    for (const l of ladders) assert.ok(`achv.${l}` in STRINGS, `achv.${l}`);
});

test(`achievement titles match the backend English text`, async () => {
    const { achievementTitle } = await loadBrowserModule(`scripts/achievement-text.js`);
    const cases = {
        "cards-10": `10 Cards Studied`, "cards-1000": `1,000 Cards Studied`, "words-2000": `2,000 Words Written`,
        "sets-1": `First Set Completed`, "sets-3": `3 Sets Completed`, "streak-3": `3-Day Streak`,
        "setstreak-5": `5 in a Row`, "setstreak-perfect": `Perfect Set`, "quizzes-1": `First Quiz`,
        "quizzes-25": `25 Quizzes Completed`, "quizperfect-1": `Perfect Quiz`, "quizperfect-20": `20 Perfect Quizzes`,
    };
    for (const [id, title] of Object.entries(cases)) assert.equal(achievementTitle({ id, title: `x` }), title, id);
});

test(`unknown achievement ids fall back to the backend title and never read threshold`, async () => {
    const { achievementTitle, achievementKey } = await loadBrowserModule(`scripts/achievement-text.js`);
    assert.equal(achievementTitle({ id: `newladder-5`, title: `Backend Title` }), `Backend Title`);
    assert.equal(achievementTitle({ id: `weird`, title: `T` }), `T`);
    assert.equal(achievementKey({ id: `cards-10`, threshold: 999 }).vars.n, `10`);
    assert.equal(achievementTitle({}), ``);
});

// ---------- backend detail= drift ----------
test(`every backend detail= is a plain string literal mapped in BACKEND_ERRORS`, async () => {
    const { BACKEND_ERRORS, mapBackendError } = await loadBrowserModule(`scripts/auth-errors.js`);
    const details = new Set();
    for (const f of readdirSync(join(ROOT, `backend`)).filter(f => f.endsWith(`.py`))) {
        const src = read(`backend/${f}`);
        for (const m of src.matchAll(/\bdetail\s*=\s*(.{0,200})/g)) {
            const lit = /^"((?:[^"\\]|\\.)*)"\s*[,)]/.exec(m[1]);
            assert.ok(lit, `${f}: detail= must be a plain string literal, got ${m[1].slice(0, 60)}`);
            details.add(lit[1]);
        }
    }
    assert.ok(details.size >= 10);
    for (const d of details) {
        assert.ok(d in BACKEND_ERRORS, `no BACKEND_ERRORS entry for "${d}"`);
        assert.equal(STRINGS[BACKEND_ERRORS[d]]?.en, d, `${BACKEND_ERRORS[d]} en must equal the backend text`);
    }
    for (const d of Object.keys(BACKEND_ERRORS)) assert.ok(details.has(d), `stale BACKEND_ERRORS entry "${d}"`);
    assert.equal(mapBackendError(`Password is incorrect`), `Password is incorrect`);
    assert.equal(mapBackendError(`Some new backend text`), `Some new backend text`);
});

test(`auth.js fallback messages are keyed`, () => {
    const auth = read(`scripts/auth-errors.js`);
    for (const [key, en] of [[`errors.invalidEmail`, `Please enter a valid email`], [`errors.invalidUsername`, `Usernames can only use letters, numbers, and _ . -`],
        [`errors.needPassword`, `Please enter a password`], [`errors.generic`, `Something went wrong, please try again`]]) {
        assert.equal(STRINGS[key].en, en);
        assert.ok(auth.includes(`t(\`${key}\`)`), `auth-errors.js no longer uses ${key}`);
    }
});

// ---------- check script ----------
test(`findNonLeaf flags data-i18n on elements with children only`, () => {
    const html = `<p data-i18n="a.b">Text</p>\n<p data-i18n="a.c">Hi <b>there</b></p>\n<p data-i18n-html="a.d">Hi <b>x</b></p>\n<img data-i18n-alt="a.e" alt="x">`;
    const bad = check.findNonLeaf(html);
    assert.deepEqual(bad.map(b => [b.key, b.line]), [[`a.c`, 2]]);
});

test(`findDoubleOwned flags a keyed element that JS also writes`, () => {
    const html = `<h1 id="title" data-i18n="a.title">Hi</h1><p id="other">x</p>`;
    const js = [{ file: `x.js`, text: `const el = document.getElementById("title");\nel.textContent = "Hello";\ndocument.getElementById("other").textContent = "ok";` }];
    const hits = check.findDoubleOwned([html], js);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].name, `title`);
    assert.equal(check.findDoubleOwned([html], [{ file: `y.js`, text: `document.getElementById("title").textContent = x;` }]).length, 1);
    assert.equal(check.findDoubleOwned([html], [{ file: `z.js`, text: `document.getElementById("other").textContent = x;` }]).length, 0);
});

test(`findJsLiterals flags unkeyed literals, skips t() and allowlisted lines`, () => {
    const text = `el.textContent = "Hello there";\nel.textContent = t("a.b");\nel.textContent = \`\${n}\`;\nalert("Oops, failed");\n// el.title = "comment only";`;
    assert.deepEqual(check.findJsLiterals(`a.js`, text).map(h => h.line), [1, 4]);
    const allow = [{ path: `a.js`, text: `Hello there`, reason: `r` }];
    assert.deepEqual(check.findJsLiterals(`a.js`, text, allow).map(h => h.line), [4]);
});

test(`parseAllow requires a reason`, () => {
    const { entries, errors } = check.parseAllow(`# c\na.js :: foo :: because\nb.js :: bar\n`);
    assert.equal(entries.length, 1);
    assert.equal(errors.length, 1);
});

test(`i18n-tool check exits 0 on the current tree`, () => {
    const out = execFileSync(process.execPath, [join(ROOT, `scripts/i18n-tool.mjs`), `check`], { encoding: `utf8` });
    assert.match(out, /0 error\(s\)/);
});
