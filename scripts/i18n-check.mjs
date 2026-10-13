// Dev gate for the site language switch. Usage: node scripts/i18n-check.mjs [--js-literals] [--strict]
// Errors (exit 1): unknown keys, non-leaf data-i18n, data-i18n + JS-written element, bootstrap copy differs,
// cache-bust violations, data-i18n-doc-title on a page whose script sets document.title.
// Warnings: unused keys. Info: empty haw per page, pages still missing the bootstrap (an error with --strict).
// --js-literals: also list user-facing string literals in scripts/ and components/ that are not keyed or allowlisted.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), `..`);
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

async function main() {
    const args = process.argv.slice(2);
    const errors = [], warnings = [], info = [];
    const { STRINGS } = await import(pathToFileURL(join(ROOT, `scripts/i18n-strings.js`)).href);

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
        if (r.key.includes(`\${`) || r.key.startsWith(`{`) || r.file === `scripts/i18n-strings.js`) continue;
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
        for (const m of f.text.matchAll(/[`"']([^`"'\s]*i18n(?:-strings)?\.js(?:\?[^`"'\s]*)?)[`"']/g)) {
            const spec = m[1], name = basename(spec.split(`?`)[0]);
            const line = `${f.file}:${lineOf(f.text, m.index)}`;
            if (name === `i18n.js`) {
                if (spec.includes(`?`)) errors.push(`${line}: "${spec}" must not carry a query string`);
                else if (spec !== `/scripts/i18n.js`) errors.push(`${line}: import i18n.js as "/scripts/i18n.js", not "${spec}"`);
            } else if (name === `i18n-strings.js` && f.file !== `scripts/i18n.js`) errors.push(`${line}: only scripts/i18n.js may import i18n-strings.js`);
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
    const sources = jsFiles.filter(j => j.file !== `scripts/i18n-strings.js`);
    for (const k of Object.keys(STRINGS)) {
        if (used.has(k) || sources.some(j => j.text.includes(k))) continue;
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
    console.log(`i18n-check: ${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
