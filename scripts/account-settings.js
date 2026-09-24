import { getLoggedInUser } from '/scripts/global.js'
import { authFetch } from '/scripts/auth.js';

const user = await getLoggedInUser();

const usernameInput = document.getElementById(`username-input`);
const emailInput = document.getElementById(`email-input`);
const saveButton = document.getElementById(`save-button`);

const currPasswordInput = document.getElementById(`curr-password`);
const newPasswordInput = document.getElementById(`new-password`);
const confirmNewPasswordInput = document.getElementById(`confirm-new-password`);
const changePasswordButton = document.getElementById(`change-password-button`);

usernameInput.value = user.username;
emailInput.value = user.email;

saveButton.addEventListener(`click`, async () => {
    const newUser = usernameInput.value;
    const newEmail = emailInput.value;
    if (newUser === user.username && newEmail === user.email) return;

    if (confirm('Are you sure you want to change your email/username?')) {
        const response = await authFetch(`http://127.0.0.1:8000/signed-in-user`,
                                        { /* fastAPI runs on port 8000 */
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
        console.log(data);
    }
});

changePasswordButton.addEventListener(`click`, async () => {
    const currPassword = currPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmNewPassword = confirmNewPasswordInput.value;
    if (newUser === user.username && newEmail === user.email) return;

    if (confirm('Are you sure you want to change your email/username?')) {
        const response = await authFetch(`http://127.0.0.1:8000/signed-in-user`,
                                        { /* fastAPI runs on port 8000 */
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
        console.log(data);
    }
});