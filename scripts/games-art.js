// Game thumbnails for pages/games.html: inline SVG drawn with site color tokens, injected into [data-art] elements.
const C = { a: "var(--ocean)", b: "var(--terracotta)", c: "var(--leaf)", d: "var(--plumeria)", e: "var(--ocean-mist)", f: "var(--sand-deep)", k: "var(--koa)" };
const svg = (inner, vb = "0 0 120 90") => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;
const cell = (x, y, s, fill, ch, tc = "#fff") =>
  `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="5" fill="${fill}"/>` +
  (ch ? `<text x="${x + s / 2}" y="${y + s / 2 + 5}" text-anchor="middle" font-family="Playfair Display,serif" font-weight="700" font-size="${s * .5}" fill="${tc}">${ch}</text>` : "");
const ART = {
  wordsearch() {
    const g = ["HALE", "KAI.", "LANI", ".OKA"]; let o = "";
    g.forEach((r, y) => [...r].forEach((ch, x) => {
      const hit = y === 0;
      o += cell(14 + x * 24, 8 + y * 20, 20, hit ? C.b : C.e, ch === "." ? "A" : ch, hit ? "#fff" : C.a);
    }));
    return svg(o + `<rect x="10" y="4" width="104" height="28" rx="14" fill="none" stroke="${C.b}" stroke-width="2.5" opacity=".0"/>`);
  },
  crossword() {
    const pat = ["#.#...", "......", "#.#.#.", "......"]; let o = "";
    pat.forEach((r, y) => [...r].forEach((ch, x) => {
      o += `<rect x="${6 + x * 18}" y="${7 + y * 18}" width="17" height="17" rx="3" fill="${ch === "#" ? C.k : "#fff"}" stroke="${C.a}" stroke-width="1.2"/>`;
    }));
    return svg(o + `<text x="26" y="17" font-size="6" font-family="Inter" fill="${C.a}">1</text>`);
  },
  tiles() {
    const w = "MAHALO"; let o = "";
    [...w].forEach((ch, i) => { o += cell(5 + i * 18.5, 14, 17, i % 2 ? C.a : C.b, ch); });
    [..."OHAMAL"].forEach((ch, i) => { o += cell(5 + i * 18.5, 50, 17, C.f, ch, C.k); });
    return svg(o);
  },
  guess() {
    const rows = [[C.f, C.d, C.f, C.f, C.f], [C.c, C.c, C.d, C.f, C.c], [C.c, C.c, C.c, C.c, C.c]]; let o = "";
    rows.forEach((r, y) => r.forEach((f, x) => { o += cell(14 + x * 20, 8 + y * 24, 18, f, "", "#fff"); }));
    return svg(o);
  },
};
document.querySelectorAll("[data-art]").forEach((el) => { el.innerHTML = (ART[el.dataset.art] || (() => ""))(); });
