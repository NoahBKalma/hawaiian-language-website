// Merge new keys into scripts/i18n-strings.js safely (atomic rename, lock file, skips identical keys, rejects conflicts).
// Usage: node scripts/i18n-add-keys.mjs <file-with-entry-lines>
// Each input line: "page.purpose": { page: "page", en: "English", haw: "" },   (blank lines and // comments ignored)
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), `..`);
const TABLE = join(ROOT, `scripts`, `i18n-strings.js`);
const LOCK = TABLE + `.lock`;
const input = process.argv[2];
if (!input) { console.error(`usage: node scripts/i18n-add-keys.mjs <file>`); process.exit(2); }

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let i = 0; ; i++) {
    try { closeSync(openSync(LOCK, `wx`)); break; }
    catch { if (i > 200) { console.error(`lock busy: ${LOCK}`); process.exit(1); } sleep(50); }
}
try {
    const keyOf = line => /^\s*"([^"]+)":/.exec(line)?.[1];
    const lines = readFileSync(input, `utf8`).split(/\r?\n/).filter(l => keyOf(l));
    const src = readFileSync(TABLE, `utf8`);
    const existing = new Map();
    for (const l of src.split(`\n`)) { const k = keyOf(l); if (k) existing.set(k, l.trim()); }
    const fresh = [];
    let conflicts = 0;
    for (const l of lines) {
        const k = keyOf(l), norm = l.trim().replace(/,?$/, `,`);
        if (!existing.has(k)) { existing.set(k, norm); fresh.push(`  ${norm}`); }
        else if (existing.get(k).replace(/,?$/, `,`) !== norm) {
            const enOf = s => /\ben:\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/.exec(s)?.[1];
            if (enOf(existing.get(k)) !== enOf(norm)) { console.error(`CONFLICT ${k}: existing en differs`); conflicts++; }
        }
    }
    if (conflicts) process.exit(1);
    if (fresh.length) {
        const end = src.lastIndexOf(`\n};`);
        const out = src.slice(0, end) + `\n` + fresh.join(`\n`) + src.slice(end);
        writeFileSync(TABLE + `.tmp`, out);
        renameSync(TABLE + `.tmp`, TABLE);
    }
    console.log(`added ${fresh.length}, already present ${lines.length - fresh.length}`);
} finally {
    if (existsSync(LOCK)) unlinkSync(LOCK);
}
