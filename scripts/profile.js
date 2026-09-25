import { logout, authFetch } from '/scripts/auth.js';
import { API_BASE_URL } from '/scripts/config.js';
import { allWords } from '/scripts/compile-words.js';

const logoutButton = document.getElementById(`logout-button`);

const favoriteSetList = document.getElementById(`favorite-set-list`);

let currLanguage = `hawaiian`;

logoutButton.addEventListener(`click`, () => {
    logout();
    window.location.href = '/pages/login.html';
});

function addFavoriteSet(setName, setSize) {
    favoriteSetList.innerHTML += `
            <div class="favorite-set">
                <span class="set-name">${setName}</span>
                <span class="word-count">${setSize}</span>
            </div>
            `;

}

// RUNS ON SITE LOAD
const response = await authFetch(`${API_BASE_URL}/favorites`,
                                    {
                                        method: 'GET',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        }
                                    }
                                );
const data = await response.json();

// Sets the favorite icon to indicate favorited
data.favorites.forEach(favoriteSet => {
    if (currLanguage = `hawaiian`) {
        addFavoriteSet(favoriteSet.set_name_haw, favoriteSet.set_size);
    }
    else {
        addFavoriteSet(favoriteSet.set_name_eng, favoriteSet.set_size);
    }
});