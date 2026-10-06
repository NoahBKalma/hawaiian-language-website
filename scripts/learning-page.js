// Learning page: Map | List switch, demo Reset, and the list view's checkpoint state. Progress itself lives in the shared store
// (scripts/learning-progress.js); the map view (scripts/learning-map.js) and this list both render it and write to it.
import { store, TOTAL } from "/scripts/learning-progress.js";
import { createLearningMap } from "/scripts/learning-map.js";

const html = document.documentElement;
const mapEl = document.getElementById("view-map");
const listEl = document.getElementById("view-list");
const toggleBtns = [...document.querySelectorAll(".lv-toggle [data-view]")];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- list view: rows follow the store ---------- */
const rows = [...document.querySelectorAll(".lt-cp")];
const nextBtn = document.getElementById("lt-next");
const nextLabel = document.getElementById("lt-next-label");
const endMsg = document.getElementById("lt-end");

function renderList(done) {
    rows.forEach((row, k) => {
        const isDone = k < done;
        row.classList.toggle("is-done", isDone);
        const status = row.querySelector(".lt-soon");
        if (status) status.textContent = isDone ? "Done" : "Coming soon";
    });
    nextBtn.disabled = !store.canAdvance();
    nextLabel.textContent = done === 0 ? "Begin learning" : "Next checkpoint";
    endMsg.hidden = done < TOTAL;
}
store.subscribe(e => renderList(e.done));
renderList(store.done);
nextBtn.addEventListener("click", () => store.advance("list"));
document.getElementById("lv-reset").addEventListener("click", () => store.reset("hero"));

/* ---------- Map | List ---------- */
// The map is skipped entirely for reduced motion (the list is the static fallback, as in the demo).
const map = reduceMotion.matches ? null : createLearningMap({ root: mapEl, store });
reduceMotion.addEventListener("change", () => location.reload());

function setView(view, { persist = false } = {}) {
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
setView("map");   // map is always the opening view; the toggle only lasts for this visit
