// "Does this count?" badge on the flashcards and writing pages. The wording comes from modeBadgeState (spaced-summary.js, pure
// and unit-tested); this file only paints it. Changes are spoken by the pages through announce(), so the badge itself is not a live region.
import { modeBadgeState } from "/scripts/spaced-summary.js";

// Distinct shapes as well as words: a check-circle (counts), a dashed circle with a pencil (practice), a clock (neutral)
const ICONS = {
    counts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>`,
    practice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3.2"/><path d="M9 15l.6-2.6L14.5 7.5l2 2-4.9 4.9z"/></svg>`,
    neutral: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
};

export function createModeBadge(element) {
    let lastKey = null;
    return {
        // opts: { spacedOn, practice, loading, caughtUp }; returns the state that was painted
        update(opts) {
            const state = modeBadgeState(opts);
            if (!element) return state;
            element.hidden = !state.visible;
            if (state.key !== lastKey) {
                lastKey = state.key;
                element.className = `mode-badge is-${state.key}`;
                element.innerHTML = state.visible ? `${ICONS[state.key]}<span class="mode-badge-text"></span>` : ``;
            }
            if (state.visible) {
                element.querySelector(`.mode-badge-text`).textContent = state.label;
                element.title = state.title;
            }
            return state;
        }
    };
}
