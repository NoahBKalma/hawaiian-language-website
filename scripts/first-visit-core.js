// First-visit tutorial flags. Pure logic with injectable storage/fetch so node --test can import it (see first-visit.js for the browser side).
// Guests: local flag `olelo:tutorial-seen:<page>` (memory only if storage throws). Signed in: the account's list (from /signed-in-user) wins,
// with a per-user confirmed cache and a per-user pending key written BEFORE PUT /tutorial-seen (pending counts as seen). Never throws.
import { userIdFromToken } from "./review-store-core.js";

export const GUEST_PREFIX = "olelo:tutorial-seen:";
export const CACHE_PREFIX = "olelo:tutorial-seen:v1:u";
export const PENDING_PREFIX = "olelo:tutorial-seen-pending:v1:u";

export const guestKey = page => `${GUEST_PREFIX}${page}`;
export const cacheKey = (uid, page) => `${CACHE_PREFIX}${uid}:${page}`;
export const pendingKey = (uid, page) => `${PENDING_PREFIX}${uid}:${page}`;

// open: show the tutorial. markSeen: the caller should record it (already seen elsewhere, or opened by the user meanwhile).
// accountPages: array from the server, or null when unknown (guest, 401, timeout, failure => local flag decides).
export function decide({ tutorialOpen = false, interacted = false, signedIn = false, accountPages = null, cacheSeen = false, pending = false, local = false, page } = {}) {
    if (tutorialOpen) return { open: false, markSeen: true, reason: "tutorial-open" };   // the user opened one from the menu
    if (interacted) return { open: false, markSeen: false, reason: "interacted" };
    if (signedIn) {
        if (cacheSeen || pending) return { open: false, markSeen: false, reason: cacheSeen ? "cache" : "pending" };
        if (Array.isArray(accountPages)) return accountPages.includes(page) ? { open: false, markSeen: false, reason: "account" } : { open: true, markSeen: false, reason: "account-unseen" };
    }
    return local ? { open: false, markSeen: false, reason: "local" } : { open: true, markSeen: false, reason: "local-unseen" };
}

export function createTutorialFlags({ storage = null, fetchFn, token = null, baseUrl = "" } = {}) {
    const mem = new Map();                                  // key -> "1", used when storage throws
    const signedIn = !!token;
    const uid = signedIn ? userIdFromToken(token) : null;   // token and id read once: a concurrent 401 logout can't change keys mid-flow
    const userKeys = signedIn && uid !== null;              // signed in with no readable id: memory only

    const read = key => {
        if (mem.has(key)) return true;
        try { return !!(storage && storage.getItem(key)); } catch { return false; }
    };
    const write = key => {
        mem.set(key, "1");
        try { if (storage) storage.setItem(key, "1"); } catch { /* blocked: memory only */ }
    };
    const drop = key => {
        mem.delete(key);
        try { if (storage) storage.removeItem(key); } catch { /* blocked */ }
    };

    async function put(page) {
        if (!signedIn || typeof fetchFn !== "function") return "skipped";
        const pKey = userKeys ? pendingKey(uid, page) : null;
        if (pKey) write(pKey);                              // before the request, so a closed tab still counts as seen
        try {
            const res = await fetchFn(`${baseUrl}/tutorial-seen`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ page }),
                keepalive: true
            });
            if (res.ok) { if (pKey) { drop(pKey); write(cacheKey(uid, page)); } return "saved"; }
            if (res.status >= 500) return "retry";          // keep pending, try again next load
            if (pKey) drop(pKey);                           // 401 / other 4xx: no endless retry
            return "dropped";
        } catch { return "retry"; }                         // network error: keep pending
    }

    return {
        signedIn,
        uid,
        localSeen: page => read(guestKey(page)),
        cacheSeen: page => userKeys && read(cacheKey(uid, page)),
        pending: page => userKeys && read(pendingKey(uid, page)),
        rememberAccountSeen: page => { if (userKeys) write(cacheKey(uid, page)); },
        retryPending: page => (userKeys && read(pendingKey(uid, page)) ? put(page) : Promise.resolve("none")),
        markSeen: page => { write(guestKey(page)); return put(page); }
    };
}
