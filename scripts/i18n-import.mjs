// Import translations from the exported CSV (i18n.csv) back into the interface string table.
// Rows are matched by the key column, so the user's sorting/filtering does not matter. Problems are reported as "feature | english | reason".
// Usage: node scripts/i18n-import.mjs <file> [--check] [--table <path>] [--i18n <path>]
//   --check  validate only; write nothing
//   --table  target table (default scripts/i18n-strings.js); a .bak copy is written next to it
//   --i18n   file holding the single ?v=N import of the table (default scripts/i18n.js)
// NFC-normalizes; rejects unknown keys and any value whose {placeholder} set or
// HTML tag set differs from the English. All rejections are printed and nothing is written if there is any.
// Rows whose hawaiian is empty or still identical to the English are skipped. Idempotent: no change means no write.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unescapeValue, placeholdersOf, tagsOf } from "./i18n-export.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// RFC-4180 parser (quoted fields, "" escapes, CRLF/LF, optional BOM). Returns rows of strings.
export function parseCsv(text) {
    const rows = []; let row = [], f = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
        else if (c === '"') q = true;
        else if (c === ",") { row.push(f); f = ""; }
        else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
        else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
}

// CSV text -> { entries: [{ line, key, value, feature }], errors }. Values are unescaped (\n, \\) and NFC-normalized.
export function parseImport(text) {
    const rows = parseCsv(text), entries = [], errors = [];
    const head = (rows[0] || []).map(h => h.trim().toLowerCase());
    const col = n => head.indexOf(n);
    if (["feature", "english", "hawaiian", "key"].some(n => col(n) < 0)) return { entries, errors: ["CSV header must have columns: feature,english,hawaiian,key"] };
    rows.slice(1).forEach((r, i) => {
        const key = (r[col("key")] || "").trim();
        if (!key) { errors.push(`row ${i + 2}: empty key column`); return; }
        entries.push({ line: i + 2, key, value: unescapeValue((r[col("hawaiian")] || "").trim()).normalize("NFC"), feature: r[col("feature")] || "" });
    });
    return { entries, errors };
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Returns { updates: {key: haw}, rejections: [string] } for entries that should be written.
export function validateImport(entries, strings) {
    const updates = {}, rejections = [];
    for (const { key, value, feature } of entries) {
        const entry = strings[key];
        const where = `${feature || "?"} | ${entry ? entry.en.replace(/\n/g, "\\n") : key} | `;
        if (!entry) { rejections.push(`${where}unknown key`); continue; }
        if (!value || value === entry.en.normalize("NFC")) continue;
        const ph = [placeholdersOf(entry.en), placeholdersOf(value)];
        if (!same(...ph)) { rejections.push(`${where}placeholders differ (English: ${ph[0].map(p => `{${p}}`).join(" ") || "none"}; yours: ${ph[1].map(p => `{${p}}`).join(" ") || "none"})`); continue; }
        const tg = [tagsOf(entry.en), tagsOf(value)];
        if (!same(...tg)) { rejections.push(`${where}HTML tags differ (English: ${tg[0].join(" ") || "none"}; yours: ${tg[1].join(" ") || "none"})`); continue; }
        updates[key] = value;
    }
    return { updates, rejections };
}

// Rewrite only the haw: "…" value on each matching table line. Returns { src, changed }.
export function applyUpdates(src, updates) {
    const pending = new Set(Object.keys(updates));
    let changed = 0;
    const lines = src.split("\n").map(l => {
        const km = l.match(/^\s*"([^"]+)":\s*\{/);
        if (!km || !pending.has(km[1])) return l;
        const lm = l.match(/^(.*\bhaw:\s*)("(?:[^"\\]|\\.)*")(\s*\},?\s*)$/);
        if (!lm) return l;
        pending.delete(km[1]);
        const next = JSON.stringify(updates[km[1]]);
        if (lm[2] === next) return l;
        changed++;
        return lm[1] + next + lm[3];
    });
    if (pending.size) throw new Error(`could not find a haw field for: ${[...pending].join(", ")}`);
    return { src: lines.join("\n"), changed };
}

// Bump the single ?v=N on the import of i18n-strings.js.
export function bumpVersion(src) {
    const re = /(from\s+["']\.\/i18n-strings\.js\?v=)(\d+)(["'])/g;
    const found = [...src.matchAll(re)];
    if (found.length !== 1) throw new Error(`expected exactly one ./i18n-strings.js?v=N import, found ${found.length}`);
    return src.replace(re, (_, a, n, c) => a + (Number(n) + 1) + c);
}

function arg(name, argv) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const argv = process.argv.slice(2);
    const file = argv.find((a, i) => !a.startsWith("--") && !["--table", "--i18n"].includes(argv[i - 1]));
    if (!file) { console.error("Usage: node scripts/i18n-import.mjs <file> [--check] [--table <path>] [--i18n <path>]"); process.exit(2); }
    const table = resolve(arg("--table", argv) || join(ROOT, "scripts", "i18n-strings.js"));
    const i18nFile = resolve(arg("--i18n", argv) || join(ROOT, "scripts", "i18n.js"));
    const check = argv.includes("--check");
    const strings = (await import(pathToFileURL(table).href + `?t=${Date.now()}`)).STRINGS;
    const { entries, errors } = parseImport(readFileSync(resolve(file), "utf8"));
    const { updates, rejections } = validateImport(entries, strings);
    const all = [...errors, ...rejections];
    if (all.length) {
        console.error(`Rejected ${all.length} problem(s); nothing written:`);
        all.forEach(r => console.error("  " + r));
        process.exit(1);
    }
    const tableSrc = readFileSync(table, "utf8");
    const { src, changed } = applyUpdates(tableSrc, updates);
    if (check || !changed) {
        console.log(`${check ? "Check OK" : "No changes"}: ${changed} string(s) would change, ${entries.length} row(s) read.`);
        process.exit(0);
    }
    copyFileSync(table, table + ".bak");
    writeFileSync(table, src, "utf8");
    writeFileSync(i18nFile, bumpVersion(readFileSync(i18nFile, "utf8")), "utf8");
    console.log(`Updated ${changed} string(s) in ${table} (backup: ${table}.bak); cache-bust bumped in ${i18nFile}.`);
}
