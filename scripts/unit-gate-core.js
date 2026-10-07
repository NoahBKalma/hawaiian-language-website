// Target gate (pure, no browser globals so node:test can import it). Real unit progress decides what is unlocked:
// target k is complete when unitStore.get(k) >= its unit count, and target k opens only when 1..k-1 are all complete.
export const HOP_KEY = "haw-map-hopped";
export const JUST_DONE_KEY = "haw-unit-just-done";
export const VIEW_KEY = "haw-learning-view";

// Number of CONSECUTIVE fully complete targets counted from target 1. get(k) -> units done; targets[k-1].units.length -> unit count.
export function completedCountOf(get, targets) {
    let n = 0;
    for (let i = 0; i < targets.length; i++) {
        if (get(i + 1) >= targets[i].units.length) n++; else break;
    }
    return n;
}

export function isUnlockedAt(k, completed, total = 5) {
    const n = Number(k);
    return Number.isInteger(n) && n >= 1 && n <= total && n <= completed + 1;
}

// Main-button mode of the learning map/list. hopKey is the sessionStorage value of HOP_KEY (or null).
//   "next":  bird sits at target `done`; the button hops it to done+1 ("Begin learning" at 0, else "Next target")
//   "enter": bird sits at target done+1 (in progress); the button opens the target ("Open target")
//   "end":   all targets complete
// started: the next target (done+1) already has units done. Then the bird sits there and the button reads "Continue", whatever hopKey says.
export function journeyOf(done, hopKey, total = 5, started = false) {
    if (done >= total) return { done, mode: "end", hopped: false, label: "All targets complete" };
    if (started) return { done, mode: "enter", hopped: true, label: "Continue" };
    const hopped = hopKey !== null && hopKey !== undefined && String(hopKey) === String(done);
    return { done, mode: hopped ? "enter" : "next", hopped, label: hopped ? "Open target" : done === 0 ? "Begin learning" : "Next target" };
}

export function createGate({ unitStore, store, targets }) {
    const total = targets.length;
    const completedCount = () => completedCountOf(k => unitStore.get(k), targets);
    const isUnlocked = k => isUnlockedAt(k, completedCount(), total);
    let subscribed = false;
    const push = () => {
        if (!unitStore.isReady || !store.isReady) return;
        const c = completedCount();
        if (store.done !== c) store.set(c, { origin: "sync", now: true });
    };
    // (the old demo store is kept only as a mirror; push() already skips the write when it is equal)
    // Once both stores are loaded, make the old demo store mirror real unit progress (and keep mirroring it).
    async function syncLearningStore() {
        await Promise.all([unitStore.ready, store.ready]);
        push();
        if (!subscribed) { subscribed = true; unitStore.subscribe(push); }
        return completedCount();
    }
    return { completedCount, isUnlocked, syncLearningStore };
}
