// Singleton wired to the site (API URL + auth token). Logic lives in review-store-core.js so it can be unit-tested in Node.
import { API_BASE_URL } from "/scripts/config.js";
import { getToken } from "/scripts/auth.js";
import { createReviewStore, createReviewSession } from "/scripts/review-store-core.js";

let storage = null;
try { storage = window.localStorage; } catch { /* blocked */ }
export const reviewStore = createReviewStore({ fetchFn: (...a) => fetch(...a), token: getToken, baseUrl: API_BASE_URL, storage });
reviewStore.load();
window.addEventListener("pagehide", () => reviewStore.flush());

export const ready = reviewStore.ready;
export const newReviewSession = mode => createReviewSession(reviewStore, mode);
export { createReviewSession };

// Per-page toggle (device-local, default OFF)
const toggleKey = mode => `olelo:spaced:${mode}`;
export function getSpaced(mode) {
    try { return window.localStorage.getItem(toggleKey(mode)) === "1"; } catch { return false; }
}
export function setSpaced(mode, on) {
    try { window.localStorage.setItem(toggleKey(mode), on ? "1" : "0"); } catch { /* blocked: stays for this visit only */ }
}

// A link can open a page with spaced on for this visit only (?spaced=1, used by the profile's set list). It is not saved:
// the saved per-page setting only changes when the person uses the switch.
export function spacedFromUrl() {
    try { return new URLSearchParams(window.location.search).get("spaced") === "1"; } catch { return false; }
}
