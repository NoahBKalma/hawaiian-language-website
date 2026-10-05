import { API_BASE_URL } from '/scripts/config.js';
import { getToken, isLoggedIn } from '/scripts/auth.js';
import { showAchievementToasts } from '/components/achievement-toast.js';

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
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.new_achievements) && data.new_achievements.length > 0) showAchievementToasts(data.new_achievements);
    } catch { /* tracking is best-effort */ }
}

// Stored best writing streak for a set, or null when logged out / unavailable
export async function getSetBest(setKey) {
    if (!isTrackingActive()) return null;
    try {
        const response = await fetch(`${API_BASE_URL}/set-progress?set_key=${encodeURIComponent(setKey)}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.status === 401) { trackingDisabled = true; return null; }
        if (!response.ok) return null;
        const data = await response.json();
        return { set_key: data.set_key, best: data.best_writing_streak };
    } catch { return null; }
}

// Logged-out visitors get a note explaining that progress is not saved
function showLoggedOutNote() {
    if (isLoggedIn()) return;
    document.querySelectorAll(`.save-progress-note`).forEach(note => { note.hidden = false; });
}
if (document.readyState === `loading`) document.addEventListener(`DOMContentLoaded`, showLoggedOutNote);
else showLoggedOutNote();
