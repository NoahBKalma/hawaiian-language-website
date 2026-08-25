import { isLoggedIn, authFetch } from '/scripts/auth.js'
import { API_BASE_URL } from "/scripts/config.js";

const headerLoginRegisterButton = document.getElementById(`page-login-button`);

export async function getLoggedInUsername() {
    const response = await authFetch(`${API_BASE_URL}/signed-in-user`);
    if(response.ok) {
        const data = await response.json();
        return data.username;
    }
}