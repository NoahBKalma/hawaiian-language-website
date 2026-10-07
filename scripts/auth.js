export function getToken() { return localStorage.getItem(`token`); } /* gets JWT user auth token */
export function saveToken(tokenVal) { localStorage.setItem(`token`, tokenVal); } /* sets JWT user auth token */
export function logout() { if (getToken() !== null) localStorage.removeItem(`haw-unit-progress`); localStorage.removeItem(`token`); } /* logs out by deleting token from browser; a signed-in user's cached unit progress must not leak to the next visitor */
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

// Turns a backend error response into a readable message
export function getErrorMessage(data) {
    // Errors raised with HTTPException are already strings
    if (typeof data.detail === `string`) return data.detail;

    // Pydantic validation errors are a list, so use the first failed field
    if (Array.isArray(data.detail) && data.detail.length > 0) {
        const loc = data.detail[0].loc;
        const field = String(loc[loc.length - 1]);

        if (field.includes(`email`)) return `Please enter a valid email`;
        if (field.includes(`username`)) return `Usernames can only use letters, numbers, and _ . -`;
        if (field.includes(`password`)) return `Please enter a password`;
    }

    return `Something went wrong, please try again`;
}