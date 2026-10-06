// Singleton wired to the site (API URL + auth token). The logic lives in learning-progress-core.js so it can be unit-tested in Node.
import { API_BASE_URL } from "/scripts/config.js";
import { getToken } from "/scripts/auth.js";
import { createStore, TOTAL } from "/scripts/learning-progress-core.js";

export { TOTAL };
export const store = createStore({ fetchFn: (...a) => fetch(...a), token: getToken, baseUrl: API_BASE_URL });
store.load();
window.addEventListener("pagehide", () => store.flush());
