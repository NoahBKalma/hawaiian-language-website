import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tool = await import(pathToFileURL(join(ROOT, "scripts", "i18n-tool.mjs")).href);

const csv = rows => tool.formatCsvRows(rows);
const SAMPLE = csv([
    ["A", "Hello", "", "a.title"],
    ["A", "{n} Cards\\nStudied", "", "a.count"],
    ["B", "See <b>this</b> and <a href=\"/x\">that</a>", "", "b.body-html"],
    ["B", "Done", "Pau", "b.done"],
]);

test("parseTable: unescapes, NFC, flags duplicate and bad keys", () => {
    const { entries, errors } = tool.parseTable(SAMPLE);
    assert.deepEqual(errors, []);
    assert.equal(entries[1].en, "{n} Cards\nStudied");
    assert.equal(entries[3].haw, "Pau");
    const dup = tool.parseTable(csv([["A", "x", "", "a.t"], ["A", "y", "", "a.t"], ["A", "z", "", "nodot"]]));
    assert.equal(dup.errors.length, 2);
    assert.match(dup.errors.join("\n"), /duplicate key/);
    assert.match(tool.parseTable("a,b\r\n").errors[0], /header/);
});

test("validateEntries: rejects placeholder and tag mismatches, accepts matching Hawaiian", () => {
    const e = tool.parseTable(SAMPLE).entries;
    const probs = tool.validateEntries([
        { ...e[1], haw: "{m} Cards" },
        { ...e[2], haw: "See <b>this</b>" },
        { ...e[1], haw: "{n} Kāleka" },
        { ...e[0], en: "" },
    ]);
    assert.equal(probs.length, 3);
    assert.match(probs[0], /^A \| \{n\} Cards\\nStudied \| placeholders differ/);
    assert.match(probs[1], /HTML tags differ/);
    assert.match(probs[2], /english is empty/);
});

test("toJson is one key per line; bumpVersion bumps exactly one ?v=", () => {
    const { entries } = tool.parseTable(SAMPLE);
    const out = tool.toJson(entries);
    assert.equal(out.split("\n").length, entries.length + 3);
    assert.equal(JSON.parse(out)["b.done"].haw, "Pau");
    assert.equal(tool.bumpVersion("new URL(`./i18n-strings.json?v=7`)"), "new URL(`./i18n-strings.json?v=8`)");
    assert.throws(() => tool.bumpVersion("nothing"));
});

// CLI tests run only against a temp copy of the real CSV.
function temp() {
    const dir = mkdtempSync(join(tmpdir(), "i18n-tool-"));
    const p = { csv: join(dir, "i18n.csv"), json: join(dir, "i18n-strings.json"), i18n: join(dir, "i18n.js") };
    copyFileSync(join(ROOT, "i18n.csv"), p.csv);
    writeFileSync(p.i18n, "new URL(`./i18n-strings.json?v=3`, import.meta.url);\n");
    return { dir, ...p, args: ["--csv", p.csv, "--json", p.json, "--i18n", p.i18n] };
}
const run = (cmd, args) => spawnSync(process.execPath, [join(ROOT, "scripts", "i18n-tool.mjs"), cmd, ...args], { encoding: "utf8" });

test("cli: build, merge (unsorted partial CSV), reject leaves files untouched, add, todo", () => {
    const t = temp();
    assert.equal(run("build", t.args).status, 0);
    assert.match(readFileSync(t.i18n, "utf8"), /\?v=4/);
    assert.equal(run("build", t.args).status, 0);
    assert.match(readFileSync(t.i18n, "utf8"), /\?v=4/, "idempotent");
    assert.equal(run("build", [...t.args, "--check"]).status, 0);

    const rows = tool.parseCsv(readFileSync(t.csv, "utf8")).slice(1);
    const plain = rows.find(r => !r[2] && !/[{<\\]/.test(r[1]));
    const withVar = rows.find(r => /\{\w+\}/.test(r[1]));
    const good = join(t.dir, "good.csv");
    writeFileSync(good, csv([[...plain.slice(0, 2), 'TEST, "x"', plain[3]]]));
    assert.equal(run("merge", [good, ...t.args]).status, 0);
    const j = JSON.parse(readFileSync(t.json, "utf8"));
    assert.equal(j[plain[3]].haw, 'TEST, "x"');
    assert.match(readFileSync(t.i18n, "utf8"), /\?v=5/);
    assert.equal(run("build", [...t.args, "--check"]).status, 0);

    const bad = join(t.dir, "bad.csv");
    writeFileSync(bad, csv([[withVar[0], withVar[1], "TEST {wrongvar}", withVar[3]]]));
    const before = readFileSync(t.csv, "utf8");
    const r = run("merge", [bad, ...t.args]);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(`${withVar[0]} | ${withVar[1]} | placeholders differ`), r.stderr);
    assert.equal(readFileSync(t.csv, "utf8"), before);

    const entries = join(t.dir, "new.txt");
    writeFileSync(entries, `  "zz.test": { page: "zz", en: "Brand new", haw: "" },\n  "${plain[3]}": { page: "x", en: "${plain[1]}", haw: "" },\n`);
    assert.equal(run("add", [entries, ...t.args]).status, 0);
    assert.equal(JSON.parse(readFileSync(t.json, "utf8"))["zz.test"].en, "Brand new");
    writeFileSync(entries, `  "zz.test": { page: "zz", en: "Different", haw: "" },\n`);
    assert.equal(run("add", [entries, ...t.args]).status, 1);

    const out = join(t.dir, "todo.csv");
    assert.equal(run("todo", ["--out", out, ...t.args]).status, 0);
    assert.ok(readFileSync(out, "utf8").startsWith("﻿feature,english,hawaiian,key\r\n"));
});

test("parseFlags: strict about unknown options, missing values and file arguments", () => {
    assert.deepEqual(tool.parseFlags("build", ["--check"]).flags, { "--check": true });
    assert.deepEqual(tool.parseFlags("merge", ["x.csv", "--csv", "a.csv"]), { flags: { "--csv": "a.csv" }, pos: ["x.csv"] });
    assert.throws(() => tool.parseFlags("build", ["--bogus"]), /unknown option --bogus/);
    assert.throws(() => tool.parseFlags("build", ["--csv"]), /needs a value/);
    assert.throws(() => tool.parseFlags("build", ["--csv", "--check"]), /needs a value/);
    assert.throws(() => tool.parseFlags("merge", []), /exactly 1 file/);
    assert.throws(() => tool.parseFlags("check", ["extra"]), /no file arguments/);
    assert.equal(run("build", ["--bogus"]).status, 2);
});
