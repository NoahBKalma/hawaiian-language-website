import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const url = p => pathToFileURL(join(ROOT, p)).href;
const imp = await import(url("scripts/i18n-import.mjs"));

const SAMPLE = {
    "a.title": { page: "a", en: "Hello", haw: "" },
    "a.count": { page: "a", en: "{n} Cards\nStudied", haw: "" },
    "b.body-html": { page: "b", en: "See <b>this</b> and <a href=\"/x\">that</a>", haw: "" },
    "b.done": { page: "b", en: "Done", haw: "Pau" },
};

test("validate: rejects unknown keys, placeholder and tag mismatches; skips unchanged English", () => {
    const entries = [
        { key: "nope", value: "x", feature: "F" },
        { key: "a.count", value: "{m} Cards", feature: "F" },
        { key: "b.body-html", value: "See <b>this</b>", feature: "F" },
        { key: "a.title", value: "Hello", feature: "F" },
        { key: "a.count", value: "{n} Kāleka", feature: "F" },
    ];
    const { updates, rejections } = imp.validateImport(entries, SAMPLE);
    assert.equal(rejections.length, 3);
    assert.match(rejections[0], /unknown key/);
    assert.match(rejections[1], /placeholders differ/);
    assert.match(rejections[2], /HTML tags differ/);
    assert.match(rejections[1], /^F | {n} Cards\nStudied | /);
    assert.deepEqual(updates, { "a.count": "{n} Kāleka" });
});

test("applyUpdates rewrites only haw on the matching line; bumpVersion bumps once", () => {
    const src = `export const STRINGS = {\n  "a.title": { page: "a", en: "Say \\"hi\\" haw: \\"x\\"", haw: "" },\n  "a.other": { page: "a", en: "Hi", haw: "" },\n};\n`;
    const { src: out, changed } = imp.applyUpdates(src, { "a.title": "Aloha \"e\"" });
    assert.equal(changed, 1);
    const lines = out.split("\n");
    assert.equal(lines[1], `  "a.title": { page: "a", en: "Say \\"hi\\" haw: \\"x\\"", haw: "Aloha \\"e\\"" },`);
    assert.equal(lines[2], src.split("\n")[2]);
    assert.equal(imp.applyUpdates(out, { "a.title": "Aloha \"e\"" }).changed, 0);
    assert.equal(imp.bumpVersion(`import { S } from "./i18n-strings.js?v=7";`), `import { S } from "./i18n-strings.js?v=8";`);
    assert.throws(() => imp.bumpVersion("nothing"));
});

// Real-table tests run only against a temp copy.
function tempCopy() {
    const dir = mkdtempSync(join(tmpdir(), "i18n-import-"));
    const table = join(dir, "i18n-strings.js");
    const i18n = join(dir, "i18n.js");
    copyFileSync(join(ROOT, "scripts", "i18n-strings.js"), table);
    writeFileSync(i18n, `import { STRINGS } from "./i18n-strings.js?v=3";\n`);
    return { dir, table, i18n };
}
const run = (script, args) => spawnSync(process.execPath, [join(ROOT, "scripts", script), ...args], { encoding: "utf8" });

test("csv: export, unsorted rows import, placeholder mismatch rejected, nothing written on reject", async () => {
    const { dir, table, i18n } = tempCopy();
    const csv = join(dir, "t.csv");
    execFileSync(process.execPath, [join(ROOT, "scripts", "i18n-export.mjs"), "--table", table, "--out", csv]);
    const raw = readFileSync(csv, "utf8");
    assert.ok(raw.startsWith("﻿feature,english,hawaiian,key\r\n"));
    const rows = imp.parseCsv(raw);
    const { STRINGS } = await import(pathToFileURL(table).href + "?d");
    assert.equal(rows.length - 1, Object.keys(STRINGS).length);
    const K = 3, H = 2;
    const plain = rows.slice(1).find(r => !STRINGS[r[K]].haw && !/\{|</.test(STRINGS[r[K]].en) && !/\n/.test(STRINGS[r[K]].en));
    const withVar = rows.slice(1).find(r => /\{\w+\}/.test(STRINGS[r[K]].en));
    const q = r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",");
    const write = (file, rs) => writeFileSync(file, [q(rows[0]), ...rs.map(q)].join("\r\n"));
    const withHaw = (r, v) => Object.assign([...r], { [H]: v });
    const good = join(dir, "good.csv");
    write(good, [...rows.slice(1)].reverse().map(r => (r === plain ? withHaw(r, 'TEST, "x"') : r)));
    const rg = run("i18n-import.mjs", [good, "--table", table, "--i18n", i18n]); assert.equal(rg.status, 0, rg.stderr);
    const { STRINGS: S2 } = await import(pathToFileURL(table).href + "?e");
    assert.equal(S2[plain[K]].haw, 'TEST, "x"');
    assert.match(readFileSync(i18n, "utf8"), /\?v=4/);
    assert.equal(run("i18n-import.mjs", [good, "--table", table, "--i18n", i18n]).status, 0);
    assert.match(readFileSync(i18n, "utf8"), /\?v=4/, "idempotent");

    const bad = join(dir, "bad.csv");
    write(bad, [withHaw(withVar, "TEST {wrongvar}")]);
    const after = readFileSync(table, "utf8");
    const r = run("i18n-import.mjs", [bad, "--table", table, "--i18n", i18n]);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(`${withVar[0]} | ${withVar[1]} | placeholders differ`), r.stderr);
    assert.equal(readFileSync(table, "utf8"), after);
});
