import { getLoggedInUser } from '/scripts/global.js'
import { authFetch, logout, saveToken } from '/scripts/auth.js';
import { getErrorMessage } from '/scripts/auth-errors.js';
import { t, onLangChange } from '/scripts/i18n.js';
import { API_BASE_URL } from '/scripts/config.js'
import { clearStudyLog } from '/scripts/study-log.js';

// Messages are passed as functions returning the text, so shown ones can be re-rendered when the site language changes
const SERVER_DOWN_MESSAGE = () => t(`account.msg.serverDown`);

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

let passwordMessage = null, accountMessage = null;

function setUserMessagePassword(message, color) {
    passwordMessage = message;
    userMessagePassword.style.color = color;
    userMessagePassword.textContent = message();
}

function removeUserMessagePassword() {
    passwordMessage = null;
    userMessagePassword.textContent = ``;
}

function setUserMessageAccount(message, color) {
    accountMessage = message;
    userMessageAccount.style.color = color;
    userMessageAccount.textContent = message();
}

onLangChange(() => {
    if (passwordMessage) userMessagePassword.textContent = passwordMessage();
    if (accountMessage) userMessageAccount.textContent = accountMessage();
    if (deleteMessage) userMessageDelete.textContent = deleteMessage();
    if (serverDown && !user) userDisplay.innerText = t(`account.serverDown.name`);
});

saveButton.addEventListener(`click`, async () => {
    if (!user) { setUserMessageAccount(SERVER_DOWN_MESSAGE, `red`); return; } // server was unreachable on load
    const newUser = usernameInput.value;
    const newEmail = emailInput.value;
    if (newUser === user.username && newEmail === user.email) return;

    if (confirm(t('account.confirm.info'))) {
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
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
            document.getElementById(`page-login-button`).innerText = newUser;
            user = (await getLoggedInUser().catch(() => null)) ?? { username: data.username ?? newUser, email: data.email ?? newEmail };
            renderProfileBar();
            setUserMessageAccount(() => t(`account.msg.infoUpdated`), `green`);
        } else {
            setUserMessageAccount(() => getErrorMessage(data), `red`);
        }
    }
});

changePasswordButton.addEventListener(`click`, async () => {
    const currPassword = currPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmNewPassword = confirmNewPasswordInput.value;

    // check all fields are full
    if (currPassword === `` || newPassword === `` || confirmNewPassword === ``) {
        setUserMessagePassword(() => t(`account.msg.fieldsEmpty`), `red`);
        return;
    }

    // check new passwords match before posting from backend
    if (newPassword !== confirmNewPassword) {
        setUserMessagePassword(() => t(`account.msg.mismatch`), `red`);
        return;
    } else {
        removeUserMessagePassword();
    }

    // confirm then fetch
    if (confirm(t('account.confirm.password'))) {
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
        const data = await response.json().catch(() => ({}));

        if(response.ok) { // password changed
            if (data.access_token) saveToken(data.access_token); // other devices were signed out; keep this one signed in
            setUserMessagePassword(() => t(`account.msg.passwordUpdated`), `green`);
            currPasswordInput.value = ``;
            newPasswordInput.value = ``;
            confirmNewPasswordInput.value = ``;
        }
        else { // error
            setUserMessagePassword(() => getErrorMessage(data), `red`);
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

// Called on load and again after a successful save so the name, email and initial match the account
function renderProfileBar() {
    userDisplay.innerText = user.username;
    emailDisplay.innerText = user.email;
    userIcon.replaceChildren(Object.assign(document.createElement(`p`), { textContent: user.username[0].toUpperCase() }));
}

if (user) {
    renderProfileBar();
} else if (serverDown) {
    userDisplay.innerText = t(`account.serverDown.name`);
}

// Delete Account logic

const deleteCancelButton = document.getElementById(`delete-cancel-button`);
const userMessageDelete = document.getElementById(`user-message-delete`);

deleteInput.style.display = `none`;
deletePrompt.style.display = `none`;

let deletingAccount = false;
let deleteMessage = null;

function setUserMessageDelete(message, color) {
    deleteMessage = message;
    userMessageDelete.style.color = color;
    userMessageDelete.textContent = message();
}

// Delete asks for the password inline first (no browser dialogs); Cancel backs out of that step
function showDeleteStep(open) {
    deletingAccount = open;
    deleteInput.style.display = open ? `inline-block` : `none`;
    deletePrompt.style.display = open ? `inline-block` : `none`;
    deleteCancelButton.hidden = !open;
    if (!open) {
        deleteInput.value = ``;
        deleteMessage = null;
        userMessageDelete.textContent = ``;
    }
}

deleteCancelButton.addEventListener(`click`, () => showDeleteStep(false));

deleteAcctButton.addEventListener(`click`, async () => {
    if (!deletingAccount) {
        showDeleteStep(true);
        deleteInput.focus();
        return;
    }

    deleteAcctButton.disabled = true; // no double submit while the request is out
    try {
        const response = await fetchOrReport((m) => setUserMessageDelete(m, `red`))(`${API_BASE_URL}/delete-account`,
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
        if (!response) return; // server unreachable, message already shown and the password step stays open

        const data = await response.json().catch(() => ({}));
        if (data.deleted === true) {
            clearStudyLog(); // pending analytics must not be sent, and this browser gets a new visitor id
            logout();
            window.location.href = `/pages/login.html`;
        } else {
            setUserMessageDelete(() => getErrorMessage(data), `red`);
            deleteInput.value = ``;
            deleteInput.focus();
        }
    } finally {
        deleteAcctButton.disabled = false;
    }
})
