// Small per-browser preferences (card front language, last set). Storage can be blocked or full, so every
// call is wrapped and falls back quietly.
const PREFIX = `olelo:`;

export function getPref(key, fallback = null) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
}

export function setPref(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage blocked */ }
}
