// Singleton wired to the site (API URL + auth token). Logic lives in unit-progress-core.js so it can be unit-tested in Node.
import { API_BASE_URL } from "/scripts/config.js";
import { getToken } from "/scripts/auth.js";
import { createUnitStore } from "/scripts/unit-progress-core.js";
import { mountProgressNotice } from "/scripts/progress-notice.js";

export { TARGETS, getTarget } from "/scripts/unit-data.js";
let storage = null;
try { storage = window.localStorage; } catch { /* blocked */ }
export const unitStore = createUnitStore({ fetchFn: (...a) => fetch(...a), token: getToken, baseUrl: API_BASE_URL, storage });
unitStore.load();
mountProgressNotice();
window.addEventListener("pagehide", () => unitStore.flush());
