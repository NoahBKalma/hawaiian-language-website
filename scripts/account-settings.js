import { getLoggedInUser } from '/scripts/global.js'
import { authFetch, logout } from '/scripts/auth.js';
import { API_BASE_URL } from '/scripts/config.js'

let user = await getLoggedInUser();

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

usernameInput.value = user.username;
emailInput.value = user.email;

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
        const response = await authFetch(`${API_BASE_URL}/edit-user`,
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
        const response = await authFetch(`${API_BASE_URL}/edit-password`,
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
        const data = await response.json();

        if(response.ok) { // password changed
            setUserMessagePassword(`Password Updated`, `green`);
            currPasswordInput.value = ``;
            newPasswordInput.value = ``;
            confirmNewPasswordInput.value = ``;
        }
        else { // error
            setUserMessageAccount(getErrorMessage(data), `red`);
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

user = await getLoggedInUser();
userDisplay.innerText = user.username;
emailDisplay.innerText = user.email;
userIcon.innerHTML = `<p>${user.username[0].toUpperCase()}</p>`;

// Delete Account logic

deleteInput.style.display = `none`;
deletePrompt.style.display = `none`;

let deletingAccount = false;

deleteAcctButton.addEventListener(`click`, async () => {
    if (deletingAccount) {
        deleteInput.style.display = `none`;
        deletePrompt.style.display = `none`;
        
        let response = await authFetch(`${API_BASE_URL}/delete-account`,
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
    
        let data = await response.json();
        if (data.deleted === true) {
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