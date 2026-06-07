import { isLoggedIn, authFetch } from '/scripts/auth.js'

const headerLoginRegisterButton = document.getElementById(`page-login-button`);

if(isLoggedIn()) {
    headerLoginRegisterButton.innerText = await getLoggedInUsername();
}

export async function getLoggedInUsername() {
    const response = await authFetch(`http://127.0.0.1:8000/signed-in-user`);
    if(response.ok) {
        const data = await response.json();
        return data.username;
    }
}