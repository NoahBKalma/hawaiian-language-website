// SVG chart helpers for the admin analytics page: no library. Colors come from CSS classes (.ser0 .ser1 .ser2 in
// styles/admin-analytics.css), so the site tokens style the charts. Series 2 is hatched and line series use different
// dashes, so nothing is told apart by color alone. Rows are focusable and read out through the `onRead` callback.
import { t } from "/scripts/i18n.js";

const NS = "http://www.w3.org/2000/svg";
const HATCHED = [false, true, false];

function mk(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
}
const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);
let uid = 0;

// <ul> legend with a small swatch per series (hatched swatch for series 2)
export function legendHtml(names) {
    const id = ++uid;
    const items = names.map((name, i) => {
        const swatch = HATCHED[i]
            ? `<defs><pattern id="lg${id}-${i}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="ser${i}" width="5" height="5"/><rect width="2" height="5" class="hatch-gap"/></pattern></defs><rect width="22" height="12" rx="3" fill="url(#lg${id}-${i})"/>`
            : `<rect class="ser${i}" width="22" height="12" rx="3"/>`;
        const el = document.createElement("li");
        el.innerHTML = `<svg viewBox="0 0 22 12" aria-hidden="true">${swatch}</svg>`;
        el.append(document.createTextNode(name));
        return el.outerHTML;
    });
    return `<ul class="legend" aria-label="${t("admin.legend")}">${items.join("")}</ul>`;
}

// rows: [{ label, vals: [..per series], texts: [..], tip, haw? }]. maxV scales the bars.
export function hbar(host, rows, names, maxV, onRead) {
    host.textContent = "";
    const width = Math.max(260, host.clientWidth), narrow = width < 420; // phones: the label sits above its bars
    const labelW = narrow ? 6 : Math.min(240, Math.round(width * 0.34)), valW = 92, series = names.length;
    const barH = series > 1 ? 13 : 20, top = narrow ? 18 : 0, rowH = series * (barH + 3) + 14 + top, trackW = Math.max(40, width - labelW - valW);
    const svg = mk("svg", { width, height: rows.length * rowH + 4, role: "list", "aria-label": t("admin.chart.aria.bar") }, host);
    const defs = mk("defs", {}, svg);
    const id = ++uid;
    names.forEach((_, i) => {
        if (!HATCHED[i]) return;
        const p = mk("pattern", { id: `bp${id}-${i}`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
        mk("rect", { class: `ser${i}`, width: 6, height: 6 }, p);
        mk("rect", { class: "hatch-gap", width: 2.4, height: 6 }, p);
    });
    rows.forEach((r, ri) => {
        const g = mk("g", { tabindex: 0, role: "listitem", "aria-label": r.tip, transform: `translate(0,${ri * rowH})` }, svg);
        mk("rect", { class: "rowbg", x: 0, y: 0, width, height: rowH - 2 }, g);
        const label = mk("text", { class: "lbl", x: 6, y: narrow ? 15 : rowH / 2 + 4 }, g);
        if (r.haw) label.setAttribute("lang", "haw");
        label.textContent = trunc(r.label, Math.floor((narrow ? width - 12 : labelW) / 7));
        r.vals.forEach((v, si) => {
            if (v == null) return; // this series has no row for this label
            const w = Math.max(2, trackW * (v / (maxV || 1))), y = 7 + top + si * (barH + 3);
            const bar = { x: labelW, y, width: w, height: barH, rx: 4 };
            if (HATCHED[si]) bar.fill = `url(#bp${id}-${si})`; else bar.class = `ser${si}`;
            mk("rect", bar, g);
            const text = mk("text", { class: "val", x: labelW + w + 6, y: y + barH - (barH > 15 ? 5 : 2.5) }, g);
            text.textContent = r.texts[si];
        });
        const read = () => onRead && onRead(r.tip);
        g.addEventListener("focus", read);
        g.addEventListener("mouseenter", read);
    });
}

// series: [{ name, vals }]; days: ["YYYY-MM-DD"]. yFmt formats axis and readout numbers. Arrow keys move the readout.
export function lineChart(host, days, series, yFmt, yMax, onRead) {
    host.textContent = "";
    const W = Math.max(260, host.clientWidth), H = 240, pl = 44, pr = Math.min(96, Math.round(W * 0.2)), pt = 12, pb = 28, n = days.length;
    const svg = mk("svg", { width: W, height: H, tabindex: 0, role: "img", "aria-label": t("admin.chart.aria.line") }, host);
    const max = yMax || (Math.max(1, ...series.flatMap(s => s.vals)) * 1.1);
    const X = i => pl + (W - pl - pr) * (n > 1 ? i / (n - 1) : 0.5);
    const Y = v => pt + (H - pt - pb) * (1 - v / max);
    for (let k = 0; k <= 4; k++) {
        const y = Y(max * k / 4);
        mk("line", { class: k ? "grid" : "axis", x1: pl, x2: W - pr, y1: y, y2: y }, svg);
        mk("text", { class: "tick", x: pl - 6, y: y + 4, "text-anchor": "end" }, svg).textContent = yFmt(max * k / 4);
    }
    const step = Math.max(1, Math.round(n / (W < 420 ? 3 : 6)));
    for (let i = 0; i < n; i += step) mk("text", { class: "tick", x: X(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, svg).textContent = days[i].slice(5);
    const ends = [];
    series.forEach((s, si) => {
        const d = s.vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
        mk("path", { class: `line ser${si}`, d, fill: "none", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": si === 1 ? "7 4" : si === 2 ? "2 4" : "none" }, svg);
        ends.push({ si, name: s.name, y: Y(s.vals[n - 1]) + 4 });
    });
    // end labels that would overlap (equal last values) are pushed apart, top to bottom
    ends.sort((a, b) => a.y - b.y).forEach((e, i, all) => { if (i && e.y - all[i - 1].y < 15) e.y = all[i - 1].y + 15; });
    ends.forEach(e => { mk("text", { class: `val endlbl ser${e.si}`, x: W - pr + 6, y: e.y }, svg).textContent = trunc(e.name, 12); });
    const cursor = mk("line", { class: "cursor", y1: pt, y2: H - pb, opacity: 0 }, svg);
    let idx = n - 1;
    const show = i => {
        idx = Math.max(0, Math.min(n - 1, i));
        cursor.setAttribute("x1", X(idx)); cursor.setAttribute("x2", X(idx)); cursor.setAttribute("opacity", 1);
        if (onRead) onRead(`${days[idx]}: ${series.map(s => `${s.name} ${yFmt(s.vals[idx])}`).join(" · ")}`);
    };
    svg.addEventListener("pointermove", e => { const b = svg.getBoundingClientRect(); show(Math.round((e.clientX - b.left - pl) / (W - pl - pr) * (n - 1))); });
    svg.addEventListener("keydown", e => {
        if (e.key === "ArrowLeft") { show(idx - 1); e.preventDefault(); }
        else if (e.key === "ArrowRight") { show(idx + 1); e.preventDefault(); }
    });
    svg.addEventListener("focus", () => show(idx));
}
