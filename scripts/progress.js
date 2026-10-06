import { API_BASE_URL } from '/scripts/config.js';
import { getToken, isLoggedIn } from '/scripts/auth.js';
import { showAchievementToasts } from '/components/achievement-toast.js';
import { markApiDown, markApiUp } from '/scripts/api-status.js';

let trackingDisabled = false; // set after a 401 so an expired token never interrupts studying

export function localDate() { return new Date().toLocaleDateString(`en-CA`); } /* YYYY-MM-DD in the user's local timezone */

function isTrackingActive() { return isLoggedIn() && !trackingDisabled; }

// Fire-and-forget: reports one study event, never throws, callers should not await it
export async function recordActivity(event) {
    if (!isTrackingActive()) return;
    try {
        const response = await fetch(`${API_BASE_URL}/activity`, {
            method: `POST`,
            headers: { 'Content-Type': `application/json`, 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ ...event, local_date: localDate() })
        });
        if (response.status === 401) { trackingDisabled = true; return; }
        if (response.status >= 500) { markApiDown(); return; }
        markApiUp();
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.new_achievements) && data.new_achievements.length > 0) showAchievementToasts(data.new_achievements);
    } catch { markApiDown(); /* tracking is best-effort; the study page just says progress isn't saving */ }
}

// Stored best writing streak for a set, or null when logged out / unavailable
export async function getSetBest(setKey) {
    if (!isTrackingActive()) return null;
    try {
        const response = await fetch(`${API_BASE_URL}/set-progress?set_key=${encodeURIComponent(setKey)}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.status === 401) { trackingDisabled = true; return null; }
        if (response.status >= 500) { markApiDown(); return null; }
        markApiUp();
        if (!response.ok) return null;
        const data = await response.json();
        return { set_key: data.set_key, best: data.best_writing_streak };
    } catch { markApiDown(); return null; }
}

// Logged-out visitors get a note explaining that progress is not saved. The close button hides it on all
// practice pages until the browser session ends.
const NOTE_DISMISSED_KEY = `olelo:save-note-dismissed`;
function noteDismissed() {
    try { return sessionStorage.getItem(NOTE_DISMISSED_KEY) === `1`; } catch { return false; }
}

function showLoggedOutNote() {
    if (isLoggedIn() || noteDismissed()) return;
    document.querySelectorAll(`.save-progress-note`).forEach(note => {
        if (!note.querySelector(`.note-close`)) {
            const close = document.createElement(`button`);
            close.type = `button`;
            close.className = `note-close`;
            close.setAttribute(`aria-label`, `Dismiss this message`);
            close.textContent = `×`;
            close.addEventListener(`click`, () => {
                try { sessionStorage.setItem(NOTE_DISMISSED_KEY, `1`); } catch { /* storage blocked: hidden for this page only */ }
                note.hidden = true;
            });
            note.append(close);
        }
        note.hidden = false;
    });
}
if (document.readyState === `loading`) document.addEventListener(`DOMContentLoaded`, showLoggedOutNote);
else showLoggedOutNote();
