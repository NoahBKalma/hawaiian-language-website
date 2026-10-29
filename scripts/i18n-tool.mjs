// The one i18n dev tool. i18n.csv (repo root: feature,english,hawaiian,key) is the single source of interface strings;
// scripts/i18n.js reads the generated scripts/i18n-strings.json in the browser.
// Usage: node scripts/i18n-tool.mjs <command> [options]
//   build [--check]             validate i18n.csv and write scripts/i18n-strings.json (bumps the ?v= in scripts/i18n.js when it changes).
//                               --check: validate only, and fail if the JSON is stale. Run after every edit to i18n.csv.
//   merge <file> [--check]      copy Hawaiian cells from another CSV (same columns, matched by key) into i18n.csv, then build.
//   todo [--out <file>]         write the rows with no Hawaiian yet to i18n-todo.csv (fill it in, then: merge i18n-todo.csv)
//   add <file>                  append new keys ("key": { page: "p", en: "English", haw: "" }, one per line) to i18n.csv, then build.
//   check [--js-literals] [--strict]   lint html/js against the table: unknown keys, non-leaf data-i18n, bootstrap copies, ...
// Columns are UTF-8 with BOM for Excel, CRLF, RFC-4180 quoting. A newline inside a value is written as a literal "\n" (backslash as "\\").
// Keep every {placeholder} and HTML tag the same in english and hawaiian; build rejects rows where they differ. Keys ending in "-html"
// hold markup (<b>, <a> only). Never invent Hawaiian. Row order in the CSV is the order in the JSON; the page of a key is its first segment.
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), `..`);
const DEFAULT_CSV = join(ROOT, `i18n.csv`);
const DEFAULT_JSON = join(ROOT, `scripts`, `i18n-strings.json`);
const DEFAULT_I18N = join(ROOT, `scripts`, `i18n.js`);

// ---------- values, CSV ----------
export const escapeValue = s => String(s).replace(/\\/g, `\\\\`).replace(/\r?\n/g, `\\n`);
export const unescapeValue = s => s.replace(/\\(n|\\)/g, (_, c) => (c === `n` ? `\n` : `\\`));
export const placeholdersOf = s => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
// Tag set = sorted list of opening/closing tag names ("<a", "</a", ...); attributes are ignored.
export const tagsOf = s => [...String(s).matchAll(/<(\/?[a-zA-Z][a-zA-Z0-9]*)/g)].map(m => `<` + m[1].toLowerCase()).sort();

// Friendly place name per key prefix (fallback: the prefix itself).
const FEATURES = {
    header: `Common (header/footer/buttons)`, footer: `Common (header/footer/buttons)`, common: `Common (header/footer/buttons)`,
    errors: `Errors`, achv: `Achievements`, writing: `Writing practice`, meta: `Page titles and descriptions`,
    quiz: `Quiz`, spaced: `Spaced review`, home: `Home`, units: `Units`, unit: `Unit page`, type: `Vocab`,
    vocab: `Vocab`, wordBank: `Word bank`, phrases: `Phrases`, practice: `Practice sets`, flashcards: `Flashcards`,
    tutorial: `Tutorials`, learning: `Learning map`, login: `Login`, api: `Login`, admin: `Admin analytics`, profile: `Profile`, account: `Account settings`, help: `Help menu`,
};
export const pageOf = key => key.split(`.`)[0];
export const featureOf = page => FEATURES[page] || page;

const csvCell = s => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, `""`)}"` : s);
const HEADER = [`feature`, `english`, `hawaiian`, `key`];
export const formatCsvRows = rows => `﻿` + [HEADER, ...rows].map(r => r.map(csvCell).join(`,`)).join(`\r\n`) + `\r\n`;

// RFC-4180 parser (quoted fields, "" escapes, CRLF/LF, optional BOM). Returns rows of strings.
export function parseCsv(text) {
    const rows = []; let row = [], f = ``, q = false;
    text = text.replace(/^﻿/, ``);
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === `"`) { if (text[i + 1] === `"`) { f += `"`; i++; } else q = false; } else f += c; }
        else if (c === `"`) q = true;
        else if (c === `,`) { row.push(f); f = ``; }
        else if (c === `\n` || c === `\r`) { if (c === `\r` && text[i + 1] === `\n`) i++; row.push(f); rows.push(row); row = []; f = ``; }
        else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
}

// CSV text -> { entries: [{ line, key, feature, en, haw }], errors }. Values are unescaped (\n, \\) and NFC-normalized.
export function parseTable(text) {
    const rows = parseCsv(text), entries = [], errors = [];
    const head = (rows[0] || []).map(h => h.trim().toLowerCase());
    const col = n => head.indexOf(n);
    if (HEADER.some(n => col(n) < 0)) return { entries, errors: [`CSV header must have columns: ${HEADER.join(`,`)}`] };
    const seen = new Set();
    rows.slice(1).forEach((r, i) => {
        const line = i + 2, cell = n => r[col(n)] || ``;
        const key = cell(`key`).trim();
        if (!key) { errors.push(`row ${line}: empty key column`); return; }
        if (!/^[A-Za-z0-9]+(\.[A-Za-z0-9_-]+)+$/.test(key)) errors.push(`row ${line}: bad key "${key}"`);
        if (seen.has(key)) errors.push(`row ${line}: duplicate key "${key}"`);
        seen.add(key);
        entries.push({ line, key, feature: cell(`feature`), en: unescapeValue(cell(`english`)).normalize(`NFC`), haw: unescapeValue(cell(`hawaiian`).trim()).normalize(`NFC`) });
    });
    return { entries, errors };
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Problems in a parsed table: empty english, or a hawaiian whose {placeholder} / HTML tag set differs from the english.
export function validateEntries(entries) {
    const problems = [];
    for (const { key, feature, en, haw, line } of entries) {
        const where = `${feature || `?`} | ${en.replace(/\n/g, `\\n`) || key} | `;
        if (!en) { problems.push(`row ${line}: ${key}: english is empty`); continue; }
        if (!haw) continue;
        const ph = [placeholdersOf(en), placeholdersOf(haw)];
        if (!same(...ph)) { problems.push(`${where}placeholders differ (English: ${ph[0].map(p => `{${p}}`).join(` `) || `none`}; yours: ${ph[1].map(p => `{${p}}`).join(` `) || `none`})`); continue; }
        const tg = [tagsOf(en), tagsOf(haw)];
        if (!same(...tg)) problems.push(`${where}HTML tags differ (English: ${tg[0].join(` `) || `none`}; yours: ${tg[1].join(` `) || `none`})`);
    }
    return problems;
}

// Entries -> the JSON the browser loads: { "key": { "en", "haw" } }, one key per line, in CSV order.
export function toJson(entries) {
    return `{\n` + entries.map(e => `  ${JSON.stringify(e.key)}: ${JSON.stringify({ en: e.en, haw: e.haw })}`).join(`,\n`) + `\n}\n`;
}

// Bump the single ?v=N on the fetch of i18n-strings.json in scripts/i18n.js.
export function bumpVersion(src) {
    const re = /(i18n-strings\.json\?v=)(\d+)/g;
    const found = [...src.matchAll(re)];
    if (found.length !== 1) throw new Error(`expected exactly one i18n-strings.json?v=N in scripts/i18n.js, found ${found.length}`);
    return src.replace(re, (_, a, n) => a + (Number(n) + 1));
}


function loadTable(csv) {
    const { entries, errors } = parseTable(readFileSync(csv, `utf8`));
    return { entries, problems: [...errors, ...validateEntries(entries)] };
}

function fail(title, problems) {
    console.error(`${title} (${problems.length}); nothing written:`);
    problems.forEach(p => console.error(`  ${p}`));
    process.exit(1);
}

// ---------- commands: build, merge, todo, add ----------
export function build({ csv, json, i18n, check = false }) {
    const { entries, problems } = loadTable(csv);
    if (problems.length) fail(`Rejected problem(s) in ${basename(csv)}`, problems);
    const next = toJson(entries);
    const stale = !existsSync(json) || readFileSync(json, `utf8`) !== next;
    if (check) {
        console.log(stale ? `STALE: ${relative(process.cwd(), json) || json} is out of date; run: node scripts/i18n-tool.mjs build` : `Check OK: ${entries.length} strings, JSON up to date.`);
        return !stale;
    }
    if (!stale) { console.log(`No changes: ${entries.length} strings.`); return true; }
    writeFileSync(json, next, `utf8`);
    writeFileSync(i18n, bumpVersion(readFileSync(i18n, `utf8`)), `utf8`);
    console.log(`Wrote ${entries.length} strings to ${relative(process.cwd(), json) || json}; cache-bust bumped in ${relative(process.cwd(), i18n) || i18n}.`);
    return true;
}

// Rows of i18n.csv as arrays [feature, english(escaped), hawaiian(escaped), key], in file order.
function readRows(csv) {
    const rows = parseCsv(readFileSync(csv, `utf8`));
    const head = rows[0].map(h => h.trim().toLowerCase());
    return rows.slice(1).map(r => HEADER.map(n => r[head.indexOf(n)] || ``));
}
const writeAtomic = (path, text) => { writeFileSync(path + `.tmp`, text, `utf8`); renameSync(path + `.tmp`, path); };

export function merge(file, { csv, json, i18n, check = false }) {
    const other = parseTable(readFileSync(resolve(file), `utf8`));
    const main = loadTable(csv);
    const problems = [...other.errors, ...main.problems];
    const known = new Map(main.entries.map(e => [e.key, e]));
    const updates = new Map();
    for (const e of other.entries) {
        const cur = known.get(e.key);
        if (!cur) { problems.push(`${e.feature || `?`} | ${e.en || e.key} | unknown key`); continue; }
        if (!e.haw || e.haw === cur.en || e.haw === cur.haw) continue;
        const trial = validateEntries([{ ...cur, haw: e.haw }]);
        if (trial.length) { problems.push(...trial); continue; }
        updates.set(e.key, e.haw);
    }
    if (problems.length) fail(`Rejected problem(s)`, problems);
    if (check || !updates.size) { console.log(`${check ? `Check OK` : `No changes`}: ${updates.size} string(s) would change, ${other.entries.length} row(s) read.`); return; }
    const rows = readRows(csv).map(r => (updates.has(r[3]) ? [r[0], r[1], escapeValue(updates.get(r[3])), r[3]] : r));
    writeAtomic(csv, formatCsvRows(rows));
    console.log(`Updated ${updates.size} string(s) in ${relative(process.cwd(), csv) || csv}.`);
    build({ csv, json, i18n });
}

export function todo(out, { csv }) {
    const rows = readRows(csv).filter(r => !r[2]);
    writeFileSync(out, formatCsvRows(rows), `utf8`);
    console.log(`Wrote ${rows.length} untranslated string(s) to ${relative(process.cwd(), out) || out}. Fill the hawaiian column, then: node scripts/i18n-tool.mjs merge ${basename(out)}`);
}

// Parse lines like  "page.purpose": { page: "page", en: "English", haw: "" },  into [{ key, page, en, haw }].
export function parseEntryLines(text) {
    const keyOf = line => /^\s*"([^"]+)":/.exec(line)?.[1];
    return text.split(/\r?\n/).filter(l => keyOf(l)).map(l => {
        const obj = new Function(`return (${l.slice(l.indexOf(`:`) + 1).trim().replace(/,$/, ``)})`)();
        return { key: keyOf(l), page: obj.page || pageOf(keyOf(l)), en: obj.en, haw: obj.haw || `` };
    });
}

export function add(file, { csv, json, i18n }) {
    const lock = csv + `.lock`;
    const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    for (let i = 0; ; i++) {
        try { closeSync(openSync(lock, `wx`)); break; }
        catch { if (i > 200) { console.error(`lock busy: ${lock}`); process.exit(1); } sleep(50); }
    }
    try {
        const rows = readRows(csv);
        const byKey = new Map(rows.map(r => [r[3], r]));
        const fresh = [], conflicts = []; let present = 0;
        for (const e of parseEntryLines(readFileSync(resolve(file), `utf8`))) {
            const cur = byKey.get(e.key);
            if (!cur) { const row = [featureOf(e.page), escapeValue(e.en), escapeValue(e.haw), e.key]; byKey.set(e.key, row); fresh.push(row); }
            else if (cur[1] !== escapeValue(e.en)) conflicts.push(`CONFLICT ${e.key}: existing english differs`);
            else present++;
        }
        if (conflicts.length) fail(`Conflict(s)`, conflicts);
        if (fresh.length) writeAtomic(csv, formatCsvRows([...rows, ...fresh]));
        console.log(`added ${fresh.length}, already present ${present}`);
    } finally { if (existsSync(lock)) unlinkSync(lock); }
    build({ csv, json, i18n });
}

// ---------- command: check (site linter) ----------
const VOID = new Set([`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`]);

function walk(dir, test, out = []) {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (![`node_modules`, `.git`, `data`, `tests`].includes(name)) walk(p, test, out); }
        else if (test(p)) out.push(p);
    }
    return out;
}
const rel = p => relative(ROOT, p).replaceAll(`\\`, `/`);
const read = p => readFileSync(p, `utf8`);
const lineOf = (text, idx) => text.slice(0, idx).split(`\n`).length;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);

export const normalizeBootstrap = s => s.replace(/\s+/g, ` `).trim();

// data-i18n (text) must sit on leaf elements. Returns [{ line, tag, key }].
export function findNonLeaf(text) {
    const bad = [];
    const open = /<([a-zA-Z][\w-]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>/g;
    let m;
    while ((m = open.exec(text))) {
        const tag = m[1].toLowerCase();
        if (VOID.has(tag) || m[0].endsWith(`/>`)) continue;
        const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, `gi`);
        re.lastIndex = open.lastIndex;
        let depth = 1, end = -1, n;
        while ((n = re.exec(text))) { depth += n[1] ? -1 : 1; if (depth === 0) { end = n.index; break; } }
        if (end < 0) continue;
        if (/<[a-zA-Z]/.test(text.slice(open.lastIndex, end))) bad.push({ line: lineOf(text, m.index), tag, key: m[2] });
    }
    return bad;
}

// Elements carrying data-i18n / data-i18n-html (by id or class) that JS also writes. Returns [{ file, name, line }].
export function findDoubleOwned(htmlTexts, jsFiles) {
    const ids = new Set(), classes = new Set();
    for (const text of htmlTexts) {
        for (const m of text.matchAll(/<[a-zA-Z][^>]*?\sdata-i18n(?:-html)?="[^"]+"[^>]*>/g)) {
            const id = /\sid="([^"]+)"/.exec(m[0]); if (id) ids.add(id[1]);
            const cls = /\sclass="([^"]+)"/.exec(m[0]); if (cls) cls[1].split(/\s+/).forEach(c => classes.add(c));
        }
    }
    const hits = [];
    for (const { file, text } of jsFiles) {
        const sels = [
            ...[...ids].map(i => [i, `getElementById\\(\\s*[\`"']${esc(i)}[\`"']|querySelector(?:All)?\\(\\s*[\`"']#${esc(i)}\\b`]),
            ...[...classes].map(c => [`.${c}`, `querySelector\\(\\s*[\`"'][^\`"']*\\.${esc(c)}\\b`]),
        ];
        for (const [name, pattern] of sels) {
            const direct = new RegExp(`(?:${pattern})[^;\\n]*?\\)\\s*\\.(?:textContent|innerText|innerHTML)\\s*=`, `g`);
            const m = direct.exec(text);
            if (m) hits.push({ file, name, line: lineOf(text, m.index) });
            for (const d of text.matchAll(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;\\n]*?(?:${pattern})`, `g`))) {
                const w = new RegExp(`\\b${d[1]}\\.(?:textContent|innerText|innerHTML)\\s*=|\\b${d[1]}\\.setAttribute\\(`).exec(text);
                if (w) hits.push({ file, name, line: lineOf(text, w.index) });
            }
        }
    }
    return hits;
}

const FACING = /(?:\.(?:textContent|innerText|innerHTML|placeholder|title)\s*\+?=|setAttribute\(\s*[`"'](?:title|aria-label|alt|placeholder)[`"']|\b(?:alert|announce|confirm)\(|insertAdjacentHTML\()/;
const WORDS = /[`"'][^`"'\n]*[A-Za-z]{3,}[^`"'\n]*[`"']/;
// User-facing string literals not routed through t(). allow: [{ path, text, reason }].
export function findJsLiterals(file, text, allow = []) {
    const hits = [];
    text.split(`\n`).forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, ``);
        const at = code.search(FACING);
        if (at < 0 || /\bt\(/.test(code) || !WORDS.test(code.slice(at))) return;
        if (allow.some(a => file.endsWith(a.path) && line.includes(a.text))) return;
        hits.push({ file, line: i + 1, text: line.trim().slice(0, 120) });
    });
    return hits;
}

export function parseAllow(text) {
    const entries = [], errors = [];
    text.split(`\n`).forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith(`#`)) return;
        const [path, sub, ...reason] = line.split(`::`).map(s => s.trim());
        if (!path || !sub || !reason.join(``).trim()) errors.push(`i18n-allow.txt:${i + 1}: needs "path :: text :: reason"`);
        else entries.push({ path, text: sub, reason: reason.join(`::`) });
    });
    return { entries, errors };
}

async function runCheck(args, p) {
    const errors = [], warnings = [], info = [];
    const csvTable = loadTable(p.csv);
    errors.push(...csvTable.problems);
    const STRINGS = Object.fromEntries(csvTable.entries.map(e => [e.key, { page: pageOf(e.key), en: e.en, haw: e.haw }]));
    if (!existsSync(p.json) || readFileSync(p.json, `utf8`) !== toJson(csvTable.entries)) errors.push(`scripts/i18n-strings.json is out of date; run: node scripts/i18n-tool.mjs build`);

    const pages = [join(ROOT, `index.html`), ...walk(join(ROOT, `pages`), p => p.endsWith(`.html`))].filter(existsSync);
    const jsFiles = [...walk(join(ROOT, `scripts`), p => p.endsWith(`.js`)), ...walk(join(ROOT, `components`), p => p.endsWith(`.js`))]
        .map(p => ({ file: rel(p), text: read(p) }));
    const htmls = pages.map(p => ({ file: rel(p), text: read(p) }));
    const used = new Set();

    // Unknown keys
    const attrRe = /\sdata-i18n(?:-[a-z-]+)?="([^"]+)"/g;
    const keyRefs = [
        ...htmls.flatMap(h => [...h.text.matchAll(attrRe)].map(m => ({ file: h.file, key: m[1], idx: m.index, text: h.text }))),
        ...jsFiles.flatMap(j => [...j.text.matchAll(/\sdata-i18n(?:-[a-z-]+)?="([^"]+)"|\bt\(\s*[`"']([\w.-]+)[`"']/g)].map(m => ({ file: j.file, key: m[1] || m[2], idx: m.index, text: j.text }))),
    ];
    for (const r of keyRefs) {
        if (r.key.includes(`\${`) || r.key.startsWith(`{`)) continue;
        used.add(r.key);
        if (!Object.hasOwn(STRINGS, r.key)) errors.push(`${r.file}:${lineOf(r.text, r.idx)}: unknown i18n key "${r.key}"`);
    }

    // Non-leaf data-i18n
    for (const f of [...htmls, ...jsFiles]) for (const b of findNonLeaf(f.text)) errors.push(`${f.file}:${b.line}: data-i18n="${b.key}" on non-leaf <${b.tag}>`);

    // JS-owned and keyed
    for (const h of findDoubleOwned([...htmls, ...jsFiles].map(f => f.text), jsFiles)) errors.push(`${h.file}:${h.line}: ${h.name} is data-i18n keyed and also written by JS`);

    // Bootstrap copies
    const canonical = normalizeBootstrap(read(join(ROOT, `scripts/i18n-bootstrap.txt`)));
    const missing = [];
    for (const h of htmls) {
        const blocks = [...h.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes(`olelo:siteLang`));
        if (!blocks.length) missing.push(h.file);
        else if (normalizeBootstrap(blocks[0]) !== canonical) errors.push(`${h.file}: i18n bootstrap differs from scripts/i18n-bootstrap.txt`);
    }
    if (args.includes(`--strict`)) { for (const f of missing) errors.push(`${f}: missing the i18n bootstrap`); }
    else if (missing.length) info.push(`${missing.length} page(s) without the i18n bootstrap (added in Step 2/3)`);

    // Cache-bust: one import site
    for (const f of [...jsFiles, ...htmls]) {
        for (const m of f.text.matchAll(/[`"']([^`"'\s]*i18n(?:-strings)?\.(?:js|json)(?:\?[^`"'\s]*)?)[`"']/g)) {
            const spec = m[1], name = basename(spec.split(`?`)[0]);
            const line = `${f.file}:${lineOf(f.text, m.index)}`;
            if (name === `i18n.js`) {
                if (spec.includes(`?`)) errors.push(`${line}: "${spec}" must not carry a query string`);
                else if (spec !== `/scripts/i18n.js`) errors.push(`${line}: import i18n.js as "/scripts/i18n.js", not "${spec}"`);
            } else if (name === `i18n-strings.json` && f.file !== `scripts/i18n.js`) errors.push(`${line}: only scripts/i18n.js may load i18n-strings.json`);
        }
    }

    // data-i18n-doc-title vs JS document.title
    for (const h of htmls) {
        if (!/<title[^>]*data-i18n-doc-title/.test(h.text)) continue;
        for (const m of h.text.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
            const js = jsFiles.find(j => `/${j.file}` === m[1].split(`?`)[0]);
            if (js && /document\.title\s*=/.test(js.text)) errors.push(`${h.file}: data-i18n-doc-title but ${js.file} sets document.title`);
        }
    }

    // Unused keys, empty haw per page
    const sources = jsFiles;
    // Keys built at runtime, e.g. t(`vocab.posTag.${pos}`): any key matching prefix + anything + suffix counts as used.
    const dynamic = jsFiles.flatMap(j => [...j.text.matchAll(/`([A-Za-z][\w-]*\.(?:[\w-]+\.)*)\$\{[^}]*\}([\w.-]*)`/g)].map(m => [m[1], m[2]]));
    for (const k of Object.keys(STRINGS)) {
        if (used.has(k) || sources.some(j => j.text.includes(k)) || dynamic.some(([pre, suf]) => k.length > pre.length + suf.length && k.startsWith(pre) && k.endsWith(suf))) continue;
        warnings.push(`unused key "${k}"`);
    }
    const perPage = {};
    for (const v of Object.values(STRINGS)) { perPage[v.page] ??= { total: 0, empty: 0 }; perPage[v.page].total++; if (!v.haw) perPage[v.page].empty++; }
    for (const [p, c] of Object.entries(perPage)) info.push(`[${p}] ${c.empty}/${c.total} keys have empty haw`);

    // JS literals
    if (args.includes(`--js-literals`)) {
        const allowPath = join(ROOT, `scripts/i18n-allow.txt`);
        const { entries, errors: allowErrors } = parseAllow(existsSync(allowPath) ? read(allowPath) : ``);
        errors.push(...allowErrors);
        for (const j of jsFiles) for (const h of findJsLiterals(j.file, j.text, entries)) errors.push(`${h.file}:${h.line}: unkeyed UI literal: ${h.text}`);
    }

    for (const w of warnings) console.log(`warn  ${w}`);
    for (const i of info) console.log(`info  ${i}`);
    for (const e of errors) console.log(`ERROR ${e}`);
    console.log(`i18n check: ${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(errors.length ? 1 : 0);
}

// ---------- dispatch ----------
const PATH_OPTS = [`--csv`, `--json`, `--i18n`];
const COMMANDS = {
    build: { bool: [`--check`], value: PATH_OPTS, args: 0 },
    merge: { bool: [`--check`], value: PATH_OPTS, args: 1 },
    todo: { bool: [], value: [...PATH_OPTS, `--out`], args: 0 },
    add: { bool: [], value: PATH_OPTS, args: 1 },
    check: { bool: [`--js-literals`, `--strict`], value: PATH_OPTS, args: 0 },
};

// Strict flag parsing: unknown flags, missing values and wrong positional counts are errors (they used to be silently ignored).
export function parseFlags(cmd, rest) {
    const spec = COMMANDS[cmd], flags = {}, pos = [];
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (spec.bool.includes(a)) flags[a] = true;
        else if (spec.value.includes(a)) {
            if (rest[i + 1] === undefined || rest[i + 1].startsWith(`--`)) throw new Error(`${a} needs a value`);
            flags[a] = rest[++i];
        } else if (a.startsWith(`--`)) throw new Error(`unknown option ${a} for "${cmd}"`);
        else pos.push(a);
    }
    if (pos.length !== spec.args) throw new Error(spec.args ? `"${cmd}" needs exactly ${spec.args} file argument` : `"${cmd}" takes no file arguments (got ${pos.join(` `)})`);
    return { flags, pos };
}

async function main(argv) {
    const [cmd, ...rest] = argv;
    if (!cmd || cmd === `--help` || cmd === `-h`) { usage(); process.exit(cmd ? 0 : 2); }
    if (!COMMANDS[cmd]) { console.error(`unknown command "${cmd}"`); usage(); process.exit(2); }
    let parsed;
    try { parsed = parseFlags(cmd, rest); } catch (e) { console.error(`${e.message}`); usage(); process.exit(2); }
    const { flags, pos } = parsed;
    const p = {
        csv: resolve(flags[`--csv`] || DEFAULT_CSV),
        json: resolve(flags[`--json`] || DEFAULT_JSON),
        i18n: resolve(flags[`--i18n`] || DEFAULT_I18N),
    };
    if (cmd === `build`) { if (!build({ ...p, check: !!flags[`--check`] })) process.exit(1); }
    else if (cmd === `merge`) merge(pos[0], { ...p, check: !!flags[`--check`] });
    else if (cmd === `todo`) todo(resolve(flags[`--out`] || join(ROOT, `i18n-todo.csv`)), p);
    else if (cmd === `add`) add(pos[0], p);
    else await runCheck(Object.keys(flags), p);
}
function usage() {
    console.error(`usage: node scripts/i18n-tool.mjs <command> [options]
  build [--check]                      validate i18n.csv, write scripts/i18n-strings.json
  merge <csv> [--check]                copy Hawaiian cells from another CSV (matched by key), then build
  todo [--out <file>]                  write rows with no Hawaiian to i18n-todo.csv
  add <entries-file>                   append new keys to i18n.csv, then build
  check [--js-literals] [--strict]     lint html/js against the table
  every command also accepts --csv <file> --json <file> --i18n <file> (paths; default: repo files)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
