// Achievement titles in the site language. Chosen by the achievement id (the toast payload has no threshold):
// "setstreak-perfect" -> achv.setstreakPerfect; otherwise "{ladder}-{t}": achv.{ladder}.first when t == 1 and that key
// exists, else achv.{ladder} with {n}. Unknown ids fall back to the backend title. New ladders need an achv.* key.
import { t, hasKey } from "/scripts/i18n.js";

// Returns { key, vars } or null when the id has no template.
export function achievementKey(a) {
    const id = String(a?.id ?? ``);
    if (id === `setstreak-perfect`) return { key: `achv.setstreakPerfect` };
    const cut = id.lastIndexOf(`-`);
    if (cut < 1) return null;
    const ladder = id.slice(0, cut);
    const n = Number(id.slice(cut + 1));
    if (!Number.isFinite(n)) return null;
    if (n === 1 && hasKey(`achv.${ladder}.first`)) return { key: `achv.${ladder}.first` };
    if (hasKey(`achv.${ladder}`)) return { key: `achv.${ladder}`, vars: { n: n.toLocaleString(`en-US`) } };
    return null;
}

export function achievementTitle(a) {
    const hit = achievementKey(a);
    return hit ? t(hit.key, hit.vars) : a?.title ?? ``;
}
