import { isLoggedIn, getToken, logout } from '/scripts/auth.js'
import { API_BASE_URL } from "/scripts/config.js";

// Returns the signed in user, or null if not signed in
// Throws if the server can't be reached
export async function getLoggedInUser() {
    if(!isLoggedIn()) return null;
    const response = await fetch(`${API_BASE_URL}/signed-in-user`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if(response.ok) return await response.json();
    if(response.status === 401) logout(); // token is expired or from an old account
    return null;
}

document.documentElement.style.setProperty('--scrollbar-width', (window.innerWidth - document.documentElement.clientWidth) + 'px');