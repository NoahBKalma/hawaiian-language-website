// Auto-opens a page's tutorial on the visitor's first visit (see first-visit-core.js for the rules).
// The account's seen list rides on the header's existing /signed-in-user lookup (`userReady` from main-header.js), so no second authenticated request.
// Plain fetch for the PUT (never authFetch): a stale token must not redirect off a study page. Never throws.
import { API_BASE_URL } from "/scripts/config.js";
import { userReady } from "/components/main-header.js";
import { createTutorialFlags, decide } from "/scripts/first-visit-core.js";

const WAIT_MS = 1500;
const manual = new Set();      // pages whose tutorial the visitor opened from the help menu
const settled = new Map();     // page -> flags, once the auto-open decision is made

function readToken() { try { return localStorage.getItem(`token`); } catch { return null; } }
function readStorage() { try { return window.localStorage; } catch { return null; } }
const isOpen = () => document.body.classList.contains(`tut-open`) || !!document.querySelector(`.tut-backdrop`);

// Called by the help menu when the visitor opens a tutorial themselves: that counts as seen.
export function noteManualOpen(page) {
    manual.add(page);
    const flags = settled.get(page);
    if (flags) flags.markSeen(page);
}

// openFn(trigger) shows the tutorial (sync or async). Resolves to true if it was auto-opened.
export async function autoOpenFirstVisit(page, openFn, trigger) {
    try {
        let interacted = false;
        const onTrusted = event => { if (event.isTrusted) interacted = true; };
        window.addEventListener(`pointerdown`, onTrusted, true);
        window.addEventListener(`keydown`, onTrusted, true);

        const flags = createTutorialFlags({ storage: readStorage(), fetchFn: (...a) => fetch(...a), token: readToken(), baseUrl: API_BASE_URL });
        let accountPages = null;
        try {
            if (flags.signedIn && !flags.cacheSeen(page)) {
                if (flags.pending(page)) flags.retryPending(page);
                else {
                    const timeout = new Promise(resolve => setTimeout(() => resolve(null), WAIT_MS));
                    const result = await Promise.race([userReady, timeout]);
                    const list = result && result.user && result.user.tutorials_seen;
                    accountPages = Array.isArray(list) ? list : null;
                }
            }
        } finally {
            window.removeEventListener(`pointerdown`, onTrusted, true);
            window.removeEventListener(`keydown`, onTrusted, true);
        }

        settled.set(page, flags);
        const verdict = decide({
            page,
            tutorialOpen: isOpen() || manual.has(page),
            interacted,
            signedIn: flags.signedIn,
            accountPages,
            cacheSeen: flags.cacheSeen(page),
            pending: flags.pending(page),
            local: flags.localSeen(page)
        });
        if (verdict.reason === `account`) flags.rememberAccountSeen(page);
        if (verdict.markSeen) flags.markSeen(page);
        if (!verdict.open) return false;

        await openFn(trigger);
        if (!document.querySelector(`.tut-backdrop`)) return false;   // the opener failed: stay unseen
        flags.markSeen(page);
        return true;
    } catch {
        return false;
    }
}
