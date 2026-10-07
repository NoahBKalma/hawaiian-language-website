// Learning page: Map | List switch, demo Reset, and the list view's target state.
// Target completion is REAL unit progress (scripts/unit-progress.js via scripts/unit-gate.js); the old demo store just mirrors it.
// The main button (map and list) has two modes: "Next target" hops the ʻiwa to the next target, then "Open target" opens its units.
import { store, TOTAL } from "/scripts/learning-progress.js";
import { unitStore, TARGETS } from "/scripts/unit-progress.js";
import { createLearningMap } from "/scripts/learning-map.js";
import { journey as readJourney, writeHop, syncLearningStore, isUnlocked, HOP_KEY, JUST_DONE_KEY, VIEW_KEY } from "/scripts/unit-gate.js";

const html = document.documentElement;
const mapEl = document.getElementById("view-map");
const listEl = document.getElementById("view-list");
const toggleBtns = [...document.querySelectorAll(".lv-toggle [data-view]")];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- journey: what the map and the list both render ---------- */
const bothReady = () => store.isReady && unitStore.isReady;
const listeners = new Set();
const ready = Promise.all([store.ready, unitStore.ready]);
let map = null;

const journey = {
    read: readJourney,
    get isReady() { return bothReady(); },
    ready,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // the map flew the ʻiwa on: remember it for this visit so "Open target" survives navigation
    hop() { writeHop(readJourney().done); renderList(); },
    enter() {
        const r = readJourney().done + 1;
        location.href = `/pages/units.html?target=${r}`;
    }
};
const changed = () => { renderList(); listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };

/* ---------- list view: rows follow the journey ---------- */
const rows = [...document.querySelectorAll(".lt-tg")];
const nextBtn = document.getElementById("lt-next");
const nextLabel = document.getElementById("lt-next-label");
const endMsg = document.getElementById("lt-end");

function renderList() {
    const j = readJourney();
    rows.forEach((row, k) => {
        const n = k + 1, isDone = n <= j.done, locked = !isUnlocked(n), current = j.mode === "enter" && n === j.done + 1;
        row.classList.toggle("is-done", isDone);
        row.classList.toggle("is-locked", locked);
        row.classList.toggle("is-current", current);
        const status = row.querySelector(".lt-soon");
        const total = TARGETS[k] ? TARGETS[k].units.length : 0, units = Math.min(unitStore.get(n), total);
        const started = !locked && !isDone && units > 0;
        const upNext = !locked && !isDone && !current && !started && n === j.done + 1;
        if (status) {
            status.textContent = isDone ? "Done" : locked ? "Locked" : current || started ? "In progress" : upNext ? "Up next" : "Open";
            let u = row.querySelector(".lt-units");
            if (!u) { u = document.createElement("span"); u.className = "lt-units"; status.before(u); }
            u.textContent = total ? `${units}/${total} units` : "";
        }
        const link = row.querySelector(".lt-open"), msg = row.querySelector(".lt-lockmsg");
        if (link) link.hidden = locked;
        if (msg) msg.hidden = !locked;
    });
    nextBtn.disabled = j.mode === "end" || !bothReady();
    nextLabel.textContent = j.label;
    endMsg.hidden = j.mode !== "end";
}

function mainAction() {
    const j = readJourney();
    if (!bothReady() || j.mode === "end") return;
    if (j.mode === "enter") { journey.enter(); return; }
    if (map && map.active) map.hop();                  // animated flight (writes the hop key itself)
    else { journey.hop(); changed(); }                 // list view: no flight, the map picks the new spot up when it is shown
}
nextBtn.addEventListener("click", mainAction);

// Reset the whole demo: unit progress for all 5 targets, the old store, the hop mode and the just-done flag.
document.getElementById("lv-reset").addEventListener("click", () => {
    try { sessionStorage.removeItem(HOP_KEY); sessionStorage.removeItem(JUST_DONE_KEY); } catch { /* storage blocked */ }
    [1, 2, 3, 4, 5].forEach(c => unitStore.reset(c));
    store.reset("hero");
    renderList();
    if (map) map.sync(true);
});

unitStore.subscribe(() => changed());
store.subscribe(() => changed());

/* ---------- Map | List ---------- */
// The map is skipped entirely for reduced motion (the list is the static fallback, as in the demo).
map = reduceMotion.matches ? null : createLearningMap({ root: mapEl, journey });
reduceMotion.addEventListener("change", () => location.reload());

function setView(view, { persist = false } = {}) {
    try { sessionStorage.setItem(VIEW_KEY,view === "list" ? "list" : "map"); } catch { /* storage blocked */ }   // the units page reads this for its back button
    if (view === "map" && !map) view = "list";
    mapEl.hidden = view !== "map";
    listEl.hidden = view !== "list";
    html.classList.toggle("lv-map", view === "map");
    html.classList.toggle("lv-list", view === "list");
    toggleBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    if (view === "map") map.show();
    if (persist) {
        window.scrollTo({ top: 0, behavior: "instant" });
    }
}
toggleBtns.forEach(b => b.addEventListener("click", () => setView(b.dataset.view, { persist: true })));
setView(new URLSearchParams(location.search).get("view") === "list" ? "list" : "map");   // map opens by default; ?view=list is how the units page sends you back to the list
renderList();

/* ---------- once both stores are loaded: mirror unit progress into the demo store, then honour ?hop=1 ---------- */
(async function () {
    await syncLearningStore();
    changed();
    const params = new URLSearchParams(location.search);
    if (params.get("hop") === "1") {
        params.delete("hop");
        const qs = params.toString();
        history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
        if (readJourney().mode === "next") {
            await new Promise(r => requestAnimationFrame(() => setTimeout(r, 350)));   // let the map settle so the flight is seen
            mainAction();
        }
    }
})();

void TOTAL;
