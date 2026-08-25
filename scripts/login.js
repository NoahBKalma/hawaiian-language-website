import { isLoggedIn, authFetch, saveToken, logout } from "/scripts/auth.js";
import { getLoggedInUsername } from "/scripts/global.js";
import { API_BASE_URL } from "/scripts/config.js";

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

if(isLoggedIn()) { /* begin in login if logged in, register if not */
    switchTabLogin();
} else {
    switchTabRegister();
}

function switchTabRegister() {
    isLoginMode = false;
    removeUserMessage();
    
    /* update tab colors */
    loginButton.style.backgroundColor = `#d5eaea`; /* dark color */
    registerButton.classList.add(`currMode`);
    loginButton.classList.remove(`currMode`);
    registerButton.style.backgroundColor = `#b6d3d3`; /* original color */

    // Removes items if you are logged in
    if(isLoggedIn()) {
        inputContainers[1].style.display = `none`; /* email */
        inputContainers[3].style.display = `none`; /* confirm password */
        inputContainers[0].style.display = `none`; /* username */
        inputContainers[2].style.display = `none`; /* password */
        enterButton.innerHTML = `Logout`;
    } else {
        inputContainers[1].style.display = `inline-grid`; /* email */
        inputContainers[3].style.display = `inline-grid`; /* confirm password */
        inputContainers[0].style.display = `inline-grid`; /* username */
        inputContainers[2].style.display = `inline-grid`; /* password */
    }
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

    if(isLoggedIn()) {
        inputContainers[0].style.display = `none`; /* username */
        inputContainers[2].style.display = `none`; /* password */
        enterButton.innerHTML = `Logout`;
    }

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

async function setLoggedIn() {
    inputContainers[0].style.display = `none`; /* email */
    inputContainers[1].style.display = `none`; /* confirm password */
    inputContainers[2].style.display = `none`; /* username */
    inputContainers[3].style.display = `none`; /* password */
    enterButton.innerHTML = `Logout`;

    // refresh to correctly set username in header
    window.location.reload();
}

function setLoggedOut() {
    logout();
    inputContainers[1].style.display = `none`; /* email */
    inputContainers[3].style.display = `none`; /* confirm password */
    inputContainers[0].style.display = `inline-grid`; /* username */
    userInput.value = ``;
    inputContainers[2].style.display = `inline-grid`; /* password */
    passwordInput.value = ``;
    enterButton.innerText = `Enter`;

    // refresh to correctly set username in header
    window.location.reload();

}

async function handleLogin(username=null, password=null) {    
    
    if(isLoggedIn()) { /* Returns early, resets fields, and logs out */
        setLoggedOut();
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

    let response = null
    if(username.includes(`@`)) {
        response = await authFetch(`${API_BASE_URL}/login`,
                                    { /* fastAPI runs on port 8000 */
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            email: username,
                                            password: password
                                        })
                                    }
                                );

    } else {
        response = await authFetch(`${API_BASE_URL}/login`,
                                    { /* fastAPI runs on port 8000 */
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            username: username,
                                            password: password
                                        })
                                    }
                                );
        }
    
    if(response.ok) {
        const data = await response.json();
        saveToken(data.access_token);
        setLoggedIn();
        setUserMessage(`Logged In`, `green`);
    } else {
        setUserMessage(`Incorrect username or password`, `red`);
    }
}

async function handleRegister(username, email, password, confirmPassword) {

    if(password !== confirmPassword) {
        messageDisplay.style.display = `inline-grid`;
        messageDisplay.style.color = `green`;
        messageDisplay.innerText = `Passwords don't match`;
        return;
    }

    const response = await authFetch(`${API_BASE_URL}/register`,
                                { /* fastAPI runs on port 8000 */
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
        setUserMessage(`Account Created`, `green`);
    }
    else {
        setUserMessage(data.detail, `red`);
    }
}

window.addEventListener(`keydown`, (event) => {
    if(event.key === `Enter`) {
        enterButtonDown();
    }
});