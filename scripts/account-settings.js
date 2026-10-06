import { getLoggedInUser } from '/scripts/global.js'
import { authFetch, logout, getErrorMessage } from '/scripts/auth.js';
import { API_BASE_URL } from '/scripts/config.js'
import { clearStudyLog } from '/scripts/study-log.js';

const SERVER_DOWN_MESSAGE = `Can't reach the server right now. Please try again in a moment.`;

// authFetch that reports an unreachable server through onDown (and returns null) instead of throwing
function fetchOrReport(onDown) {
    return async (url, options) => {
        try { return await authFetch(url, options); }
        catch { onDown(SERVER_DOWN_MESSAGE); return null; }
    };
}

let user = null;
let serverDown = false;
try {
    user = await getLoggedInUser();
    if (!user) { logout(); window.location.replace(`/pages/login.html`); } // not signed in
} catch(e) { serverDown = true; }

const usernameInput = document.getElementById(`username-input`);
const emailInput = document.getElementById(`email-input`);
const saveButton = document.getElementById(`save-button`);
const userMessageAccount = document.getElementById(`user-message-account`);

const currPasswordInput = document.getElementById(`curr-password`);
const newPasswordInput = document.getElementById(`new-password`);
const confirmNewPasswordInput = document.getElementById(`confirm-new-password`);
const changePasswordButton = document.getElementById(`change-password-button`);
const userMessagePassword = document.getElementById(`user-message-password`);

const deletePrompt = document.getElementById(`delete-prompt`);
const deleteInput = document.getElementById(`delete-input`);
const deleteAcctButton = document.getElementById(`delete-account-button`);

if (user) {
    usernameInput.value = user.username;
    emailInput.value = user.email;
}

function setUserMessagePassword(message, color) {
    userMessagePassword.style.color = color;
    userMessagePassword.textContent = message;
}

function removeUserMessagePassword() {
    userMessagePassword.textContent = ``;
}

function setUserMessageAccount(message, color) {
    userMessageAccount.style.color = color;
    userMessageAccount.textContent = message;
}

saveButton.addEventListener(`click`, async () => {
    const newUser = usernameInput.value;
    const newEmail = emailInput.value;
    if (newUser === user.username && newEmail === user.email) return;

    if (confirm('Are you sure you want to change your email/username?')) {
        const response = await fetchOrReport((m) => setUserMessageAccount(m, `red`))(`${API_BASE_URL}/edit-user`,
                                        {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                new_username: newUser,
                                                new_email: newEmail
                                            })
                                        }
                                    );
        if (!response) return;
        const data = await response.json();
        if (response.ok) {
            document.getElementById(`page-login-button`).innerText = newUser;
            user = await getLoggedInUser();
            setUserMessageAccount(`Account info updated`, `green`);
        } else {
            setUserMessageAccount(`Failed`, `red`);
        }
    }
});

changePasswordButton.addEventListener(`click`, async () => {
    const currPassword = currPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmNewPassword = confirmNewPasswordInput.value;

    // check all fields are full
    if (currPassword === `` || newPassword === `` || confirmNewPassword === ``) {
        setUserMessagePassword(`Fields cannot be empty`, `red`);
        return;
    }

    // check new passwords match before posting from backend
    if (newPassword !== confirmNewPassword) {
        setUserMessagePassword(`Passwords Don't Match`, `red`);
        return;
    } else {
        removeUserMessagePassword();
    }

    // confirm then fetch
    if (confirm('Are you sure you want to change your password?')) {
        const response = await fetchOrReport((m) => setUserMessagePassword(m, `red`))(`${API_BASE_URL}/edit-password`,
                                        {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                curr_password: currPassword,
                                                new_password: newPassword
                                            })
                                        }
                                    );
        if (!response) return;
        const data = await response.json();

        if(response.ok) { // password changed
            setUserMessagePassword(`Password Updated`, `green`);
            currPasswordInput.value = ``;
            newPasswordInput.value = ``;
            confirmNewPasswordInput.value = ``;
        }
        else { // error
            setUserMessagePassword(getErrorMessage(data), `red`);
        }
    }
});

// Reloads when coming back with the back button so data isn't stale
window.addEventListener(`pageshow`, (event) => {
    if (event.persisted) window.location.reload();
});

// Sets profile bar info
const userDisplay = document.getElementById(`user`);
const emailDisplay = document.getElementById(`email`);
const userIcon = document.getElementById(`profile-icon`);

if (user) {
    userDisplay.innerText = user.username;
    emailDisplay.innerText = user.email;
    userIcon.innerHTML = `<p>${user.username[0].toUpperCase()}</p>`;
} else if (serverDown) {
    userDisplay.innerText = `Can't reach the server. Start the backend and refresh.`;
}

// Delete Account logic

deleteInput.style.display = `none`;
deletePrompt.style.display = `none`;

let deletingAccount = false;

deleteAcctButton.addEventListener(`click`, async () => {
    if (deletingAccount) {
        deleteInput.style.display = `none`;
        deletePrompt.style.display = `none`;
        
        let response = await fetchOrReport((m) => alert(m))(`${API_BASE_URL}/delete-account`,
                                    {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            password: deleteInput.value
                                        })
                                    }
                                );
    
        if (!response) {
            deleteInput.style.display = `inline-block`;
            deletePrompt.style.display = `inline-block`;
            return;
        }
        let data = await response.json();
        if (data.deleted === true) {
            clearStudyLog(); // pending analytics must not be sent, and this browser gets a new visitor id
            logout();
            window.location.href = `/pages/login.html`;
        } else {
            alert(data.detail);

            deleteInput.value = ``;
            deleteInput.style.display = `inline-block`;
            deletePrompt.style.display = `inline-block`;
        }

    } else {
        deleteInput.style.display = `inline-block`;
        deletePrompt.style.display = `inline-block`;
        deletingAccount = true;
    }
})
