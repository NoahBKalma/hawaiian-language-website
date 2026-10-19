import { isLoggedIn, authFetch, saveToken, logout } from "/scripts/auth.js";
import { getErrorMessage } from "/scripts/auth-errors.js";
import { t, onLangChange } from "/scripts/i18n.js";
import { API_BASE_URL } from "/scripts/config.js";
import { getLoggedInUser } from "/scripts/global.js";

const inputContainers = document.getElementsByClassName(`input-container`);

const userInput = document.getElementById(`username-input`);
const emailInput = document.getElementById(`email-input`);
const passwordInput = document.getElementById(`password-input`);
const confirmPasswordInput = document.getElementById(`confirm-password-input`);

const enterButton = document.getElementById(`enter-button`);
const messageDisplay = document.getElementById(`user-message`);

const registerButton = document.getElementById(`register-button`);
const loginButton = document.getElementById(`login-button`);
const forgotNote = document.getElementById(`forgot-note`);

let isLoginMode = null;
const SERVER_DOWN_MESSAGE = () => t(`login.msg.serverDown`);
let currentMessage = null; // the shown message as a function, so it can be re-rendered when the site language changes

// Begin in profile page if the saved login is valid, login tab if not
// (checks with the server so an old/expired token can't cause a redirect loop)
let signedInUser = null;
let serverUnreachable = false;
try { signedInUser = await getLoggedInUser(); } catch(e) { serverUnreachable = true; /* server down, stay on login */ }
if(signedInUser) {
    window.location.replace("/pages/profile.html");
} else {
    // an unreachable server says nothing about the saved login, so keep it
    if(!serverUnreachable) logout();
    switchTabLogin();
    if(serverUnreachable) setUserMessage(SERVER_DOWN_MESSAGE, `red`);
}

function switchTabRegister() {
    isLoginMode = false;
    removeUserMessage();
    
    /* update tab colors */
    loginButton.style.backgroundColor = `#d5eaea`; /* dark color */
    registerButton.classList.add(`currMode`);
    loginButton.classList.remove(`currMode`);
    registerButton.style.backgroundColor = `#b6d3d3`; /* original color */

    for (const container of inputContainers) container.style.display = `inline-grid`;
    forgotNote.hidden = true;
    passwordInput.autocomplete = `new-password`;
}

function switchTabLogin() {
    isLoginMode = true;
    removeUserMessage();

    /* update tab colors */
    registerButton.style.backgroundColor = `#d5eaea`; /* dark color */
    loginButton.classList.add(`currMode`);
    registerButton.classList.remove(`currMode`);
    loginButton.style.backgroundColor = `#b6d3d3`; /* original color */

    inputContainers[1].style.display = `none`; /* email */
    inputContainers[3].style.display = `none`; /* confirm password */
    forgotNote.hidden = false;
    passwordInput.autocomplete = `current-password`;
}

loginButton.addEventListener(`click`, switchTabLogin );
registerButton.addEventListener(`click`, switchTabRegister );

// One submit handler covers the Enter button and the Enter key inside the fields (the tab buttons are outside the form).
// `busy` stops a double submit while a request is still out.
let busy = false;
document.getElementById(`auth-input-container`).addEventListener(`submit`, async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    enterButton.disabled = true;
    try { await enterButtonDown(); }
    finally { busy = false; enterButton.disabled = false; }
});

async function enterButtonDown() {
    removeUserMessage();

    const username = userInput.value;
    const email = emailInput.value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if(isLoggedIn()) {
        await handleLogin(); // will hit the logout branch no matter what
    } else if(isLoginMode) {
        await handleLogin(username, password); // actual login attempt
    } else {
        await handleRegister(username, email, password, confirmPassword); // register attempt
    }
}

// message is a function returning the text, so a shown message can be re-rendered when the site language changes
function setUserMessage(message, color) {
    currentMessage = message;
    messageDisplay.style.display = `inline-grid`;
    messageDisplay.style.color = color;
    messageDisplay.innerText = message();
}

function removeUserMessage() {
    currentMessage = null;
    messageDisplay.style.display = `none`
}

onLangChange(() => { if(currentMessage) messageDisplay.innerText = currentMessage(); });

async function handleLogin(username=null, password=null) {
    if(isLoggedIn()) { /* logs out and refreshes the header */
        logout();
        window.location.reload();
        return;
    }

    if(username === ``) { 
        setUserMessage(() => t(`login.msg.usernameEmpty`), `red`);
        return;
    }
    else if(password === ``) {
        setUserMessage(() => t(`login.msg.passwordEmpty`), `red`);
        return;
    }

    // The username field also accepts an email
    let response;
    try {
        response = await authFetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                [username.includes(`@`) ? `email` : `username`]: username,
                password: password
            })
        });
    } catch {
        setUserMessage(SERVER_DOWN_MESSAGE, `red`);
        return;
    }

    if(response.ok) {
        const data = await response.json();
        saveToken(data.access_token);
        setUserMessage(() => t(`login.msg.loggedIn`), `green`);
        window.location.reload(); // the reloaded page redirects to the profile
    } else if(response.status === 429) {
        const data = await response.json().catch(() => ({}));
        setUserMessage(() => getErrorMessage(data), `red`);
    } else {
        setUserMessage(() => t(`login.msg.badCredentials`), `red`);
    }
}

async function handleRegister(username, email, password, confirmPassword) {

    if(password !== confirmPassword) {
        setUserMessage(() => t(`login.msg.mismatch`), `red`);
        return;
    }

    let response;
    try {
        response = await authFetch(`${API_BASE_URL}/register`,
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        username: username,
                                        email: email,
                                        password: password
                                    })
                                }
                            );
    } catch {
        setUserMessage(SERVER_DOWN_MESSAGE, `red`);
        return;
    }

    // A server crash returns plain text, so don't let a bad body hide the message
    const data = await response.json().catch(() => ({}));

    if(response.ok) {
        setUserMessage(() => t(`login.msg.created`), `green`);
        handleLogin(username, password);
    }
    else {
        setUserMessage(() => getErrorMessage(data), `red`);
    }
}

// Show/hide password: each eye button flips its own field between password and text
const toggles = document.querySelectorAll(`.pw-toggle`);
function labelToggle(button) {
    button.setAttribute(`aria-label`, t(button.getAttribute(`aria-pressed`) === `true` ? `login.pw.hide` : `login.pw.show`));
}
for (const button of toggles) {
    labelToggle(button);
    button.addEventListener(`click`, () => {
        const field = document.getElementById(button.dataset.for);
        const show = field.type === `password`;
        field.type = show ? `text` : `password`;
        button.setAttribute(`aria-pressed`, String(show));
        labelToggle(button);
    });
}
onLangChange(() => toggles.forEach(labelToggle));