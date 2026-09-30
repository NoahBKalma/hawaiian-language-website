import { isLoggedIn, authFetch, saveToken, logout, getErrorMessage } from "/scripts/auth.js";
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

let isLoginMode = null;

// Begin in profile page if the saved login is valid, login tab if not
// (checks with the server so an old/expired token can't cause a redirect loop)
let signedInUser = null;
try { signedInUser = await getLoggedInUser(); } catch(e) { /* server down, stay on login */ }
if(signedInUser) {
    window.location.replace("/pages/profile.html");
} else {
    logout();
    switchTabLogin();
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
}

loginButton.addEventListener(`click`, switchTabLogin );
registerButton.addEventListener(`click`, switchTabRegister );

enterButton.addEventListener(`click`, enterButtonDown);

function enterButtonDown() {
    removeUserMessage();

    const username = userInput.value;
    const email = emailInput.value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if(isLoggedIn()) {
        handleLogin(); // will hit the logout branch no matter what
    } else if(isLoginMode) {
        handleLogin(username, password); // actual login attempt
    } else {
        handleRegister(username, email, password, confirmPassword); // register attempt
    }
}

function setUserMessage(message, color) {
    messageDisplay.style.display = `inline-grid`;
    messageDisplay.style.color = color;
    messageDisplay.innerText = message;
}

function removeUserMessage() {
    messageDisplay.style.display = `none`
}

async function handleLogin(username=null, password=null) {
    if(isLoggedIn()) { /* logs out and refreshes the header */
        logout();
        window.location.reload();
        return;
    }

    if(username === ``) { 
        setUserMessage(`Username is empty`, `red`);
        return;
    }
    else if(password === ``) {
        setUserMessage(`Password is empty`, `red`);
        return;
    }

    // The username field also accepts an email
    const response = await authFetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            [username.includes(`@`) ? `email` : `username`]: username,
            password: password
        })
    });

    if(response.ok) {
        const data = await response.json();
        saveToken(data.access_token);
        setUserMessage(`Logged In`, `green`);
        window.location.reload(); // the reloaded page redirects to the profile
    } else {
        setUserMessage(`Incorrect username or password`, `red`);
    }
}

async function handleRegister(username, email, password, confirmPassword) {

    if(password !== confirmPassword) {
        setUserMessage(`Passwords don't match`, `red`);
        return;
    }

    const response = await authFetch(`${API_BASE_URL}/register`,
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
                            )

    const data = await response.json();

    if(response.ok) {
        setUserMessage(`Account created, logging in...`, `green`);
        handleLogin(username, password);
    }
    else {
        setUserMessage(getErrorMessage(data), `red`);
    }
}

window.addEventListener(`keydown`, (event) => {
    if(event.key === `Enter`) {
        enterButtonDown();
    }
});