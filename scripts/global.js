import { authFetch } from '/scripts/auth.js'
import { API_BASE_URL } from "/scripts/config.js";

export async function getLoggedInUser() {
    const response = await authFetch(`${API_BASE_URL}/signed-in-user`);
    if(response.ok) {
        const data = await response.json();
        return data;
    }
}

document.documentElement.style.setProperty('--scrollbar-width', (window.innerWidth - document.documentElement.clientWidth) + 'px');