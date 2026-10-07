// Wired target gate: unitStore + the old learning store + the unit catalog. Pure logic lives in unit-gate-core.js.
import { TARGETS, unitStore } from "/scripts/unit-progress.js";
import { store } from "/scripts/learning-progress.js";
import { createGate, journeyOf, HOP_KEY, JUST_DONE_KEY, VIEW_KEY } from "/scripts/unit-gate-core.js";

export { HOP_KEY, JUST_DONE_KEY, VIEW_KEY, journeyOf };
export const gate = createGate({ unitStore, store, targets: TARGETS });
export const completedCount = gate.completedCount;
export const isUnlocked = gate.isUnlocked;
export const syncLearningStore = gate.syncLearningStore;

export function readHop() { try { return sessionStorage.getItem(HOP_KEY); } catch { return null; } }
export function writeHop(v) { try { sessionStorage.setItem(HOP_KEY, String(v)); } catch { /* storage blocked */ } }
export function journey() {
    const done = completedCount();
    return journeyOf(done, readHop(), TARGETS.length, unitStore.get(done + 1) > 0);
}
