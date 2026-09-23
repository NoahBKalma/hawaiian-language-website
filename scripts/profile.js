import { logout } from '/scripts/auth.js';

const logoutButton = document.getElementById(`logout-button`);

logoutButton.addEventListener(`click`, () => {
    logout();
    window.location.href = '/pages/login.html';
});