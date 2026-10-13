// Export the interface string table to a spreadsheet-friendly CSV (repo-root i18n.csv).
// Usage: node scripts/i18n-export.mjs [--todo] [--table <path>] [--out <path>]
//   --todo   only keys whose haw is still empty
// Columns: feature,english,hawaiian,key (UTF-8 with BOM for Excel, CRLF, RFC-4180 quoting, one row per string).
// Newlines inside a value are written as a literal "\n" (backslash escaped as "\\"). Fill the hawaiian column, leave key alone,
// then run: node scripts/i18n-import.mjs i18n.csv
import { writeFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const escapeValue = s => String(s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n");
export const unescapeValue = s => s.replace(/\\(n|\\)/g, (_, c) => (c === "n" ? "\n" : "\\"));
export const placeholdersOf = s => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
// Tag set = sorted list of opening/closing tag names ("<a", "</a", ...); attributes are ignored.
export const tagsOf = s => [...String(s).matchAll(/<(\/?[a-zA-Z][a-zA-Z0-9]*)/g)].map(m => "<" + m[1].toLowerCase()).sort();

// Friendly place name per string-table page id (fallback: the page id itself).
const FEATURES = {
    header: "Common (header/footer/buttons)", footer: "Common (header/footer/buttons)", common: "Common (header/footer/buttons)",
    errors: "Errors", achv: "Achievements", writing: "Writing practice", meta: "Page titles and descriptions",
    quiz: "Quiz", spaced: "Spaced review", home: "Home", units: "Units", unit: "Unit page", type: "Vocab",
    vocab: "Vocab", wordBank: "Word bank", phrases: "Phrases", practice: "Practice sets", flashcards: "Flashcards",
    tutorial: "Tutorials", learning: "Learning map", login: "Login", profile: "Profile", account: "Account settings", help: "Help menu",
};
export const featureOf = page => FEATURES[page] || page;

const csvCell = s => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function formatCsv(strings, { todo = false } = {}) {
    const rows = Object.keys(strings).filter(k => !todo || !strings[k].haw)
        .map(k => [featureOf(strings[k].page), escapeValue(strings[k].en), escapeValue(strings[k].haw || ""), k])
        .sort((a, b) => a[0].localeCompare(b[0]) || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0));
    return "﻿" + [["feature", "english", "hawaiian", "key"], ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

async function loadTable(path) {
    const mod = await import(pathToFileURL(resolve(path)).href + `?t=${Date.now()}`);
    return mod.STRINGS;
}

function arg(name, argv) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const argv = process.argv.slice(2);
    const table = arg("--table", argv) || join(ROOT, "scripts", "i18n-strings.js");
    const outPath = arg("--out", argv) || join(ROOT, "i18n.csv");
    const todo = argv.includes("--todo");
    const strings = await loadTable(table);
    writeFileSync(outPath, formatCsv(strings, { todo }), "utf8");
    const n = Object.keys(strings).filter(k => !todo || !strings[k].haw).length;
    console.log(`Wrote ${n} strings${todo ? " (todo only)" : ""} to ${relative(process.cwd(), outPath) || outPath}`);
}
