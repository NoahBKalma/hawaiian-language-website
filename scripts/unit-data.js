// Unit catalog for the five targets (level 1).
// Every unit is a placeholder until real content lands. A unit may carry an optional `content` object (see unit-page.js renderRich).
export const MAX_UNITS = 4;   // keep in sync with UNITS_PER_TARGET in backend/schemas.py

const placeholder = () => Array.from({ length: 4 }, (_, i) => ({ haw: `Unit ${i + 1} name`, en: "Unit name", blurb: "Unit description", min: 5 }));

export const TARGETS = [
    { id: 1, slug: "investigation", name: "Investigation", units: placeholder() },
    { id: 2, slug: "interaction", name: "Interaction", units: placeholder() },
    { id: 3, slug: "interpretive", name: "Interpretive", units: placeholder() },
    { id: 4, slug: "interpersonal", name: "Interpersonal", units: placeholder() },
    { id: 5, slug: "presentational", name: "Presentational", units: placeholder() }
];

export function getTarget(id) {
    const n = typeof id === "string" ? (/^\d+$/.test(id.trim()) ? Number(id) : NaN) : id;
    return Number.isInteger(n) ? TARGETS.find(c => c.id === n) : undefined;
}
