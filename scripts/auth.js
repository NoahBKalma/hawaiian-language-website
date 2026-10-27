import { API_BASE_URL } from "./config.js";
export function getToken() { return localStorage.getItem(`token`); } /* gets JWT user auth token */
export function saveToken(tokenVal) { localStorage.setItem(`token`, tokenVal); } /* sets JWT user auth token */
export function logout() { const token = getToken(); if (token !== null) { revokeToken(token); localStorage.removeItem(`haw-unit-progress`); clearReviewCaches(); clearTutorialCaches(); } localStorage.removeItem(`token`); } /* logs out by deleting token from browser and telling the server to invalidate it; a signed-in user's cached unit progress and review schedules must not leak to the next visitor */
function revokeToken(token) { try { fetch(`${API_BASE_URL}/logout`, { method: `POST`, headers: { 'Authorization': `Bearer ${token}` }, keepalive: true }).catch(() => {}); } catch { /* offline: the local token is still removed */ } } /* best effort and not awaited, so logout stays instant; an already-expired token just gets a harmless 401 */
function clearReviewCaches() { try { Object.keys(localStorage).filter(k => k.startsWith(`olelo:review-state:v1:u`)).forEach(k => localStorage.removeItem(k)); } catch { /* storage blocked */ } } /* per-user review caches; the guest key is left alone */
function clearTutorialCaches() { try { Object.keys(localStorage).filter(k => k.startsWith(`olelo:tutorial-seen:v1:u`) || k.startsWith(`olelo:tutorial-seen-pending:v1:u`)).forEach(k => localStorage.removeItem(k)); } catch { /* storage blocked */ } } /* per-user first-visit tutorial caches and pending saves; guest flags are left alone */
export function isLoggedIn() { return getToken() !== null; } /* checks if a token exists meaning a user is logged in */

export async function authFetch(link, options={}) {
    const response = await fetch(link, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${getToken()}`
                }         
    });

    // Token is expired or the account was deleted, so log out and send to login
    if (response.status === 401 && isLoggedIn()) {
        logout();
        if (!window.location.pathname.endsWith(`/login.html`)) window.location.href = `/pages/login.html`;
    }

    return response;
}

// getErrorMessage (backend error -> site-language text) lives in auth-errors.js so this file stays free of site imports.
