// Unit plan page: ?target=1..5. Lists the target's units (done / current / locked) with a progress ring, an itinerary rail and a
// sticky action bar. Progress comes from unitStore (scripts/unit-progress.js); units are entered on /pages/unit.html.
import { TARGETS, getTarget, unitStore } from "/scripts/unit-progress.js";
import { isUnlocked, completedCount, syncLearningStore } from "/scripts/unit-gate.js";

void TARGETS;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const LABEL = { done: "Done", current: "Up next", locked: "Locked" };
// Placeholder unit names are plain English ("Unit 1 name"); only real Hawaiian titles get lang="haw".
const hawAttr = t => /^Unit \d+ name$/.test(t) ? "" : ' lang="haw"';
const RING = 2 * Math.PI * 52;

const target = getTarget(new URLSearchParams(location.search).get("target"));

if (!target) {
    $("un-error").hidden = false;
} else {
    start(target);
}

async function start(target) {
    await unitStore.ready;
    syncLearningStore();
    if (!isUnlocked(target.id)) {                     // targets open in order: show the friendly message instead of the plan
        document.title = "Target locked";
        $("un-locked-msg").textContent = `Complete the units in target ${target.id - 1} to unlock ${target.name}.`;
        $("un-locked").hidden = false;
        return;
    }
    const units = target.units, N = units.length;
    const plan = $("un-plan"), bird = $("un-rbird"), fg = $("un-rfg");
    const enterHref = n => `/pages/unit.html?target=${target.id}&n=${n}`;

    document.title = `${target.name} units`;
    $("un-title").textContent = `${target.name} units`;
    $("un-crumb").querySelector("b").textContent = target.name;
    $("un-sub").innerHTML = `${N} short stops. The <span lang="haw">ʻiwa</span> circles your progress, then guides you down the route.`;
    $("un-f3").textContent = "X";                    // minutes are placeholders for now (the real l.min values stay in unit-data.js)
    fg.style.strokeDasharray = RING;

    // Clear the old Done flag.
    try { sessionStorage.removeItem("haw-unit-just-done"); } catch { /* storage blocked */ }   // legacy one-shot flag; Done now opens the next unit directly

    const notice = new URLSearchParams(location.search).get("notice");
    if (notice === "future") {
        const nb = $("un-notice");
        nb.textContent = "That unit is not open yet. Finish the units before it first.";
        nb.hidden = false;
    }

    // Build the rail once.
    units.forEach((l, i) => {
        const li = document.createElement("li");
        li.className = "un-leg";
        li.innerHTML = `<div class="un-t"><b>X</b>min in</div><div class="un-rail"><span class="un-dot"></span></div>`
            + `<div class="un-body"><h2${hawAttr(l.haw)}>${esc(l.haw)}</h2><div class="un-en-t">${esc(l.en)}</div><p class="un-b">${esc(l.blurb)}</p>`
            + `<div class="un-meta"><span class="un-chip"></span><span class="un-min">X min</span>`
            + `<a class="btn btn-primary btn-sm un-enter-link" href="${enterHref(i + 1)}" hidden>Enter unit <span class="visually-hidden">${esc(l.en)}</span><span aria-hidden="true">&rarr;</span></a>`
            + `<a class="btn btn-quiet btn-sm un-review-link" href="${enterHref(i + 1)}&review=1" hidden>Review <span class="visually-hidden">${esc(l.en)}</span></a></div></div>`;
        plan.appendChild(li);
    });
    const land = document.createElement("li");
    land.className = "un-land";
    land.innerHTML = `<div class="un-t"><b>X</b>min in</div><div class="un-rail"><span class="un-dot"></span></div>`
        + `<div class="un-body"><h2 id="un-landh">Landing</h2><p id="un-landp"></p></div>`;
    plan.appendChild(land);
    const legs = [...plan.querySelectorAll(".un-leg")];

    const enterBtn = $("un-enter"), backBtn = $("un-back");
    let first = true;

    function perch(d) {
        const el = d >= N ? land : legs[d], dot = el.querySelector(".un-dot"), pr = plan.getBoundingClientRect(), r = dot.getBoundingClientRect();
        bird.style.transform = `translate(${r.left - pr.left + r.width / 2 - bird.offsetWidth / 2}px,${r.top - pr.top - bird.offsetHeight - 6}px)`;
    }

    function render({ scroll = false, announce = "" } = {}) {
        const d = Math.min(unitStore.get(target.id), N);
        legs.forEach((el, i) => {
            const s = i < d ? "done" : i === d ? "current" : "locked";
            el.className = "un-leg " + s;
            const chip = el.querySelector(".un-chip");
            chip.className = "un-chip " + s;
            chip.textContent = LABEL[s];
            el.querySelector(".un-enter-link").hidden = s !== "current";
            el.querySelector(".un-review-link").hidden = s !== "done";
            if (s === "current") el.setAttribute("aria-current", "step"); else el.removeAttribute("aria-current");
        });
        const allDone = d >= N;
        land.className = "un-land" + (allDone ? " done" : "");
        $("un-landh").innerHTML = allDone ? '<span lang="haw">Mahalo nui!</span> Target complete' : "Landing";
        $("un-landp").textContent = allDone ? `All ${N} units are done.` : `Finish all ${N} units to complete this target.`;
        fg.style.strokeDashoffset = RING * (1 - d / N);
        $("un-ringbox").classList.toggle("done", allDone);
        $("un-rn").textContent = `${d}/${N}`;
        $("un-rl").textContent = allDone ? "all done!" : "units done";
        $("un-f1").textContent = `${d}/${N}`;
        $("un-f2").textContent = "X";
        $("un-sum").textContent = allDone ? "Target complete" : `${d} of ${N} · X min left`;

        // One main button: Enter unit / (all done) Back to learning path.
        enterBtn.hidden = allDone;
        backBtn.hidden = !allDone;
        if (!allDone) enterBtn.href = enterHref(d + 1);
        // Target finished: hop on to the next one (the learning page flies the ʻiwa there), or head back after the last.
        const hopOn = allDone && target.id < 5 && target.id === completedCount();
        backBtn.href = hopOn ? "/pages/learning.html?hop=1" : "/pages/learning.html";
        backBtn.innerHTML = hopOn ? 'Next target <span aria-hidden="true">&rarr;</span>' : "Back to learning path";

        $("un-status").textContent = announce || (allDone ? `Target complete. All ${N} units done.`
            : `${d} of ${N} units done. Up next: ${units[d].en}. X minutes left.`);
        perch(d);
        if (scroll) (allDone ? land : legs[d]).scrollIntoView({ block: "center", behavior: reduce.matches || first ? "auto" : "smooth" });
        first = false;
        return d;
    }

    let fromList = false;
    try { fromList = sessionStorage.getItem("haw-learning-view") === "list"; } catch { /* storage blocked */ }
    $("un-back-view-label").textContent = fromList ? "Back to list" : "Back to map";
    $("un-back-view").href = fromList ? "/pages/learning.html?view=list" : "/pages/learning.html";
    $("un-content").hidden = false;
    render({ scroll: true });

    unitStore.subscribe(e => { if (e.target === target.id || e.target == null) render(); });
    addEventListener("resize", () => perch(Math.min(unitStore.get(target.id), N)));
    document.fonts && document.fonts.ready.then(() => perch(Math.min(unitStore.get(target.id), N)));
    // bfcache restore: the learner may have finished a unit in between
    addEventListener("pageshow", ev => { if (ev.persisted) location.reload(); });
}
