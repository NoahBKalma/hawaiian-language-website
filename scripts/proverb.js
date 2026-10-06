/* Proverb of the Day: renders the home-page card from proverbs-data.js.
   Pick = local day-of-year % list length (same proverb for everyone on a date).
   `?day=N` on the URL previews another day. */
import { PROVERBS } from "/scripts/proverbs-data.js";

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

export function pickProverb(list, day) {
  return list[((day % list.length) + list.length) % list.length];
}

function init(root) {
  if (!PROVERBS.length) { root.hidden = true; return; }
  const q = Number.parseInt(new URLSearchParams(location.search).get("day"), 10);
  const preview = Number.isFinite(q);
  const day = preview ? q : dayOfYear(new Date());
  const p = pickProverb(PROVERBS, day);
  const $ = (s) => root.querySelector(s);
  const more = $(".proverb-more"), toggle = $(".proverb-toggle"), label = toggle.querySelector(".t");

  $(".proverb-haw").textContent = p.haw.normalize("NFC");
  $(".proverb-en").textContent = p.en;
  $(".proverb-date").textContent = preview
    ? "Previewing day " + day
    : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (!p.explanation) { toggle.hidden = true; more.hidden = true; return; }
  $(".proverb-exp").textContent = p.explanation;
  toggle.addEventListener("click", () => {
    const open = more.hidden;
    more.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    label.textContent = open ? "Hide the meaning" : "Read the meaning";
  });
}

document.querySelectorAll("[data-proverb]").forEach(init);
