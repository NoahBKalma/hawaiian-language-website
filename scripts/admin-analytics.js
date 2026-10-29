// Admin analytics page: asks GET /admin/me first, then renders summary tiles, filters, tabs, SVG charts and tables from
// /admin/analytics/*. The server enforces access on every route; this page only reacts to the answer.
import { API_BASE_URL } from "/scripts/config.js";
import { getToken } from "/scripts/auth.js";
import { t, applyI18n, onLangChange } from "/scripts/i18n.js";
import { hbar, lineChart, legendHtml } from "/scripts/admin-charts.js";

const app = document.getElementById("adm-app");
const DIRECTIONS = ["hawaiian_to_english", "english_to_hawaiian", "unknown"];
const DEFAULTS = { tab: "total", sub: "sets", range: "30", from: "", to: "", audience: "", visitor: "", user: "", set: "", level: "", direction: "", spaced: "", minSets: "0", minWords: "0", split: true, quiz: false, metric: "rate" };
const F = { ...DEFAULTS };
// Deep link: ?tab=flashcards&sub=words (validated against the real tab names; anything else is ignored)
{
    const q = new URLSearchParams(location.search), tabs = ["total", "flashcards", "writing", "quizzes"];
    const subs = ["sets", "words", "funnel", "activity", "trend", "types", "qwords", "results"];
    if (tabs.includes(q.get("tab"))) F.tab = q.get("tab");
    if (subs.includes(q.get("sub"))) F.sub = q.get("sub");
    else if (F.tab === "quizzes") F.sub = "trend";
}
let options = { set_keys: [], min_frequencies: [], has_spaced: false, has_quiz: false, date_min: null, date_max: null };
let shellBuilt = false, panelCtl = null, kpiCtl = null, seq = 0, view = null, debounce = 0;

/* ---------- helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = x => (x == null ? "" : Math.round(x).toLocaleString("en-US"));
const pct = x => (x == null ? "" : `${(x * 100).toFixed(1)}%`);
const tx = (key, tag = "span", attrs = "", vars) => `<${tag} ${attrs} data-i18n="${key}"${vars ? ` data-i18n-vars='${esc(JSON.stringify(vars))}'` : ""}>${esc(t(key, vars))}</${tag}>`;
const lastSeg = s => String(s).split("/").pop();
const modeName = m => t(m === "writing" ? "admin.tab.writing" : m === "quiz" ? "admin.tab.quizzes" : "admin.tab.flashcards");
const dirName = d => t(d === "unknown" || !d ? "admin.dir.unknown" : `admin.f.direction.${d}`);
const srcName = s => t(`admin.src.${s}`);
const ICON_UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
const ICON_DOWN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`;
const ICON_SORT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5-5 5 5M7 14l5 5 5-5"/></svg>`;
const ICON_CHART = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`;
const ICON_LOCK = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>`;

class AuthError extends Error { constructor(status) { super(`auth ${status}`); this.status = status; } }

async function api(path, params, signal) {
    const url = new URL(API_BASE_URL + path);
    if (params) for (const [k, v] of params) url.searchParams.set(k, v);
    const token = getToken();
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal });
    if (res.status === 401 || res.status === 403) throw new AuthError(res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/* ---------- gate (access check) ---------- */
function gate(kind) {
    shellBuilt = false;
    const g = {
        signin: ["admin.gate.signin.title", "admin.gate.signin.text", `<a class="btn btn-primary" href="/pages/login.html" data-i18n="admin.gate.signin.btn">${esc(t("admin.gate.signin.btn"))}</a>`],
        denied: ["admin.gate.denied.title", "admin.gate.denied.text", `<a class="btn btn-primary" href="/index.html" data-i18n="admin.gate.denied.btn">${esc(t("admin.gate.denied.btn"))}</a>`],
        error: ["admin.gate.error.title", "admin.gate.error.text", `<button type="button" class="btn btn-primary" id="gate-retry" data-i18n="admin.gate.error.btn">${esc(t("admin.gate.error.btn"))}</button>`]
    }[kind];
    app.innerHTML = `<div class="wrap"><div class="adm-gate empty-state" role="${kind === "error" ? "alert" : "status"}">${ICON_LOCK}${tx(g[0], "h1")}<p data-i18n="${g[1]}">${esc(t(g[1]))}</p>${g[2]}</div></div>`;
    applyI18n(app);
    document.getElementById("gate-retry")?.addEventListener("click", start);
}

async function start() {
    app.innerHTML = `<div class="wrap"><div class="adm-state" role="status">${tx("admin.checking")}</div></div>`;
    applyI18n(app);
    if (!getToken()) return gate("signin");
    try {
        await api("/admin/me");
    } catch (error) {
        if (error instanceof AuthError) return gate(error.status === 401 ? "signin" : "denied");
        return gate("error");
    }
    try { options = { ...options, ...(await api("/admin/analytics/options", new URLSearchParams({ include_quiz: "true" }))) }; }
    catch (error) { if (error instanceof AuthError) return gate(error.status === 401 ? "signin" : "denied"); /* filters fall back to empty lists */ }
    if (!options.has_quiz && F.tab === "quizzes") { F.tab = "total"; F.sub = "sets"; }
    buildShell();
    loadAll();
}

/* ---------- shell: header, tiles, filters, tabs ---------- */
function select(id, key, opts, value) {
    return `<div class="field">${tx(key, "label", `for="${id}"`)}<select class="select" id="${id}">${opts.map(([v, label, k]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}${k ? ` data-i18n="${k}"` : ""}>${esc(label)}</option>`).join("")}</select></div>`;
}
function filtersHtml() {
    const k = (v, key) => [v, t(key), key];
    const range = select("f-range", "admin.f.range", [k("7", "admin.f.range.7"), k("30", "admin.f.range.30"), k("90", "admin.f.range.90"), k("custom", "admin.f.range.custom")], F.range);
    const custom = `<div class="field" id="wrap-from"${F.range === "custom" ? "" : " hidden"}>${tx("admin.f.from", "label", 'for="f-from"')}<input class="input" id="f-from" type="date" value="${esc(F.from)}"></div><div class="field" id="wrap-to"${F.range === "custom" ? "" : " hidden"}>${tx("admin.f.to", "label", 'for="f-to"')}<input class="input" id="f-to" type="date" value="${esc(F.to)}"><p class="error" id="date-error" role="alert" hidden></p></div>`;
    const audience = select("f-audience", "admin.f.audience", [["", t("admin.f.audience.all"), "admin.f.audience.all"], ...["account", "non_admin", "anonymous", "deleted"].map(a => k(a, `admin.f.audience.${a}`))], F.audience);
    const setSel = select("f-set", "admin.f.set", [["", t("admin.f.set.all"), "admin.f.set.all"], ...options.set_keys.map(s => [s, s])], F.set);
    const level = select("f-level", "admin.f.level", [["", t("admin.f.level.all"), "admin.f.level.all"], ...options.min_frequencies.map(l => [l, String(l)])], F.level);
    const direction = select("f-direction", "admin.f.direction", [["", t("admin.f.direction.all"), "admin.f.direction.all"], k("hawaiian_to_english", "admin.f.direction.hawaiian_to_english"), k("english_to_hawaiian", "admin.f.direction.english_to_hawaiian")], F.direction);
    const spaced = options.has_spaced ? select("f-spaced", "admin.f.spaced", [["", t("admin.f.spaced.all"), "admin.f.spaced.all"], k("normal", "admin.f.spaced.normal"), k("spaced", "admin.f.spaced.spaced")], F.spaced) : "";
    const text = (id, key, value, extra = "") => `<div class="field">${tx(key, "label", `for="${id}"`)}<input class="input" id="${id}" value="${esc(value)}" autocomplete="off" ${extra}></div>`;
    const ids = `${text("f-visitor", "admin.f.visitor", F.visitor, 'spellcheck="false"')}<div class="field">${tx("admin.f.user", "label", 'for="f-user"')}<input class="input" id="f-user" value="${esc(F.user)}" inputmode="numeric" autocomplete="off" aria-describedby="user-error"><p class="error" id="user-error" role="alert" hidden></p></div>`;
    const mins = ["minSets", "minWords"].map(key => `<div class="field">${tx(`admin.f.${key}`, "label", `for="f-${key}"`)}<input class="input" id="f-${key}" type="number" min="0" step="1" value="${esc(F[key])}" inputmode="numeric"></div>`).join("");
    const checks = `<div class="fchecks"><label><input type="checkbox" id="f-split"${F.split ? " checked" : ""}>${tx("admin.f.split")}</label>${options.has_quiz ? `<label><input type="checkbox" id="f-quiz"${F.quiz ? " checked" : ""}>${tx("admin.f.quiz")}</label>` : ""}</div>`;
    return `<div class="fbody"><div class="fgrid">${range}${custom}${audience}${setSel}${level}${direction}${spaced}${ids}${mins}</div>${checks}<button type="button" class="btn btn-quiet btn-sm" id="f-clear" data-i18n="admin.f.clear">${esc(t("admin.f.clear"))}</button><p class="fnote" data-i18n="admin.filters.note">${esc(t("admin.filters.note"))}</p></div>`;
}
function buildShell() {
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    app.innerHTML = `<div class="wrap adm"><div class="adm-top"><div><span class="eyebrow" data-i18n="admin.eyebrow">${esc(t("admin.eyebrow"))}</span><h1 data-i18n="admin.title">${esc(t("admin.title"))}</h1></div>
      <div class="adm-live"><span class="dot" aria-hidden="true"></span>${tx("admin.live")}<span id="updated">${esc(t("admin.updated", { time: stamp }))}</span><button type="button" class="btn btn-quiet btn-sm" id="refresh" data-i18n="admin.refresh">${esc(t("admin.refresh"))}</button></div></div>
      <div class="kpis" id="kpis" role="group" aria-label="${esc(t("admin.kpi.group"))}" data-i18n-aria-label="admin.kpi.group" aria-busy="true"></div>
      <div class="adm-main"><aside class="adm-filters" aria-label="${esc(t("admin.filters.title"))}" data-i18n-aria-label="admin.filters.title"><details id="fdet" open><summary data-i18n="admin.filters.title">${esc(t("admin.filters.title"))}</summary>${filtersHtml()}</details></aside>
      <div class="adm-view"><div id="tabs"></div><div class="panel" id="panel" aria-live="polite"></div></div></div></div>`;
    applyI18n(app);
    const det = document.getElementById("fdet"), wide = matchMedia("(min-width: 1000px)");
    det.open = wide.matches; // side panel on wide screens, collapsed filters on phones
    wide.onchange = () => { if (wide.matches) det.open = true; };
    document.getElementById("refresh").addEventListener("click", () => { stampNow(); loadAll(); });
    document.getElementById("f-clear").addEventListener("click", () => { Object.assign(F, { ...DEFAULTS, tab: F.tab, sub: F.sub }); buildShell(); loadAll(); });
    const body = app.querySelector(".fbody");
    body.addEventListener("input", onFilterEvent);
    body.addEventListener("change", onFilterEvent);
    shellBuilt = true;
    renderTabs();
}
function stampNow() {
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const el = document.getElementById("updated");
    if (el) el.textContent = t("admin.updated", { time: stamp });
}
function readFilters() {
    const v = id => document.getElementById(id)?.value ?? "";
    F.range = v("f-range") || "30"; F.from = v("f-from"); F.to = v("f-to"); F.audience = v("f-audience"); F.set = v("f-set"); F.level = v("f-level");
    F.direction = v("f-direction"); F.spaced = v("f-spaced"); F.visitor = v("f-visitor").trim(); F.user = v("f-user").trim();
    F.minSets = v("f-minSets") || "0"; F.minWords = v("f-minWords") || "0";
    F.split = document.getElementById("f-split").checked; F.quiz = document.getElementById("f-quiz")?.checked ?? false;
}
function onFilterEvent(e) {
    readFilters();
    const custom = F.range === "custom";
    document.getElementById("wrap-from").hidden = !custom; document.getElementById("wrap-to").hidden = !custom;
    clearTimeout(debounce);
    debounce = setTimeout(loadAll, e.target.type === "checkbox" || e.target.tagName === "SELECT" ? 120 : 400);
}

function renderTabs() {
    const top = ["total", "flashcards", "writing", ...(options.has_quiz ? ["quizzes"] : [])];
    const subs = F.tab === "quizzes" ? ["trend", "types", "qwords", "results"] : ["sets", "words", "funnel", "activity"];
    const host = document.getElementById("tabs");
    host.innerHTML = `<div class="adm-tabs"><div class="tabs" role="tablist" aria-label="${esc(t("admin.tabs.mode"))}" data-i18n-aria-label="admin.tabs.mode">${top.map(k => `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${F.tab === k}" data-i18n="admin.tab.${k}">${esc(t(`admin.tab.${k}`))}</button>`).join("")}</div></div>
      <div class="subtabs" role="tablist" aria-label="${esc(t("admin.tabs.view"))}" data-i18n-aria-label="admin.tabs.view">${subs.map(k => `<button type="button" role="tab" data-sub="${k}" aria-selected="${F.sub === k}" data-i18n="admin.sub.${k}">${esc(t(`admin.sub.${k}`))}</button>`).join("")}</div>`;
    applyI18n(host);
    host.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
        const wasQuiz = F.tab === "quizzes"; F.tab = b.dataset.tab;
        if ((F.tab === "quizzes") !== wasQuiz) F.sub = F.tab === "quizzes" ? "trend" : "sets";
        renderTabs(); host.querySelector(`[data-tab="${F.tab}"]`).focus(); loadAll();
    }));
    host.querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => {
        F.sub = b.dataset.sub; renderTabs(); host.querySelector(`[data-sub="${F.sub}"]`).focus(); loadPanel();
    }));
}

/* ---------- request parameters ---------- */
const todayUtc = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
function dateWindow() {
    if (F.range === "custom") {
        const to = F.to || todayUtc(), from = F.from || options.date_min || addDays(to, -29);
        return { from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1 };
    }
    const days = Number(F.range), to = todayUtc();
    return { from: addDays(to, -(days - 1)), to, days };
}
// Returns URLSearchParams, or null (and shows the field error) when a filter value is invalid
function params({ tab = true } = {}) {
    const win = dateWindow(), p = new URLSearchParams();
    const dateError = document.getElementById("date-error"), userError = document.getElementById("user-error");
    let ok = true;
    if (dateError) { dateError.hidden = win.days >= 1; dateError.textContent = win.days < 1 ? t("admin.f.badDate") : ""; }
    if (win.days < 1) ok = false;
    const badUser = F.user !== "" && !/^\d+$/.test(F.user);
    if (userError) { userError.hidden = !badUser; userError.textContent = badUser ? t("admin.f.badUser") : ""; }
    if (badUser) ok = false;
    if (!ok) return null;
    if (tab) p.set("tab", F.tab === "quizzes" ? "total" : F.tab);
    if (F.quiz && F.tab === "total") p.set("include_quiz", "true");
    if (F.visitor) p.set("visitor_id", F.visitor);
    if (F.user) p.set("user_id", F.user);
    if (F.set) p.set("set_key", F.set);
    if (F.level) p.set("min_frequency", F.level);
    if (F.audience) p.set("audience", F.audience);
    if (F.direction) p.set("direction", F.direction);
    if (F.spaced && options.has_spaced) p.set("spaced", F.spaced);
    p.set("date_from", win.from); p.set("date_to", win.to);
    p.set("split_by_direction", F.split ? "true" : "false");
    p.set("min_set_words", String(Math.max(0, parseInt(F.minSets, 10) || 0)));
    p.set("min_word_attempts", String(Math.max(0, parseInt(F.minWords, 10) || 0)));
    return p;
}

/* ---------- summary tiles ---------- */
function loadAll() { loadKpis(); loadPanel(); }

async function loadKpis() {
    kpiCtl?.abort();
    const ctl = kpiCtl = new AbortController(), host = document.getElementById("kpis");
    if (!host) return;
    const p = params();
    if (!p) return;
    host.setAttribute("aria-busy", "true");
    try {
        const s = await api("/admin/analytics/summary", p, ctl.signal);
        if (ctl.signal.aborted) return;
        const days = dateWindow().days, prev = s.previous || {};
        const tiles = [
            ["visitors", num(s.visitors), rel(s.visitors, prev.visitors)],
            ["started", num(s.decks_started), rel(s.decks_started, prev.decks_started)],
            ["completion", pct(s.completion_rate), diff(s.completion_rate, prev.completion_rate)],
            ["accuracy", pct(s.first_try_accuracy), diff(s.first_try_accuracy, prev.first_try_accuracy)],
            ["answers", num(s.answers), rel(s.answers, prev.answers)]
        ];
        host.innerHTML = tiles.map(([key, value, d]) => `<div class="stat kpi">${tx(`admin.kpi.${key}`)}<strong>${value}</strong>${deltaHtml(d, days)}</div>`).join("");
        applyI18n(host);
        host.setAttribute("aria-busy", "false");
    } catch (error) {
        if (error.name === "AbortError") return;
        if (error instanceof AuthError) return gate(error.status === 401 ? "signin" : "denied");
        host.innerHTML = ""; host.setAttribute("aria-busy", "false");
    }
}
const rel = (now, before) => (before ? (now - before) / before : null);
const diff = (now, before) => (before == null || now == null ? null : now - before);
function deltaHtml(d, days) {
    if (d == null || !Number.isFinite(d)) return `<span class="delta" data-i18n="admin.delta.none">${esc(t("admin.delta.none"))}</span>`;
    const size = `${Math.abs(d * 100).toFixed(1)}%`;
    if (Math.abs(d) < 0.0005) return `<span class="delta" data-i18n="admin.delta.flat" data-i18n-vars='${esc(JSON.stringify({ days }))}'>${esc(t("admin.delta.flat", { days }))}</span>`;
    const key = d > 0 ? "admin.delta.up" : "admin.delta.down", vars = { pct: size, days };
    return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? ICON_UP : ICON_DOWN}<span data-i18n="${key}" data-i18n-vars='${esc(JSON.stringify(vars))}'>${esc(t(key, vars))}</span></span>`;
}

/* ---------- panels ---------- */
const stateHtml = (kind, retry) => {
    const k = { empty: ["admin.state.empty.title", "admin.state.empty.text"], error: ["admin.state.error.title", "admin.state.error.text"], noQuiz: ["admin.state.noQuiz.title", "admin.state.noQuiz.text"] }[kind];
    return `<div class="empty-state" role="${kind === "error" ? "alert" : "status"}">${ICON_CHART}${tx(k[0], "h3")}<p data-i18n="${k[1]}">${esc(t(k[1]))}</p>${retry ? `<button type="button" class="btn btn-primary btn-sm" data-retry data-i18n="admin.state.error.btn">${esc(t("admin.state.error.btn"))}</button>` : ""}</div>`;
};
const skeleton = () => `<div class="box"><div class="adm-skeleton" role="status"><i></i><i></i><i></i><span class="visually-hidden" data-i18n="admin.loading">${esc(t("admin.loading"))}</span></div></div>`;

const ENDPOINTS = { sets: "/sets", words: "/words", funnel: "/funnel", activity: "/activity", trend: "/quiz/trend", types: "/quiz/types", qwords: "/quiz/words", results: "/quiz/results" };

async function loadPanel() {
    panelCtl?.abort();
    const ctl = panelCtl = new AbortController(), my = ++seq, host = document.getElementById("panel");
    if (!host) return;
    const quiz = F.tab === "quizzes";
    if (quiz && !options.has_quiz) { host.innerHTML = stateHtml("noQuiz"); applyI18n(host); return; }
    const p = params({ tab: !quiz });
    if (!p) return;
    host.setAttribute("aria-busy", "true");
    if (!host.firstElementChild) { host.innerHTML = skeleton(); applyI18n(host); }
    try {
        const data = await api(`/admin/analytics${ENDPOINTS[F.sub]}`, p, ctl.signal);
        if (my !== seq) return;
        view = { sub: F.sub, tab: F.tab, data };
        renderView(host);
    } catch (error) {
        if (error.name === "AbortError") return;
        if (error instanceof AuthError) return gate(error.status === 401 ? "signin" : "denied");
        if (my !== seq) return;
        host.innerHTML = `<div class="box">${stateHtml("error", true)}</div>`;
        applyI18n(host);
        host.querySelector("[data-retry]")?.addEventListener("click", loadPanel);
    } finally {
        if (my === seq) host.removeAttribute("aria-busy");
    }
}

function renderView(host) {
    if (!view) return;
    const { sub, data } = view;
    ({ sets: renderSets, words: renderWords, funnel: renderFunnel, activity: renderActivity, trend: renderTrend, types: renderTypes, qwords: renderWords, results: renderResults })[sub](host, data);
    applyI18n(host);
}

/* ---- building blocks ---- */
function chartBox(titleKey, extra = "") {
    return `<section class="box"><div class="box-head">${tx(titleKey, "h2")}${extra}</div><div class="legend-host"></div><div class="chart"></div><p class="readout" aria-live="polite">${esc(t("admin.chart.readout"))}</p></section>`;
}
const tableBox = (titleKey = "admin.table") => `<section class="box"><div class="box-head">${tx(titleKey, "h3")}</div><div class="tbl-host"></div><div class="notes"></div></section>`;
const notesHtml = list => list.filter(Boolean).map(n => `<p class="fnote">${esc(n)}</p>`).join("");

// Sorted, clickable-header table; `cols`: [{ key, label, fmt?, haw? }]. Numbers sort high to low first, text A to Z first.
function table(host, caption, cols, rows, sortKey, desc) {
    if (!rows.length) { host.innerHTML = stateHtml("empty"); return; }
    let sk = sortKey, sd = desc;
    const draw = () => {
        const sorted = rows.slice().sort((a, b) => {
            const x = a[sk], y = b[sk];
            if (typeof x === "string" || typeof y === "string") return sd ? String(y ?? "").localeCompare(String(x ?? "")) : String(x ?? "").localeCompare(String(y ?? ""));
            return sd ? (y ?? -Infinity) - (x ?? -Infinity) : (x ?? -Infinity) - (y ?? -Infinity);
        });
        const head = cols.map(c => `<th scope="col" aria-sort="${c.key === sk ? (sd ? "descending" : "ascending") : "none"}"><button type="button" data-k="${c.key}">${esc(c.label)}${ICON_SORT}</button></th>`).join("");
        const body = sorted.map(r => `<tr>${cols.map(c => { const v = r[c.key]; return `<td${c.haw ? ' lang="haw"' : ""}>${c.fmt ? c.fmt(v, r) : esc(v)}</td>`; }).join("")}</tr>`).join("");
        host.innerHTML = `<div class="tbl-wrap" tabindex="0" role="region" aria-label="${esc(t("admin.scroll", { caption }))}"><table class="tbl"><caption>${esc(t("admin.caption", { caption, n: rows.length }))}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
        host.querySelectorAll("thead button").forEach(b => b.addEventListener("click", () => {
            const k = b.dataset.k;
            if (k === sk) sd = !sd; else { sk = k; sd = k !== cols[0].key; }
            draw(); host.querySelector(`thead button[data-k="${k}"]`).focus();
        }));
    };
    draw();
}
const col = (key, labelKey, fmt, haw) => ({ key, label: t(labelKey), fmt, haw });

const peak = item => Math.max(0, ...item.vals.filter(v => v != null));

// One bar row per label; with Split by direction on, one bar per direction present in the data
function barItems(rows, { labelOf, tipOf, valueOf, fmt, limit, haw }) {
    const split = F.split && rows.some(r => r.direction);
    const dirs = split ? DIRECTIONS.filter(d => rows.some(r => (r.direction || "unknown") === d)) : [null];
    const byLabel = new Map();
    for (const r of rows) {
        const label = labelOf(r), item = byLabel.get(label) || { label, vals: dirs.map(() => null), full: tipOf ? tipOf(r) : label, haw };
        const i = split ? dirs.indexOf(r.direction || "unknown") : 0;
        item.vals[i] = valueOf(r) || 0;
        byLabel.set(label, item);
    }
    const items = [...byLabel.values()].sort((a, b) => peak(b) - peak(a) || a.label.localeCompare(b.label)).slice(0, limit);
    const max = Math.max(0, ...items.flatMap(i => i.vals.filter(v => v != null)));
    const names = split ? dirs.map(dirName) : null;
    for (const item of items) {
        item.texts = item.vals.map(v => (v == null ? "" : fmt(v)));
        item.tip = `${item.full}: ${item.vals.flatMap((v, i) => (v == null ? [] : [`${names ? `${names[i]} ` : ""}${fmt(v)}`])).join(", ")}`;
    }
    return { items, max, names, split };
}
function drawBars(box, built, singleName) {
    const names = built.names || [singleName];
    box.querySelector(".legend-host").innerHTML = names.length > 1 ? legendHtml(names) : "";
    const ro = box.querySelector(".readout");
    hbar(box.querySelector(".chart"), built.items, names, built.max, text => { ro.textContent = text; });
}

/* ---- Sets ---- */
function renderSets(host, data) {
    const metrics = { rate: ["admin.metric.rate", r => r.first_pass_incorrect_rate, pct], incorrect: ["admin.metric.incorrect", r => r.incorrect, num], hints: ["admin.metric.hints", r => r.hints, num] };
    const picker = `<div class="field"><label for="metric" data-i18n="admin.metric">${esc(t("admin.metric"))}</label><select class="select" id="metric">${Object.entries(metrics).map(([k, m]) => `<option value="${k}"${k === F.metric ? " selected" : ""} data-i18n="${m[0]}">${esc(t(m[0]))}</option>`).join("")}</select></div>`;
    host.innerHTML = chartBox("admin.sets.title", picker) + tableBox();
    host.querySelector("#metric").addEventListener("change", e => { F.metric = e.target.value; renderView(host); host.querySelector("#metric").focus(); });
    const rows = data.rows || [], [, valueOf, fmt] = metrics[F.metric];
    const mixedLevels = new Set(rows.map(r => r.min_frequency)).size > 1, withMode = F.tab === "total";
    const box = host.querySelector(".box");
    if (!rows.length) { box.querySelector(".chart").innerHTML = stateHtml("empty"); box.querySelector(".readout").remove(); }
    else drawBars(box, barItems(rows, {
        labelOf: r => `${r.set_key}${withMode ? ` · ${modeName(r.mode)}` : ""}${mixedLevels ? ` · ${t("admin.col.level")} ${r.min_frequency}` : ""}`,
        valueOf, fmt, limit: 12
    }), t(metrics[F.metric][0]));
    const cols = [col("set_key", "admin.col.set"), ...(withMode ? [col("mode", "admin.col.mode", modeName)] : []), ...(mixedLevels ? [col("min_frequency", "admin.col.level")] : []),
        ...(F.split ? [col("direction", "admin.col.direction", dirName)] : []), col("distinct_visitors", "admin.col.visitors", num), col("first_pass_incorrect_rate", "admin.col.missRate", pct),
        col("incorrect", "admin.col.incorrect", num), col("hints", "admin.col.hints", num), col("attempts", "admin.col.answers", num)];
    table(host.querySelector(".tbl-host"), t("admin.sets.title"), cols, rows, "first_pass_incorrect_rate", true);
    host.querySelector(".notes").innerHTML = notesHtml([listNote(rows, data), F.split ? t("admin.note.split") : ""]);
}
function listNote(rows, data) {
    return [t("admin.note.rows", { shown: rows.length }), data.hidden_count ? t("admin.note.hidden", { hidden: data.hidden_count }) : "", data.truncated ? t("admin.note.trunc") : ""].filter(Boolean).join(" ");
}

/* ---- Words (also the quiz "Hardest words") ---- */
function renderWords(host, data) {
    const quiz = F.tab === "quizzes";
    host.innerHTML = chartBox(quiz ? "admin.qwords.title" : "admin.words.title") + tableBox();
    const rows = (data.rows || []).map(r => ({ ...r, word: String(r.word_hawaiian ?? "").normalize("NFC"), miss_rate: r.words_seen ? 1 - r.first_try_correct_words / r.words_seen : null }));
    const box = host.querySelector(".box");
    const mixed = new Set(rows.map(r => r.set_key)).size > 1 && !F.set;
    if (!rows.length) { box.querySelector(".chart").innerHTML = stateHtml("empty"); box.querySelector(".readout").remove(); }
    else drawBars(box, barItems(rows, { labelOf: r => `${r.word}${mixed ? ` · ${lastSeg(r.set_key)}` : ""}`, tipOf: r => `${r.word}${mixed ? ` · ${r.set_key}` : ""}`, valueOf: r => r.incorrect, fmt: num, limit: 10, haw: true }), t("admin.metric.incorrect"));
    const cols = [col("word", "admin.col.word", undefined, true), ...(mixed || quiz ? [col("set_key", "admin.col.set")] : []), ...(F.split ? [col("direction", "admin.col.direction", dirName)] : []),
        col("miss_rate", "admin.col.missRate", pct), col("incorrect", "admin.col.incorrect", num), col("hints", "admin.col.hints", num), col("gave_up", "admin.col.gaveUp", num), col("attempts", "admin.col.answers", num)];
    table(host.querySelector(".tbl-host"), t(quiz ? "admin.qwords.title" : "admin.words.title"), cols, rows, "incorrect", true);
    host.querySelector(".notes").innerHTML = notesHtml([listNote(rows, data), t("admin.note.top10"), F.split ? t("admin.note.split") : ""]);
}

/* ---- Funnel ---- */
function renderFunnel(host, data) {
    const rows = (data.rows || []).map(r => ({ ...r, start_rate: r.opened ? r.started / r.opened : null, finish_rate: r.started ? r.completed / r.started : null }));
    host.innerHTML = chartBox("admin.funnel.title") + tableBox() + `<section class="box"><div class="box-head">${tx("admin.detail.title", "h3")}</div><div class="detail-host"></div><div class="detail-notes"></div></section>`;
    const box = host.querySelector(".box"), tot = rows.reduce((a, r) => ({ o: a.o + r.opened, s: a.s + r.started, c: a.c + r.completed }), { o: 0, s: 0, c: 0 });
    if (!rows.length) { box.querySelector(".chart").innerHTML = stateHtml("empty"); box.querySelector(".readout").remove(); }
    else {
        const stages = [["admin.col.opened", tot.o, null], ["admin.col.started", tot.s, tot.o ? tot.s / tot.o : 0], ["admin.col.completed", tot.c, tot.s ? tot.c / tot.s : 0]];
        const items = stages.map(([key, n, share]) => ({ label: t(key), vals: [n], texts: [share == null ? num(n) : `${num(n)} · ${pct(share)}`], tip: share == null ? t("admin.funnel.stageTip", { stage: t(key), n: num(n) }) : t("admin.funnel.tip", { stage: t(key), n: num(n), pct: pct(share) }) }));
        drawBars(box, { items, max: tot.o, names: null }, t("admin.sub.funnel"));
    }
    const withMode = F.tab === "total", pill = limit => v => (v == null ? "" : `<span class="pill${v < limit ? " warn" : ""}">${pct(v)}</span>`);
    table(host.querySelector(".tbl-host"), t("admin.funnel.title"), [col("set_key", "admin.col.set"), ...(withMode ? [col("mode", "admin.col.mode", modeName)] : []), col("opened", "admin.col.opened", num), col("started", "admin.col.started", num), col("completed", "admin.col.completed", num),
        col("start_rate", "admin.col.startRate", pill(0.7)), col("finish_rate", "admin.col.finishRate", pill(0.6))], rows, "start_rate", false);
    host.querySelector(".notes").innerHTML = notesHtml([F.quiz && F.tab === "total" ? t("admin.note.funnel") : ""]);
    const detail = data.detail || [];
    table(host.querySelector(".detail-host"), t("admin.detail.title"), [col("status", "admin.col.status", s => esc(t(`admin.status.${s}`))), col("set_key", "admin.col.set"), ...(withMode ? [col("mode", "admin.col.mode", modeName)] : []),
        col("visitor_id", "admin.col.visitor", v => esc(String(v ?? "").slice(0, 8))), col("user_id", "admin.col.user"), col("source", "admin.col.source", s => esc(srcName(s)))], detail, "status", false);
    host.querySelector(".detail-notes").innerHTML = notesHtml([data.detail_truncated ? t("admin.note.trunc") : ""]);
}

/* ---- Activity and quiz line views ---- */
function renderActivity(host, data) {
    host.innerHTML = chartBox("admin.activity.title") + tableBox();
    const rows = data.rows || [], box = host.querySelector(".box");
    if (!rows.length) { box.querySelector(".chart").innerHTML = stateHtml("empty"); box.querySelector(".readout").remove(); }
    else {
        const names = [t("admin.series.answers"), t("admin.series.opens"), t("admin.series.starts")];
        box.querySelector(".legend-host").innerHTML = legendHtml(names);
        const ro = box.querySelector(".readout"); ro.textContent = t("admin.chart.readoutLine");
        lineChart(box.querySelector(".chart"), rows.map(r => r.day), [{ name: names[0], vals: rows.map(r => r.attempts) }, { name: names[1], vals: rows.map(r => r.opens) }, { name: names[2], vals: rows.map(r => r.starts) }], num, 0, text => { ro.textContent = text; });
    }
    table(host.querySelector(".tbl-host"), t("admin.activity.title"), [col("day", "admin.col.day"), col("opens", "admin.col.opens", num), col("starts", "admin.col.starts", num), col("attempts", "admin.col.answers", num)], rows.slice(), "day", true);
}
const quizNotes = () => notesHtml([F.direction ? t("admin.note.quizDir") : ""]);
function renderTrend(host, data) {
    host.innerHTML = chartBox("admin.trend.title") + tableBox();
    const rows = data.rows || [], box = host.querySelector(".box");
    if (!rows.length) { box.querySelector(".chart").innerHTML = stateHtml("empty"); box.querySelector(".readout").remove(); }
    else {
        const ro = box.querySelector(".readout"); ro.textContent = t("admin.chart.readoutLine");
        lineChart(box.querySelector(".chart"), rows.map(r => r.day), [{ name: t("admin.series.score"), vals: rows.map(r => r.avg_pct) }], v => `${Math.round(v)}%`, 100, text => { ro.textContent = text; });
    }
    table(host.querySelector(".tbl-host"), t("admin.trend.title"), [col("day", "admin.col.day"), col("quizzes", "admin.col.quizzes", num), col("avg_pct", "admin.col.avg", v => (v == null ? "" : `${v.toFixed(1)}%`))], rows.slice(), "day", true);
    host.querySelector(".notes").innerHTML = quizNotes();
}
function renderTypes(host, data) {
    host.innerHTML = chartBox("admin.types.title") + tableBox();
    const rows = (data.rows || []).map(r => ({ ...r, name: t(`admin.qtype.${r.question_type}`) })), box = host.querySelector(".box");
    if (!rows.length) { box.querySelector(".chart").innerHTML = stateHtml("empty"); box.querySelector(".readout").remove(); }
    else {
        const items = rows.map(r => ({ label: r.name, vals: [(r.accuracy ?? 0) / 100], texts: [r.accuracy == null ? "" : `${r.accuracy.toFixed(1)}%`], tip: `${r.name}: ${r.accuracy == null ? "" : `${r.accuracy.toFixed(1)}%`}` }));
        drawBars(box, { items, max: 1, names: null }, t("admin.col.accuracy"));
    }
    table(host.querySelector(".tbl-host"), t("admin.types.title"), [col("name", "admin.col.type"), col("total", "admin.col.total", num), col("correct", "admin.col.correct", v => (v == null ? "" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 }))), col("accuracy", "admin.col.accuracy", v => (v == null ? "" : `${v.toFixed(1)}%`))], rows, "accuracy", true);
    host.querySelector(".notes").innerHTML = quizNotes();
}
function renderResults(host, data) {
    host.innerHTML = tableBox("admin.results.title");
    const rows = (data.rows || []).map(r => ({ ...r, when: String(r.occurred_at ?? "").replace("T", " ").slice(0, 16), score_label: r.score }));
    table(host.querySelector(".tbl-host"), t("admin.results.title"), [col("when", "admin.col.when"), col("set_key", "admin.col.set"), col("source", "admin.col.source", s => esc(srcName(s))), col("user_id", "admin.col.user"),
        col("visitor_id", "admin.col.visitor", v => esc(String(v ?? "").slice(0, 8))), col("score", "admin.col.score", (v, r) => `${v} / ${r.question_count}`), col("unanswered", "admin.col.unanswered", num)], rows, "when", true);
    host.querySelector(".notes").innerHTML = notesHtml([data.truncated ? t("admin.note.trunc") : "", F.direction ? t("admin.note.quizDir") : ""]);
}

/* ---------- boot ---------- */
let resizeTimer = 0;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { const host = document.getElementById("panel"); if (host && view) renderView(host); }, 150); });
onLangChange(() => { if (shellBuilt) { buildShell(); view = null; loadAll(); } });
start();
