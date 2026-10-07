// Unit shell: ?target=K&n=N. The current unit (n === done + 1) can be finished; finished units (n <= done) open read-only for review.
// Later units redirect to the plan page. Done saves, then opens the next unit (or the plan page after the last one).
import { getTarget, unitStore } from "/scripts/unit-progress.js";
import { isUnlocked, syncLearningStore } from "/scripts/unit-gate.js";
import { checkKey, parsePassed, serializePassed, allPassed, isCorrect } from "/scripts/unit-check-core.js";

addEventListener("pageshow", ev => { if (ev.persisted) location.reload(); });   // bfcache restore: progress may have changed

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const target = getTarget(params.get("target"));
const nRaw = params.get("n");
const n = /^\d+$/.test(nRaw || "") ? Number(nRaw) : NaN;
const planUrl = c => `/pages/units.html?target=${c}`;

const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Real unit body (only units that carry `content`; every other unit keeps the "coming soon" shell).
function renderRich(l, n, N, review, onGate) {
    const c = l.content;
    $("un-plain").hidden = true;
    $("un-rich").hidden = false;
    $("un-rsky").hidden = false;
    $("un-rcrumb-link").textContent = target.name;
    $("un-rcrumb-link").href = planUrl(target.id);
    $("un-rcrumb-n").textContent = `Unit ${n}`;
    $("un-rhaw").textContent = l.haw;
    $("un-ren").textContent = l.en;
    $("un-rf1").textContent = "X";
    $("un-rf2").textContent = c.vocab.length;
    $("un-rn").textContent = `${n}/${N}`;
    const ring = $("un-rfg"), len = 2 * Math.PI * 52;
    ring.style.strokeDasharray = len;
    ring.style.strokeDashoffset = len * (1 - n / N);
    $("un-intro").textContent = c.intro;
    $("un-vocab").innerHTML = c.vocab.map(v => `<li><b lang="haw">${esc(v.haw)}</b><span>${esc(v.en)}</span></li>`).join("");
    $("un-dialogue").innerHTML = c.dialogue.map(d => `<li><span class="un-who">${esc(d.who)}</span><span class="un-line"><b lang="haw">${esc(d.haw)}</b><span class="un-trans" hidden>${esc(d.en)}</span></span></li>`).join("");
    const tog = $("un-en-toggle");
    tog.addEventListener("click", () => {
        const on = tog.getAttribute("aria-pressed") !== "true";
        tog.setAttribute("aria-pressed", String(on));
        tog.textContent = on ? "Hide English" : "Show English";
        document.querySelectorAll(".un-trans").forEach(t => { t.hidden = !on; });
    });
    $("un-checks").innerHTML = c.checks.map((q, qi) => `<fieldset class="un-q" data-q="${qi}"><legend>${esc(q.q)}</legend>`
        + q.options.map((o, oi) => `<button class="btn btn-quiet btn-sm un-opt" type="button" data-o="${oi}">${esc(o)}</button>`).join("")
        + `<p class="un-fb" role="status"></p></fieldset>`).join("");
    const key = checkKey(target.id, n), count = c.checks.length;
    let passed = new Set();
    if (!review) { try { passed = parsePassed(sessionStorage.getItem(key), count); } catch { /* storage blocked */ } }
    const mark = (fs, ok, b) => {
        const fb = fs.querySelector(".un-fb");
        fs.querySelectorAll(".un-opt").forEach(x => x.classList.remove("is-right", "is-wrong"));
        if (b) b.classList.add(ok ? "is-right" : "is-wrong");
        fb.textContent = ok ? "Correct!" : "Not quite. Try another.";
        fb.className = "un-fb " + (ok ? "is-right" : "is-wrong");
    };
    document.querySelectorAll(".un-q").forEach(fs => {
        const qi = Number(fs.dataset.q), q = c.checks[qi];
        if (passed.has(qi)) mark(fs, true, fs.querySelector(`.un-opt[data-o="${q.answer}"]`));
        fs.addEventListener("click", e => {
            const b = e.target.closest(".un-opt");
            if (!b) return;
            const ok = isCorrect(q, b.dataset.o);
            mark(fs, ok, b);
            if (ok && !review) {
                passed.add(qi);
                try { sessionStorage.setItem(key, serializePassed(passed)); } catch { /* storage blocked */ }
                onGate(allPassed(count, passed));
            }
        });
    });
    onGate(review || allPassed(count, passed));
}

(async function () {
    if (!target) { location.replace("/pages/units.html"); return; }
    await unitStore.ready;
    const N = target.units.length;
    const done = unitStore.get(target.id);
    if (!isUnlocked(target.id)) { location.replace(planUrl(target.id)); return; }
    if (!Number.isInteger(n) || n < 1 || n > N || n > done + 1) { location.replace(`${planUrl(target.id)}&notice=future`); return; }
    const review = n <= done;

    let fromList = false;
    try { fromList = sessionStorage.getItem("haw-learning-view") === "list"; } catch { /* storage blocked */ }
    const targetsHref = fromList ? "/pages/learning.html?view=list" : "/pages/learning.html";
    $("un-exit-targets").href = targetsHref;
    $("un-targets").href = targetsHref;

    const l = target.units[n - 1];
    document.title = `${l.en} · ${target.name}`;
    $("un-crumb-link").textContent = target.name;
    $("un-crumb-link").href = planUrl(target.id);
    $("un-crumb-n").textContent = `Unit ${n}`;
    $("un-num").textContent = `Unit ${n} of ${N}`;
    $("un-haw").textContent = l.haw;
    if (/^Unit \d+ name$/.test(l.haw)) $("un-haw").removeAttribute("lang"); else $("un-haw").setAttribute("lang", "haw");   // placeholder names are English
    $("un-en").textContent = l.en;
    $("un-blurb").textContent = l.blurb;
    $("un-min").textContent = "X min";
    $("un-back").href = planUrl(target.id);
    $("un-exit").href = planUrl(target.id);
    $("un-exitbar").hidden = false;
    const btn = $("un-done"), hint = $("un-done-hint");
    let gateOpen = true;
    if (review) {
        $("un-review").hidden = false;
        btn.hidden = true;
    } else if (l.content && l.content.checks && l.content.checks.length) {
        btn.setAttribute("aria-describedby", "un-done-hint");
    }
    const onGate = ok => {
        gateOpen = ok;
        btn.setAttribute("aria-disabled", String(!ok));
        btn.classList.toggle("is-gated", !ok);
        hint.hidden = ok || review;
    };
    if (l.content) renderRich(l, n, N, review, onGate);
    $("un-shell").hidden = false;

    btn.addEventListener("click", () => {
        if (review || !gateOpen || btn.disabled) return;
        btn.disabled = true;
        unitStore.set(target.id, n, { now: true });
        syncLearningStore();                       // mirrors real progress into the learning store (the learning page re-syncs on load too)
        try { sessionStorage.removeItem(checkKey(target.id, n)); } catch { /* storage blocked */ }
        location.href = n < N ? `/pages/unit.html?target=${target.id}&n=${n + 1}` : planUrl(target.id);
    });
})();
