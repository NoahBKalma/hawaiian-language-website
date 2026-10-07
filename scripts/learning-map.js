// Learning page: interactive ʻiwa map. Port of the island-scroll demo (variant B) - a stepped journey. The main button (and →) has two modes:
// "Next target" flies the ʻiwa to the next target WITHOUT completing it, then "Open target" opens that target's units.
// Completion comes only from real unit progress. PAGE SCROLL ONLY ZOOMS THE CAMERA (it never moves the bird).
// `journey` (from learning-page.js) supplies read() -> { done, mode, hopped }, hop(), enter(), subscribe(fn), isReady.
// Everything global (window scroll, document keys, resize) goes through ctx = { isActive(), headerH() }: a hidden map is inert.
// The map is built lazily on the first show() because its geometry (getBBox, rects) is zero while the view is display:none.
import { MAP_DATA } from "/scripts/learning-map-data.js";

const TOTAL_CP = 5;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const f2 = n => Math.round(n * 100) / 100;

/* ---------- island + target markup, generated from the data (same structure the demo's static page used) ---------- */
function islandHtml(i, it) {
    const cards = it.targets.map((c, k) =>
        // Placeholder copy for now: the real Hawaiian title (c.title) and description (c.text) stay in the data, swap them back in here.
        `<li class="tg" data-k="${k + 1}"><span class="ty">${esc(c.type[0].toUpperCase() + c.type.slice(1))}</span><b class="vb">${i === 0 ? `<a class="tg-link" data-href="/pages/units.html?target=${k + 1}" href="/pages/units.html?target=${k + 1}">Title<span class="visually-hidden"> units</span></a>` : "Title"}</b><span class="tx">Description</span><span class="sr-state"></span></li>`).join("");
    const open = it.available !== false;
    return `<section class="island${open ? "" : " soon"}" data-island="${i}" aria-labelledby="isl-${i}"><div class="isl-art"><div class="isl-name"><span class="lv">Level ${it.level}</span>`
        + `<h2 id="isl-${i}" lang="haw">${esc(it.name)}</h2>${open ? "" : '<span class="soon-tag">Coming soon</span>'}</div>`
        + `<svg class="isl-svg" viewBox="0 0 200 140" aria-hidden="true" focusable="false"><path class="shore" d="${it.path}"/><path class="high" d="${it.path}" transform="translate(100 70) scale(.62) translate(-100 -70)"/></svg></div>`
        + `<ol class="cards" aria-label="Targets for ${esc(it.name)}">${cards}</ol></section>`;
}
function chainIslandHtml(i, it) {
    const s = it.scale * 0.9, hw = 90 * s, hh = 62 * s, x = it.chainX, y = it.chainY, side = it.labelSide || "below";
    const [lx, ly, anchor] = { below: [x, y + hh + 22, "middle"], above: [x, y - hh - 8, "middle"], left: [x - hw - 10, y + 7, "end"], right: [x + hw + 10, y + 7, "start"] }[side];
    return `<g class="chain-island${it.available === false ? " soon" : ""}" data-island="${i}"><g transform="translate(${x} ${y}) scale(${s.toFixed(3)}) translate(-100 -70)"><path d="${it.path}"/></g>`
        + `<text x="${lx.toFixed(0)}" y="${ly.toFixed(0)}" text-anchor="${anchor}" data-side="${side}" lang="haw">Level ${it.level}: ${esc(it.name)}</text></g>`;
}

/* ---------- core: the stage, spacer and HUD (scroll position = camera zoom; journey position comes from the controller) ---------- */
function makeCore(o) {
    const T = { island: 2.2, zoom: 1.5, tgStart: 0.2, tgLen: 0.115, exitStart: 0.94 };   // travel in screens; phases in island progress
    const spacer = o.spacer, stage = o.stage, hud = o.hud, root = o.root;
    const islands = [].slice.call(stage.querySelectorAll(".island")), N = islands.length;
    const cards = islands.map(el => [].slice.call(el.querySelectorAll(".tg")));
    const chainIslands = [].slice.call(stage.querySelectorAll(".chain-island"));
    const hudLabel = hud.querySelector(".hud-label"), hudBar = hud.querySelector(".hud-bar");
    const names = islands.map(el => el.querySelector("h2").textContent);
    const setVar = (el, name, val) => { const c = el.__v || (el.__v = {}); if (c[name] !== val) { c[name] = val; el.style.setProperty(name, val); } };
    let stageH = 0, lastW = -1, lastH = -1, spacerTop = 0, travel = 0, visible = true, dirty = true, raf = 0, limitScreens = Infinity;
    const cache = { states: [], key: "", active: -1 };
    const S = { P: 0, Pcam: 0, i: 0, p: 0, zoom: 0, inZoom: false, tgs: [0, 0, 0, 0, 0], hudChanges: 0, hudText: "" };

    // Stage height = viewport minus the site header (sticky, so the pin starts when the spacer top reaches the header's bottom edge).
    function measure(force) {
        if (!o.isActive()) { o.markStale(); return; }
        const w = window.innerWidth, hh = o.headerH();
        if (!force && w === lastW && hh === lastH) return;          // ignore height-only resizes (iOS URL bar) unless the header changed
        const oldH = stageH, rawY = window.pageYOffset - spacerTop;      // rawY > 0: the reader is inside the map's scroll range (camera zoom)
        lastW = w; lastH = hh; stageH = Math.max(320, window.innerHeight - hh);
        root.style.setProperty("--lm-top", hh + "px");
        stage.style.height = stageH + "px";
        travel = (N * T.island + T.zoom) * stageH;
        spacer.style.height = (Math.min(travel, limitScreens * stageH) + stageH) + "px";
        spacerTop = spacer.getBoundingClientRect().top + window.pageYOffset - hh;
        if (force !== "init" && oldH > 0 && rawY > 0) window.scrollTo({ top: spacerTop + rawY * stageH / oldH, behavior: "instant" });   // keep the zoom where it was; never move a reader who is above the map
        dirty = true; schedule();
        if (o.onMeasure) o.onMeasure();
    }

    function frame() {
        raf = 0; if (!dirty) return; dirty = false;
        const y = Math.max(0, Math.min(travel, window.pageYOffset - spacerTop));
        const pos = o.position(), i = Math.max(0, Math.min(N - 1, Math.floor(pos))), p = clamp(pos - i);
        const prog = o.progress(), tgs = [];
        for (let k = 0; k < 5; k++) tgs.push(clamp(prog.done - (i * 5 + k)));
        S.Pcam = travel ? y / travel : 0; S.P = prog.fraction; S.i = i; S.p = p; S.zoom = 0; S.inZoom = false; S.tgs = tgs;

        // custom properties inherit: write each var only on the element that uses it, and only when it changed
        const ai = islands[i];
        setVar(ai, "--p", p.toFixed(4));
        setVar(ai, "--build", clamp(p / T.tgStart).toFixed(4));
        setVar(ai, "--exit", clamp((p - T.exitStart) / (1 - T.exitStart)).toFixed(4));
        for (let k = 0; k < 5; k++) setVar(ai, "--tg" + (k + 1), tgs[k].toFixed(4));
        if (cache.active !== i) {
            if (cache.active >= 0) islands[cache.active].classList.remove("is-active");
            ai.classList.add("is-active"); cache.active = i;
        }
        for (let a = 0; a < N; a++) for (let k = 0; k < 5; k++) {
            const idx = a * 5 + k, s = prog.done - idx >= 1 ? "done" : idx === Math.floor(prog.done) ? "current" : "locked";
            if (cache.states[idx] !== s) {
                cache.states[idx] = s; cards[a][k].setAttribute("data-state", s);
                cards[a][k].querySelector(".sr-state").textContent = s === "locked" && a === 0 ? "locked, finish target " + k + " first" : s;
                const lk = cards[a][k].querySelector(".tg-link");           // a locked target is not a link (an <a> without href is inert and unfocusable)
                if (lk) { if (s === "locked") { lk.removeAttribute("href"); lk.setAttribute("aria-disabled", "true"); } else { lk.setAttribute("href", lk.getAttribute("data-href")); lk.removeAttribute("aria-disabled"); } }
            }
        }
        chainIslands.forEach((c, n) => c.classList.toggle("done", prog.done >= (n + 1) * 5));
        if (String(i) !== cache.key) {
            cache.key = String(i);
            S.hudText = "Level " + (i + 1) + ": " + names[i] + " · " + (i + 1) + "/8";
            hudLabel.textContent = S.hudText; S.hudChanges++;
            hud.querySelectorAll(".jump button").forEach((b, n) => { if (n === i) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
        }
        hudBar.style.transform = "scaleX(" + S.P.toFixed(4) + ")";
    }

    function schedule() { if (!raf && visible) raf = requestAnimationFrame(frame); }
    window.addEventListener("scroll", () => { if (!o.isActive()) return; dirty = true; schedule(); }, { passive: true });
    window.addEventListener("resize", () => measure());
    if ("IntersectionObserver" in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) { dirty = true; schedule(); } }).observe(spacer);

    // HUD island menu
    const toggle = hud.querySelector(".jump-toggle"), list = hud.querySelector(".jump");
    toggle.addEventListener("click", () => { const open = toggle.getAttribute("aria-expanded") !== "true"; toggle.setAttribute("aria-expanded", String(open)); list.hidden = !open; });
    list.addEventListener("click", ev => {
        const b = ev.target.closest("button"); if (!b) return;
        o.onJump(+b.getAttribute("data-island")); toggle.setAttribute("aria-expanded", "false"); list.hidden = true;
    });
    document.addEventListener("keydown", ev => {
        if (ev.key === "Escape" && o.isActive() && !list.hidden) { list.hidden = true; toggle.setAttribute("aria-expanded", "false"); toggle.focus(); ev.stopPropagation(); }
    });

    root.classList.add("enhanced");
    measure("init");
    frame();

    return {
        T, N, get state() { return S; },
        flush() { dirty = true; if (raf) cancelAnimationFrame(raf); raf = 0; frame(); },
        get stageH() { return stageH; }, get travel() { return travel; },
        measure,
        yAt(u) { return Math.ceil(spacerTop + u * T.island * stageH) + 1; },   // scroll position for journey position u = island + progress
        setLimit(screens) { limitScreens = screens; spacer.style.height = (Math.min(travel, screens * stageH) + stageH) + "px"; },
        get maxY() { return Math.floor(spacerTop + Math.min(travel, limitScreens * stageH)); }
    };
}

/* ---------- public API ---------- */
export function createLearningMap({ root, journey }) {
    let started = false, stale = false, ctrl = null;
    const isActive = () => started && !root.hidden;
    const headerH = () => { const h = document.querySelector(".site-header"); return h ? h.offsetHeight : 64; };
    const $ = id => root.querySelector("#" + id);

    function start() {
        started = true;
        const stage = $("stage"), world2 = $("world2"), islLayer = $("isl-layer");
        world2.insertAdjacentHTML("afterend", MAP_DATA.islands.map((it, i) => islandHtml(i, it)).join(""));
        islLayer.insertAdjacentHTML("beforeend", MAP_DATA.islands.map((it, i) => chainIslandHtml(i, it)).join(""));
        ctrl = control(stage);
    }

    function control(stage) {
        var PR = { done: 0, fraction: 0 }, uBird = 0;
        var I = makeCore({
            root: root, spacer: $("spacer"), stage: stage, hud: root.querySelector(".hud"), isActive: isActive, headerH: headerH, markStale: function () { stale = true; },
            progress: function () { PR.done = doneF || 0; PR.fraction = UNLOCKED ? Math.min(1, uBird / UNLOCKED) : 0; return PR; },     // targets come from the bird's journey, not from scroll
            position: function () { return uBird; },                                                                 // so does the island/phase: scrolling only zooms the camera
            onJump: function (i) { if (i < UNLOCKED) { setOverview(false); toNormal(); } else setOverview(true); },
            onMeasure: function () { if (typeof measureLayout === "function" && cam) { measureLayout(); render(); } }
        });

        var NS = "http://www.w3.org/2000/svg", SPREAD = 1.7, TG = I.T.tgStart, GROW = 0.28, TAU = Math.PI * 2;
        var cam = $("cam"), trail = $("trail"), route = $("route"), ripple = $("ripple"), sea = $("sea"), world = $("world"), world2 = $("world2");
        var cam2 = $("cam2"), trailG = $("trail-g");
        var bird = $("bird"), birdFill = $("bird-fill"), birdShadow = $("bird-shadow");
        var sections = [].slice.call(stage.querySelectorAll(".island"));
        var ease = function (t) { return lerp(t, smooth(t), 0.55); };      // hop easing: less dead time at both ends than a full smoothstep
        function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; }

        birdShadow.setAttribute("d", birdFill.getAttribute("d"));

        // 1. chain islands (already in the world layer): add the highland and measure them
        var isls = [].slice.call(stage.querySelectorAll(".chain-island")).map(function (g) {
            var inner = g.querySelector("g"), path = inner.querySelector("path"), text = g.querySelector("text");
            var m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(inner.getAttribute("transform"));
            var o = { g: g, inner: inner, text: text, X: +m[1] * SPREAD, Y: +m[2] * SPREAD, s: +m[3], b: -1 };
            path.setAttribute("class", "shore");
            el("path", { "class": "high", d: path.getAttribute("d"), transform: "translate(100 70) scale(.62) translate(-100 -70)" }, inner);
            o.path = path;
            return o;
        });
        isls.forEach(function (o) {
            var bb = o.path.getBBox();
            o.cx = o.X + (bb.x + bb.width / 2 - 100) * o.s; o.cy = o.Y + (bb.y + bb.height / 2 - 70) * o.s;
            o.hw = bb.width / 2 * o.s; o.hh = bb.height / 2 * o.s; o.bottom = o.Y + (bb.y + bb.height - 70) * o.s;
            o.rx = o.hw * 1.16 + 6; o.ry = o.hh * 1.2 + 6;
        });

        // 2. trail geometry: transit_i (exit_{i-1} or offscreen start -> anchor_i) + loop_i (spiral from anchor_i to exit_i)
        function loopFn(o, pa, dir, sweep) {
            return {
                P: function (u) { var a = pa + dir * sweep * u, g = 1 + GROW * u; return [o.cx + g * o.rx * Math.cos(a), o.cy + g * o.ry * Math.sin(a)]; },
                D: function (u) {
                    var a = pa + dir * sweep * u, g = 1 + GROW * u, w = dir * sweep;
                    return [GROW * o.rx * Math.cos(a) - g * o.rx * Math.sin(a) * w, GROW * o.ry * Math.sin(a) + g * o.ry * Math.cos(a) * w];
                }
            };
        }
        function paramToward(o, x, y) { return Math.atan2((y - o.cy) * o.rx, (x - o.cx) * o.ry); }
        var norm = function (v) { var l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
        var pt = function (p) { return f2(p[0]) + " " + f2(p[1]); };

        var segs = [], start = [isls[0].cx + 760, isls[0].cy + 90], prevEnd = start, prevTan = null;
        isls.forEach(function (o, i) {
            var from = i ? isls[i - 1] : { cx: start[0], cy: start[1] }, to = isls[i + 1] || { cx: o.cx - 400, cy: o.cy - 50 };
            var pa = paramToward(o, from.cx, from.cy), pe = paramToward(o, to.cx, to.cy);
            var d = ((pe - pa) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU;  // short way, then one extra full orbit
            var dir = d < 0 ? -1 : 1, sweep = Math.abs(d) + TAU, L = loopFn(o, pa, dir, sweep);
            var anchor = L.P(0), tin = norm(L.D(0)), tout = prevTan || norm([anchor[0] - prevEnd[0], anchor[1] - prevEnd[1]]);
            var h = Math.hypot(anchor[0] - prevEnd[0], anchor[1] - prevEnd[1]) * 0.38;
            var tc1 = [prevEnd[0] + tout[0] * h, prevEnd[1] + tout[1] * h], tc2 = [anchor[0] - tin[0] * h, anchor[1] - tin[1] * h];
            segs.push({ from: prevEnd, d: "C" + pt(tc1) + " " + pt(tc2) + " " + pt(anchor), cubics: [[prevEnd, tc1, tc2, anchor]] });
            var n = Math.ceil(sweep / (Math.PI / 8)), dl = "", cubics = [];
            for (var k = 0; k < n; k++) {
                var u0 = k / n, u1 = (k + 1) / n, p0 = L.P(u0), p1 = L.P(u1), d0 = L.D(u0), d1 = L.D(u1), hh = (u1 - u0) / 3;
                var c1 = [p0[0] + d0[0] * hh, p0[1] + d0[1] * hh], c2 = [p1[0] - d1[0] * hh, p1[1] - d1[1] * hh];
                dl += "C" + pt(c1) + " " + pt(c2) + " " + pt(p1);
                cubics.push([p0, c1, c2, p1]);
            }
            segs.push({ from: anchor, d: dl, cubics: cubics });
            o.anchor = anchor; prevEnd = L.P(1); prevTan = norm(L.D(1));
        });
        var fullD = "M" + pt(start) + segs.map(function (s) { return s.d; }).join("");
        trail.setAttribute("d", fullD);
        route.setAttribute("d", fullD);                             // the route links every island, locked ones included

        // Per-segment lengths + a dense, evenly spaced sample table along the whole trail, computed straight from the Bezier pieces.
        // (SVG getPointAtLength is O(path length) per call: ~2000 calls on this path took ~6 s on the first show of the map.)
        var SUB = 16, PX = [], PY = [], PL = [], acc = 0, lens = [], cum = [0];
        segs.forEach(function (sg, j) {
            var before = acc;
            sg.cubics.forEach(function (c) {
                for (var u = 0; u <= SUB; u++) {
                    if (u === 0 && PX.length) continue;                     // shared end point with the previous piece
                    var t = u / SUB, m = 1 - t, a = m * m * m, b = 3 * m * m * t, d = 3 * m * t * t, e = t * t * t;
                    var x = a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], y = a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1];
                    if (PX.length) acc += Math.hypot(x - PX[PX.length - 1], y - PY[PY.length - 1]);
                    PX.push(x); PY.push(y); PL.push(acc);
                }
            });
            lens.push(acc - before); cum.push(acc);
        });
        var TOTAL = acc, NS_ = 2048, SX = new Float64Array(NS_ + 1), SY = new Float64Array(NS_ + 1);
        for (var n = 0, ip = 1; n <= NS_; n++) {
            var tl = TOTAL * n / NS_; while (ip < PL.length - 1 && PL[ip] < tl) ip++;
            var span = PL[ip] - PL[ip - 1] || 1, f = clamp((tl - PL[ip - 1]) / span);
            SX[n] = lerp(PX[ip - 1], PX[ip], f); SY[n] = lerp(PY[ip - 1], PY[ip], f);
        }
        function sampleAt(L) {
            var x = clamp(L / TOTAL) * NS_, a = Math.min(NS_ - 1, Math.floor(x)), t = x - a;
            return [lerp(SX[a], SX[a + 1], t), lerp(SY[a], SY[a + 1], t)];
        }
        function lengthAt(i, p, table) {                           // {i,p} -> arc length: p<=tgStart transit_i, p>tgStart loop_i
            table = table || cum;
            var tl = table[2 * i + 1] - table[2 * i], ll = table[2 * i + 2] - table[2 * i + 1];
            return p <= TG ? table[2 * i] + p / TG * tl : table[2 * i + 1] + (p - TG) / (1 - TG) * ll;
        }
        // the visible trail is one path per segment: only the segment under the bird changes each frame
        var segEls = segs.map(function (sg, j) {
            var e = el("path", { "class": "trail", d: "M" + pt(sg.from) + sg.d, "stroke-dasharray": lens[j] + " " + lens[j], "stroke-dashoffset": lens[j] }, trailG);
            e.style.visibility = "hidden";
            return { e: e, len: lens[j], off: lens[j], hid: true };
        });
        function drawnLen() { return segEls.reduce(function (a, g) { return a + g.len - g.off; }, 0); }

        // anchors + target markers on each loop (lit when that target is done)
        var markLayer = $("marks"), anchors = [], marks = [];
        isls.forEach(function (o, i) {
            if (o.g.classList.contains("soon")) return;                 // locked islands get no stops, rings or markers
            anchors.push(el("circle", { "class": "anchor", cx: f2(o.anchor[0]), cy: f2(o.anchor[1]) }, markLayer));
            for (var k = 0; k < 5; k++) {
                var q = sampleAt(lengthAt(i, TG + I.T.tgLen * (k + 1)));
                marks.push({ i: i, k: k, on: null, e: el("circle", { "class": "mark", cx: f2(q[0]), cy: f2(q[1]) }, markLayer) });
            }
        });

        // 3. layout: each island's world shape lands on its section's invisible .isl-svg placeholder
        var foc = [], fit = null, lastK = -1, lastZoomK = -1;
        function measureLayout() {
            var sr = stage.getBoundingClientRect();
            foc = sections.map(function (sec, i) {
                var r = sec.querySelector(".isl-svg").getBoundingClientRect();
                return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2, k: r.width / (200 * isls[i].s) };
            });
            var x0 = 1e9, y0_ = 1e9, x1 = -1e9, y1 = -1e9, g = 1 + GROW;
            isls.forEach(function (o) {
                var ex = o.g.classList.contains("soon") ? o.hw * 1.2 : o.rx * g, ey = o.g.classList.contains("soon") ? o.hh * 1.2 : o.ry * g;   // locked islands have no loop, so fit to their bodies
                x0 = Math.min(x0, o.cx - ex); x1 = Math.max(x1, o.cx + ex);
                y0_ = Math.min(y0_, o.cy - ey); y1 = Math.max(y1, o.cy + ey);
            });
            var vw = stage.clientWidth, vh = stage.clientHeight;
            var top = 104, bot = vh - 70, left = vw < 600 ? 36 : 60, right = vw < 600 ? vw - 14 : vw - 40;   // room for the Coming-soon badges above the end islands
            var k = Math.min((right - left) / (x1 - x0), (bot - top) / (y1 - y0_));
            fit = { x: (left + right) / 2, y: (top + bot) / 2, k: k, cx: (x0 + x1) / 2, cy: (y0_ + y1) / 2 };
            lastK = -1; lastZoomK = -1;
        }

        var lastRip = "", lastBK = -1, labelsDirty = false, badgesHidden = false, moreOn = false;
        // Camera: while it moves by scroll-zoom / overview, the already-painted map layers are moved with a GPU transform (no vector re-paint per frame);
        // once it has been still for COMMIT_MS the real camera is written into the SVG (crisp strokes, labels and badges). Flights write it every frame.
        var cc = null, cssOn = false, commitT = 0, commitNow = false, COMMIT_MS = 140, DRIFT = 0.17;   // DRIFT: max |ln(scale)| between the painted SVG and the live camera (0.17 ~ 18%) before it is re-drawn mid-scroll
        var soonLayer = el("g", {}, cam2), badges = [], phone = window.innerWidth < 600;
        isls.forEach(function (o) {
            if (!o.g.classList.contains("soon")) return;
            var g = el("g", { "class": "soon-badge", role: "img", "aria-label": "Coming soon" }, soonLayer);
            el("rect", { x: -46, y: -12, width: 92, height: 24, rx: 12 }, g);
            var t = el("text", { x: 0, y: 4, "text-anchor": "middle" }, g); t.textContent = phone ? "Soon" : "Coming soon";   // on a phone the chain is ~40px per island: keep the badge short
            if (phone) { var rc = g.querySelector("rect"); rc.setAttribute("x", -25); rc.setAttribute("width", 50); }
            badges.push({ g: g, o: o });
        });
        // "More coming soon": same badge as the others, shown (in place of them) when the zoomed-out map is too crowded for them.
        // It sits directly under the "Level 2: Maui" label.
        var more = el("g", { "class": "soon-badge more", role: "img", "aria-label": "More coming soon" }, soonLayer);
        more.style.display = "none";
        el("rect", { x: -66, y: -12, width: 132, height: 24, rx: 12 }, more);
        var moreT = el("text", { x: 0, y: 4, "text-anchor": "middle" }, more); moreT.textContent = "More coming soon";
        var moreAt = { x: isls[1].cx, y: isls[1].cy };   // Maui (index 1); placed under its name label

        /* ---------- stepped journey ----------
           Bird, trail and targets are driven by their own state (advance() = → / Next, time-based). The scroll position is only the CAMERA ZOOM:
           y0() = closest view (with a buffer above it so a small scroll-up does not leave the map), zoomY(1) = whole chain. */
        var NI = isls.length, TGL = I.T.tgLen, TI = I.T.island;
        var UNLOCKED = isls.findIndex(function (o) { return o.g.classList.contains("soon"); }); if (UNLOCKED < 0) UNLOCKED = NI;   // islands with units ("available" in the data)
        var stops = [0];                                            // journey positions u = island index + progress inside that island
        for (var si = 0; si < UNLOCKED; si++) { stops.push(si + TG); for (var sk = 1; sk <= 5; sk++) stops.push(si + TG + TGL * sk); }
        stops.push(UNLOCKED - 2e-3);                                // last stop: the end of the trail
        var LAST = stops.length - 1, step = 0, doneInt = 0, ripples = 0, speed = 1;
        var ovLabel = "", ov = 0, ovAnim = null, ovOn = false, hudLabelEl = root.querySelector(".hud-label");
        var ZR = 2.625, BUF = 1, END = 1, zoomOn = false, camAnim = null;
        var zShown = 0, lastT = 0, ZTAU = 75;                       // the camera glides toward the scroll position (wheel notches arrive in jumps); ZTAU = smoothing time constant, ms     // scroll range (screens) that maps to zoom 0..1, plus a pinned buffer before it (BUF) and after it (END)
        var job = null, doneAnim = null, rip = null, follow = true, raf = 0, finished = false, doneF = 0;
        var viewBtn = $("view"), viewLabel = $("view-label"), nextBtn = $("next"), hint = $("hint"), toast = $("end-toast"), backBtn = $("back"), backOn = false, nextLabel = $("next-label");
        function uToLen(u) { var n = Math.min(NI - 1, Math.floor(u)); return lengthAt(n, clamp(u - n)); }
        function y0() { return I.yAt(0) - 1 + BUF * I.stageH; }
        function zoomY(z) { return y0() + z * ZR * I.stageH; }
        function zoomNow() { return clamp((window.pageYOffset - y0()) / (ZR * I.stageH)); }
        function scrollY(y) { window.scrollTo({ top: Math.round(y), behavior: "instant" }); }
        function toNormal() { if (Math.abs(window.pageYOffset - y0()) > 1) scrollY(y0()); }
        I.setLimit(ZR + BUF + END);                                 // scroll range = top buffer + zoom range + bottom buffer (the stage stays pinned in both buffers)
        function updateNext() {
            var j = journey.read(), label = j.label;   // Begin learning / Next target / Open target / Continue / All targets complete
            nextBtn.disabled = j.mode === "end" || !journey.isReady || !!job;               // greyed out mid-flight and at the end
            nextLabel.textContent = label;
            nextBtn.setAttribute("aria-label", label + " (right arrow key)");
        }
        function showEnd() { toast.classList.add("on"); }
        function hideEnd() { toast.classList.remove("on"); }

        function setOverview(on) {                                  // camera-only: fly out to the whole chain and back; progress is untouched
            if (on === ovOn) return;
            ovOn = on; ovAnim = { from: ov, to: on ? 1 : 0, t0: 0, dur: 900 * speed };
            viewBtn.setAttribute("aria-pressed", String(on)); viewLabel.textContent = on ? "Back to journey" : "See whole chain";
            ovLabel = "Whole chain · " + UNLOCKED + " of " + NI + " open";
            hudLabelEl.textContent = on ? ovLabel : I.state.hudText;
            kick();
        }
        function returnCam() {                                      // button: close the whole-chain view and glide the camera back to the bird
            if (ovOn) setOverview(false);
            var py = window.pageYOffset; if (Math.abs(py - y0()) < 2) return;
            camAnim = { y0: py, t0: 0, dur: 650 * speed }; kick();
        }
        // "Next target": fly to the next target (done + 1) WITHOUT completing anything, remember the hop, then the button reads "Open target".
        function hop() {
            var j = journey.read();
            if (!isActive() || !journey.isReady || job) return;
            if (j.mode === "end") { showEnd(); return; }
            if (j.mode !== "next") return;
            if (ovOn) setOverview(false);
            var s = j.done + 2, to = stops[s], from = uBird, py = window.pageYOffset;   // stops: 0 start, 1 landing, 1+k target k
            follow = true;                                          // the camera zooms back in on the bird while it flies, unless the reader grabs the scroll
            job = { s: s, from: from, to: to, dur: (450 + Math.abs(to - from) * 2200) * speed, rdur: 600 * speed, y0: py, t0: 0, phase: Math.abs(py - y0()) > 0.02 * I.stageH ? "return" : "move" };
            if (hint) hint.hidden = true;
            journey.hop();                                          // writes the sessionStorage hop key (and refreshes the list view)
            updateNext();
            kick();
        }
        function act(fromKey) {                                     // the main button; the right-arrow key only ever hops
            var j = journey.read();
            if (!isActive() || !journey.isReady || job) return;
            if (j.mode === "enter") { if (!fromKey) journey.enter(); } else hop();
        }
        function arrive(now) {
            var s = job.s; step = s; uBird = job.to;
            rip = { t0: now, u: uBird }; ripples++;                 // landing ring plays at every stop
            job = null;
            updateNext();                                           // re-enable the button: it now reads "Open target"
        }
        // Instant restore for another view / reset / server load: no animation, ring or toast residue.
        // d = targets complete (0..5); hopped = the bird has been sent on to target d+1 (in progress, not done).
        function jumpTo(d, hopped) {
            d = Math.max(0, Math.min(TOTAL_CP, d | 0));
            zShown = zoomNow();
            var s = hopped && d < TOTAL_CP ? d + 2 : d === 0 ? 0 : d >= TOTAL_CP * UNLOCKED ? LAST : d + 1;   // landing (step 1) is not persisted; done=5 restores at the end of the trail
            job = null; camAnim = null; doneAnim = null; rip = null; ovAnim = null; ov = 0; ovOn = false; follow = true;
            step = s; uBird = stops[s]; doneInt = d; doneF = d; finished = s === LAST;
            viewBtn.setAttribute("aria-pressed", "false"); viewLabel.textContent = "See whole chain";
            if (hint) hint.hidden = s > 0;
            if (finished) showEnd(); else hideEnd();
            updateNext(); lastRip = "";
            I.flush(); render(); hudLabelEl.textContent = I.state.hudText;     // never scrolls the page: the reader may be on the hero (Reset) or the list
        }
        function tick(now) {
            raf = 0;
            if (job) {
                if (!job.t0) job.t0 = now;
                var e = now - job.t0;
                if (job.phase === "return") {
                    if (follow) scrollY(lerp(job.y0, y0(), smooth(clamp(e / job.rdur))));
                    if (e >= job.rdur) { job.phase = "move"; job.t0 = now; }
                } else if (job.phase === "move") {
                    uBird = lerp(job.from, job.to, smooth(clamp(e / job.dur)));
                    if (follow) toNormal();
                    if (e >= job.dur) arrive(now);
                }
            }
            if (camAnim) {
                if (!camAnim.t0) camAnim.t0 = now;
                var ct = clamp((now - camAnim.t0) / camAnim.dur); scrollY(lerp(camAnim.y0, y0(), smooth(ct)));
                if (ct >= 1) camAnim = null;
            }
            if (ovAnim) {
                if (!ovAnim.t0) ovAnim.t0 = now;
                var ot = clamp((now - ovAnim.t0) / ovAnim.dur); ov = lerp(ovAnim.from, ovAnim.to, smooth(ot));
                if (ot >= 1) { ov = ovAnim.to; ovAnim = null; }
            }
            if (doneAnim) { doneF = doneAnim.from + smooth(clamp((now - doneAnim.t0) / doneAnim.dur)); if (now - doneAnim.t0 >= doneAnim.dur) { doneF = doneAnim.from + 1; doneAnim = null; } }
            if (rip && (now - rip.t0) / (900 * speed) >= 1) rip = null;
            var zt = zoomNow();
            if (zShown !== zt) {
                var dt = Math.min(64, lastT ? now - lastT : 16);
                zShown += (zt - zShown) * (1 - Math.exp(-dt / ZTAU));
                if (Math.abs(zt - zShown) < 0.0015) zShown = zt;
            }
            lastT = now;
            I.flush(); render(now);
            if (job || doneAnim || rip || ovAnim || camAnim || zShown !== zoomNow()) kick(); else lastT = 0;
        }
        function kick() { if (!raf) raf = requestAnimationFrame(tick); }

        // the camera is the only thing manual scrolling controls: grabbing it mid-flight just stops the camera following the bird
        ["wheel", "touchmove"].forEach(function (ev) { window.addEventListener(ev, function () { if (!isActive()) return; camAnim = null; if (job) follow = false; }, { passive: true }); });
        backBtn.addEventListener("click", returnCam);
        $("end-x").addEventListener("click", hideEnd);
        root.querySelector(".hud").addEventListener("click", function () { follow = false; });
        document.addEventListener("keydown", function (ev) {
            if (!isActive()) return;                                // a hidden map never captures keys
            if (ev.key === "ArrowRight" && !ev.altKey && !ev.ctrlKey && !ev.metaKey) { var t = ev.target; if (t && (/^(INPUT|TEXTAREA|SELECT|A|BUTTON|SUMMARY)$/.test(t.tagName) || (t.closest && t.closest("a,button,summary,[role]")) || t.isContentEditable)) return; ev.preventDefault(); act(true); }
            else if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(ev.key) && job) follow = false;
        });
        nextBtn.addEventListener("click", function () { act(false); });
        viewBtn.addEventListener("click", function () { setOverview(!ovOn); });
        document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && isActive()) { if (toast.classList.contains("on")) hideEnd(); else if (ovOn) setOverview(false); } });

        // When zoomed far out and ANY "Coming soon" badge would overlap a label, another island or another badge, all badges are removed and a
        // "More coming soon" label is shown instead; zooming back in (less crowding) restores them on the next pass. Measured in screen space.
        function layoutBadges() {
            if (!badges.length) return;
            var pad = 2, hit = function (a, b) { return a.left < b.right + pad && a.right + pad > b.left && a.top < b.bottom + pad && a.bottom + pad > b.top; };
            badges.forEach(function (b) { b.g.style.display = ""; });
            var texts = [], boxes = isls.map(function (o) { return o.path.getBoundingClientRect(); });
            isls.forEach(function (o) { if (o.text.style.display !== "none") texts.push(o.text.getBoundingClientRect()); });
            var kept = [];
            var anyBad = false;
            badges.forEach(function (b) {
                var r = b.g.getBoundingClientRect(), own = isls.indexOf(b.o), bad = false, n;
                for (n = 0; n < texts.length && !bad; n++) bad = hit(r, texts[n]);
                for (n = 0; n < boxes.length && !bad; n++) if (n !== own) bad = hit(r, boxes[n]);
                for (n = 0; n < kept.length && !bad; n++) bad = hit(r, kept[n]);
                if (bad) anyBad = true; else kept.push(r);
            });
            badgesHidden = anyBad;                                  // one crowded badge removes them all; the bottom-left "More coming soon" label stands in
            if (anyBad) badges.forEach(function (b) { b.g.style.display = "none"; });
        }

        function render(now) {
            var S = I.state, i = S.i, p = S.p, a = foc[i], fx, fy, k, cx, cy, t;
            if (!a || !fit) return;
            now = now || performance.now();
            if (p < TG && i > 0) {
                var b = foc[i - 1]; t = ease(p / TG);
                fx = lerp(b.x, a.x, t); fy = lerp(b.y, a.y, t); k = Math.exp(lerp(Math.log(b.k), Math.log(a.k), t));
                cx = lerp(isls[i - 1].X, isls[i].X, t); cy = lerp(isls[i - 1].Y, isls[i].Y, t);
            } else { fx = a.x; fy = a.y; k = a.k; cx = isls[i].X; cy = isls[i].Y; }
            var tt = Math.max(smooth(ov), smooth(zShown));        // scroll zoom and the whole-chain button both blend toward the fit-everything camera
            if (tt > 0.001) {
                fx = lerp(fx, fit.x, tt); fy = lerp(fy, fit.y, tt); k = Math.exp(lerp(Math.log(k), Math.log(fit.k), tt)); cx = lerp(cx, fit.cx, tt); cy = lerp(cy, fit.cy, tt);
            }
            if (ovOn && hudLabelEl.textContent !== ovLabel) hudLabelEl.textContent = ovLabel;   // core rewrites the HUD when the camera crosses an island
            var bon = zoomNow() > 0.02 || ovOn; if (bon !== backOn) { backOn = bon; backBtn.classList.toggle("on", bon); }
            var zAmt = tt;
            var flip = (zAmt > 0.3) !== zoomOn;                                   // crossing the labels threshold must show up right away, not when scrolling stops
            var onv = zAmt > 0.3; if (onv !== zoomOn) { zoomOn = onv; stage.classList.toggle("overview", onv); }   // labels/badges in, panel out (the panel has already faded by then)
            var zo = Math.round(zAmt * 100) / 100, sec = sections[i]; if (sec.__zo !== zo) { sec.__zo = zo; sec.style.opacity = Math.max(0, 1 - zo * 3.4); }   // direct opacity: a custom property here would restyle the whole panel subtree each step
            var tx = fx - k * cx, ty = fy - k * cy;
            if (!cc || job || commitNow || flip || Math.abs(Math.log(k / cc.k)) > DRIFT) {   // write the camera into the SVG (only when it really changed: attribute writes invalidate the whole subtree)
                if (!cc || cc.k !== k || cc.tx !== tx || cc.ty !== ty) {
                    cc = { k: k, tx: tx, ty: ty };
                    var camStr = "matrix(" + k + " 0 0 " + k + " " + f2(tx) + " " + f2(ty) + ")";
                    cam.setAttribute("transform", camStr); cam2.setAttribute("transform", camStr);
                }
                if (cssOn) { world.style.transform = ""; world2.style.transform = ""; cssOn = false; }
                if (commitT) { clearTimeout(commitT); commitT = 0; }
            } else if (cc.k !== k || cc.tx !== tx || cc.ty !== ty) {   // moving by scroll: transform the painted layers (screen' = r * screen + d)
                var rr = k / cc.k, tr = "translate(" + f2(tx - rr * cc.tx) + "px," + f2(ty - rr * cc.ty) + "px) scale(" + rr + ")";
                world.style.transform = tr; world2.style.transform = tr; cssOn = true;
                if (commitT) clearTimeout(commitT);
                commitT = setTimeout(function () { commitT = 0; commitNow = true; render(); commitNow = false; }, COMMIT_MS);
            }
            var kc = cc.k;                                          // everything written as an SVG attribute below is sized for the committed camera
            sea.style.transform = "translate3d(" + f2((((tx * 0.28) % 46) + 46) % 46) + "px," + f2((((ty * 0.28) % 28) + 28) % 28) + "px,0)";   // waves drift slower than the world: depth without zooming the strokes

            // trail: drawn up to the bird's progress, whatever the camera is looking at
            var L = uToLen(uBird);
            for (var sj = 0; sj < segEls.length; sj++) {
                var g = segEls[sj], off = Math.round(g.len * (1 - clamp((L - cum[sj]) / g.len)) * 10) / 10;
                if (off !== g.off) {
                    g.off = off; g.e.setAttribute("stroke-dashoffset", off);
                    var hid = off >= g.len - 0.05; if (hid !== g.hid) { g.hid = hid; g.e.style.visibility = hid ? "hidden" : ""; }   // round caps would leave a dot at the start of every undrawn leg
                }
            }
            if (lastK < 0 || Math.abs(kc - lastK) / lastK > 0.04) {   // stroke compensation touches ~70 SVG elements: only redo it when the zoom moved a visible amount
                lastK = kc;
                segEls.forEach(function (g) { g.e.setAttribute("stroke-width", 3.4 / kc); });
                route.setAttribute("stroke-width", 1.6 / kc);
                anchors.forEach(function (c) { c.setAttribute("r", 6.5 / kc); c.setAttribute("stroke-width", 2.4 / kc); });
                marks.forEach(function (m) { m.e.setAttribute("r", 5 / kc); m.e.setAttribute("stroke-width", 2 / kc); });
            }

            // landing ring at every stop: expands from the stop and thins to nothing (stroke width, not opacity)
            var rt = rip ? clamp((now - rip.t0) / (900 * speed)) : 1, ripKey = rt >= 1 ? "off" : f2(rt * 200) + "," + f2(kc * 100);
            if (ripKey !== lastRip || rip) {
                lastRip = ripKey;
                if (rip) { var rp = sampleAt(uToLen(rip.u)); ripple.setAttribute("cx", f2(rp[0])); ripple.setAttribute("cy", f2(rp[1])); }
                ripple.setAttribute("r", f2((8 + 120 * smooth(rt)) / kc)); ripple.setAttribute("stroke-width", rt >= 1 ? 0 : f2(3.4 * (1 - rt) / kc));
            }

            // islands grow as the bird lands on them (scale transform, no opacity)
            isls.forEach(function (o) {
                var bld = 1;                                            // every island is always drawn as its real shape (no outline, no grow-in)
                if (Math.abs(bld - o.b) > 1e-4) {
                    o.b = bld;
                    o.inner.setAttribute("transform", "translate(" + o.X + " " + o.Y + ") scale(" + (o.s * Math.max(bld, 0.0001)) + ") translate(-100 -70)");
                }
            });
            marks.forEach(function (m) {
                var on = m.i * 5 + m.k < doneInt;
                if (on !== m.on) { m.on = on; m.e.classList.toggle("on", on); }
            });
            if (onv && (lastZoomK < 0 || Math.abs(kc - lastZoomK) / lastZoomK > 0.03)) {   // labels keep a constant screen size; re-laying out text every frame of a zoom is expensive
                lastZoomK = kc;
                var fs = (window.innerWidth < 600 ? 12 : 16) / kc;
                isls.forEach(function (o) {
                    var soonI = o.g.classList.contains("soon"), sd = o.text.getAttribute("data-side");
                    if (soonI && sd === "above") sd = "below";               // the badge sits above locked islands
                    o.text.style.display = soonI && phone ? "none" : "";      // phone: only the open island is named (badges are too tight)
                    var gx = soonI ? Math.max(o.hw * 1.15, 54 / kc) + fs * .5 : o.rx * (1 + GROW) + fs * .5, gy = soonI ? Math.max(o.hh * 1.15, 20 / kc) : o.ry * (1 + GROW);   // names stay outside the trail loop (or the Coming-soon badge)
                    o.text.setAttribute("x", f2(sd === "left" ? o.cx - gx : sd === "right" ? o.cx + gx : o.cx));
                    o.text.setAttribute("y", f2(sd === "above" ? o.cy - gy - fs * .5 : sd === "left" || sd === "right" ? o.cy + fs * .35 : o.cy + gy + fs * 1.15));
                    o.text.setAttribute("font-size", fs); o.text.setAttribute("stroke-width", 3 / kc);
                });
                labelsDirty = true;
            }

            // coming-soon badges keep a constant on-screen size
            if (badges.length && (Math.abs(kc - lastBK) / kc > 0.03 || lastBK < 0)) {
                lastBK = kc; var bs = (window.innerWidth < 600 ? 0.8 : 1) / kc;
                badges.forEach(function (b) { b.g.setAttribute("transform", "translate(" + f2(b.o.cx) + " " + f2(b.o.cy - b.o.hh - 15 / kc) + ") scale(" + bs + ")"); });
                var big = Math.max(0.8, Math.min(1.2, stage.clientWidth * (window.innerWidth < 600 ? 0.3 : 0.45) / 132));   // 1.2x the other badges (never below 0.8x so the text stays readable on phones)
                var lt = isls[1].text.getBoundingClientRect(), sr = stage.getBoundingClientRect(), msx, msy;   // centred under Maui's name label (screen px, stage-relative)
                if (lt.width > 0) { msx = lt.left - sr.left + lt.width / 2; msy = lt.bottom - sr.top + 8 + 12 * big; }
                else { msx = cc.k * moreAt.x + cc.tx + 70; msy = cc.k * moreAt.y + cc.ty; }   // phones hide the island names: sit just right of Maui
                var mhalf = 66 * big + 12;                                               // keep the whole badge inside the stage
                msx = Math.max(mhalf, Math.min(stage.clientWidth - mhalf, msx));
                var mx = (msx - cc.tx) / cc.k, my = (msy - cc.ty) / cc.k;
                more.setAttribute("transform", "translate(" + f2(mx) + " " + f2(my) + ") scale(" + f2((bs / (window.innerWidth < 600 ? 0.8 : 1)) * big) + ")");   // nudged left and up (screen px)
                labelsDirty = true;
            }
            if (labelsDirty && onv) { labelsDirty = false; layoutBadges(); }
            var showMore = onv && badgesHidden; if (showMore !== moreOn) { moreOn = showMore; more.style.display = showMore ? "" : "none"; }

            // bird: projected through the camera, heading from two neighbouring samples (it can be off screen when the camera is elsewhere)
            var pos = sampleAt(L), ahead = sampleAt(Math.min(TOTAL, L + 3)), behind = sampleAt(Math.max(0, L - 3));
            var ang = Math.atan2(ahead[1] - behind[1], ahead[0] - behind[0]) * 180 / Math.PI + 33.7;
            var sx = fx + k * (pos[0] - cx), sy = fy + k * (pos[1] - cy);
            var size = (window.innerWidth < 600 ? 60 : 88) / 128 * lerp(1, 0.65, zAmt);
            var body = " rotate(" + f2(ang) + ") scale(" + size.toFixed(4) + ") translate(-62 -58)";
            bird.setAttribute("transform", "translate(" + f2(sx) + " " + f2(sy) + ")");
            birdFill.setAttribute("transform", body);
            birdShadow.setAttribute("transform", "translate(9 16)" + body);
        }

        // render after core has recomputed the camera state from the new scroll position (its rAF was queued first, ours second)
        window.addEventListener("scroll", function () { if (!isActive()) return; kick(); }, { passive: true });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (isActive()) { measureLayout(); render(); } else stale = true; });
        if ("ResizeObserver" in window) { var hdr = document.querySelector(".site-header"); if (hdr) new ResizeObserver(function () { if (isActive()) I.measure(true); else stale = true; }).observe(hdr); }   // mobile nav opening, etc.
        measureLayout();

        // ---- journey -> map: unit progress, the list view, Reset or the server can change the state while the map is hidden (a flight is never interrupted, except by force)
        function sync(force) { var j = journey.read(); if (force || !job) { jumpTo(j.done, j.hopped); } else updateNext(); }
        journey.subscribe(function () { sync(false); });
        journey.ready.then(function () { sync(false); });
        zShown = zoomNow();
        sync(true);

        // hooks for the headless checks (names unchanged from the demo)
        window.__island = { T: I.T, N: I.N, get state() { return I.state; }, flush: I.flush, get stageH() { return I.stageH; }, get travel() { return I.travel; }, yAt: I.yAt, setLimit: I.setLimit, get maxY() { return I.maxY; } };
        window.__iwa = {
            stepped: true, snapZoom: function () { zShown = zoomNow(); render(); }, returnCam: returnCam, bufY: function () { return y0() - BUF * I.stageH; }, zoomY: zoomY, zoomNow: zoomNow, ZR: ZR, advance: act, hop: hop, setOverview: setOverview, jumpTo: jumpTo, unlocked: UNLOCKED, stops: stops, LAST: LAST, N: NI,
            get step() { return step; }, get u() { return uBird; }, get idle() { return !job && !doneAnim && !rip && !ovAnim && !camAnim && !commitT && zShown === zoomNow(); }, get ov() { return ov; }, get ovOn() { return ovOn; },
            get ripples() { return ripples; }, get follow() { return follow; }, get doneF() { return doneF; }, get finished() { return finished; }, get badgesHidden() { return badgesHidden; },
            speed: function (v) { speed = v; },
            birdEl: function () { return $("bird-dot"); },
            markEl: function (n) { return marks[n].e; }, anchorEl: function (n) { return anchors[n]; },
            trailLen: drawnLen, lenAt: function (u) { return uToLen(u); }
        };
        return { I: I, jumpTo: jumpTo, sync: sync, hop: hop, measureLayout: measureLayout, render: render, toNormal: toNormal };
    }

    return {
        // call after root.hidden = false
        show() {
            if (!started) { start(); return; }
            ctrl.I.measure(true); ctrl.measureLayout(); stale = false;
            ctrl.sync(false); ctrl.render();
        },
        sync(force) { if (ctrl) ctrl.sync(!!force); },               // re-read the journey (Reset passes force to cut any flight short)
        hop() { if (ctrl) ctrl.hop(); },                             // animated "Next target" (only while the map is visible)
        get active() { return isActive(); },
        get started() { return started; }
    };
}
