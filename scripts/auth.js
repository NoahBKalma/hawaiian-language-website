export function getToken() { return localStorage.getItem(`token`); } /* gets JWT user auth token */
export function saveToken(tokenVal) { localStorage.setItem(`token`, tokenVal); } /* sets JWT user auth token */
export function logout() { localStorage.removeItem(`token`); } /* logs out by deleting token from browser */
export function isLoggedIn() { return getToken() !== null; } /* checks if a token exists meaning a user is logged in */

export async function authFetch(link, options={}) {
    return fetch(link, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${getToken()}`
                }         
    });
}