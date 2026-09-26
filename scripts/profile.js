import { logout, authFetch } from '/scripts/auth.js';
import { API_BASE_URL } from '/scripts/config.js';
import { getLoggedInUser } from '/scripts/global.js';

const usernameDisplay = document.getElementById(`username`);
const userIcon = document.getElementById(`profile-icon-container`)
const logoutButton = document.getElementById(`logout-button`);

const favoriteSetList = document.getElementById(`favorite-set-list`);
const continueSetList = document.getElementById(`continue-section`);

const user = await getLoggedInUser();
usernameDisplay.innerText = user.username;
userIcon.innerHTML = `<p>${user.username[0].toUpperCase()}</p>`

let currLanguage = `hawaiian`;

logoutButton.addEventListener(`click`, () => {
    logout();
    window.location.href = '/pages/login.html';
});

function addFavoriteSet(setName, setSize) {
    favoriteSetList.innerHTML += `
        <div class="favorite-set">
            <a class="set-name" href="/pages/flashcards.html?setName=${encodeURIComponent(setName)}">${setName}</a>
            <span class="word-count">${setSize}</span>
        </div>
            `;

}

function addContinueSet(linkName, setName, currIndex, setSize) {
    continueSetList.innerHTML += `
        <div class="continue-container">
            <img src="/assets/icons/flashcard-icon.svg">
            <div class="continue-info">
                <h3>${setName}</h3>
                <p>${currIndex} of ${setSize} cards complete</p>
                <div class="progress-bar-container"><div class="progress-bar" style="width: ${currIndex/setSize * 100}%"></div></div>
            </div>
            <a class="continue-button" href="/pages/flashcards.html?setName=${encodeURIComponent(linkName)}&currIndex=${currIndex}">Resume</a>
        </div>
            `;

}

// RUNS ON SITE LOAD

// Sets the list of continue sets
const response_continue = await authFetch(`${API_BASE_URL}/continue-sets`,
                                    {
                                        method: 'GET',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        }
                                    }
                                );
const data_continue = await response_continue.json();
data_continue.continue_sets.forEach(continueSet => {
    if (currLanguage === `hawaiian`) {
        addContinueSet(continueSet.set_name_haw, continueSet.set_name_haw, continueSet.last_studied, continueSet.set_size);
    }
    else {
        addContinueSet(continueSet.set_name_haw, continueSet.set_name_eng, continueSet.last_studied, continueSet.set_size);
    }
});

// Sets the list of favorited sets
const response_favorite = await authFetch(`${API_BASE_URL}/favorites`,
                                    {
                                        method: 'GET',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        }
                                    }
                                );
const data_favorite = await response_favorite.json();
data_favorite.favorites.forEach(favoriteSet => {
    if (currLanguage === `hawaiian`) {
        addFavoriteSet(favoriteSet.set_name_haw, favoriteSet.set_size);
    }
    else {
        addFavoriteSet(favoriteSet.set_name_eng, favoriteSet.set_size);
    }
});

// Reloads when coming back with the back button so data isn't stale
window.addEventListener(`pageshow`, (event) => {
    if (event.persisted) window.location.reload();
});