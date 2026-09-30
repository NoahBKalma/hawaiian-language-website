import { logout, authFetch, getToken } from '/scripts/auth.js';
import { API_BASE_URL } from '/scripts/config.js';
import { getLoggedInUser } from '/scripts/global.js';
import { achievementIcon } from '/scripts/achievement-icons.js';
import { escapeHtml } from '/scripts/vocab-shared.js';
import { prefersReducedMotion } from '/scripts/word-utils.js';

const usernameDisplay = document.getElementById(`username`);
const userIcon = document.getElementById(`profile-icon-container`)
const logoutButton = document.getElementById(`logout-button`);

const favoriteSetList = document.getElementById(`favorite-set-list`);
const continueSetList = document.getElementById(`continue-section`);

let user = null;
try {
    user = await getLoggedInUser();
    if (!user) { logout(); window.location.replace(`/pages/login.html`); } // not signed in
} catch(e) {
    usernameDisplay.innerText = `Can't reach the server. Start the backend and refresh.`;
}
if (user) {
    usernameDisplay.innerText = user.username;
    userIcon.innerHTML = `<p>${user.username[0].toUpperCase()}</p>`
}

const streakDisplay = document.getElementById(`streak-display`);
const badgesContainer = document.getElementById(`badges`);

const LADDERS = [
    { key: `cards`, label: `Cards studied` },
    { key: `words`, label: `Words written` },
    { key: `sets`, label: `Sets completed` },
    { key: `streak`, label: `Daily streak` },
    { key: `setstreak`, label: `Best set streak` }
];

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function renderStreak(days) {
    const text = days > 0 ? `<strong>${days}</strong>-day streak` : `Start a streak today`;
    streakDisplay.innerHTML = `${achievementIcon(`flame`)}<span>${text}</span>`;
    streakDisplay.classList.toggle(`is-active`, days > 0);
}

// One round badge in the original profile style
function renderBadge(a) {
    const title = escapeHtml(a.title);
    if (a.unlocked) {
        return `
            <li class="round-badge is-unlocked">
                <div class="round-badge-icon">${achievementIcon(a.icon)}<span class="badge-check">${CHECK_SVG}</span></div>
                <span class="round-badge-title">${title}</span>
                <span class="round-badge-sub">Unlocked</span>
            </li>`;
    }
    return `
        <li class="round-badge is-locked">
            <div class="round-badge-icon">${achievementIcon(a.icon)}</div>
            <span class="round-badge-title">${title}</span>
            <span class="round-badge-sub" role="progressbar" aria-label="${title} progress" aria-valuemin="0" aria-valuemax="${a.threshold}" aria-valuenow="${a.progress}">${a.progress.toLocaleString()} / ${a.threshold.toLocaleString()}</span>
        </li>`;
}

// Highest badge earned in each category first, then the next badge to earn in each category
function renderBadges(achievements) {
    const current = [];
    const next = [];
    for (const ladder of LADDERS) {
        const items = achievements.filter(a => a.ladder === ladder.key).sort((x, y) => x.tier - y.tier);
        const earned = items.filter(a => a.unlocked);
        if (earned.length > 0) current.push(earned[earned.length - 1]);
        const upcoming = items.find(a => !a.unlocked);
        if (upcoming) next.push(upcoming);
    }
    const arrow = dir => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir === `left` ? `M15 6l-6 6 6 6` : `M9 6l6 6-6 6`}"/></svg>`;
    badgesContainer.innerHTML = `
        <div class="badge-scroller">
            <button type="button" class="badge-scroll-btn is-left" aria-label="Scroll achievements left" hidden>${arrow(`left`)}</button>
            <ul class="badge-row" tabindex="0" aria-label="Achievements (scroll sideways for more)">${[...current, ...next].map(renderBadge).join(``)}</ul>
            <button type="button" class="badge-scroll-btn is-right" aria-label="Scroll achievements right" hidden>${arrow(`right`)}</button>
        </div>`;
    badgesContainer.setAttribute(`aria-busy`, `false`);
    setUpScrollHints(badgesContainer.querySelector(`.badge-scroller`));
}

// Fades the row's edges and shows arrow buttons only on sides that have more badges
function setUpScrollHints(scroller) {
    const row = scroller.querySelector(`.badge-row`);
    const leftBtn = scroller.querySelector(`.is-left`);
    const rightBtn = scroller.querySelector(`.is-right`);
    const update = () => {
        const max = row.scrollWidth - row.clientWidth;
        const canLeft = row.scrollLeft > 2;
        const canRight = row.scrollLeft < max - 2;
        row.classList.toggle(`fade-left`, canLeft);
        row.classList.toggle(`fade-right`, canRight);
        leftBtn.hidden = !canLeft;
        rightBtn.hidden = !canRight;
    };
    const page = dir => row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: prefersReducedMotion() ? `auto` : `smooth` });
    leftBtn.addEventListener(`click`, () => page(-1));
    rightBtn.addEventListener(`click`, () => page(1));
    row.addEventListener(`scroll`, update, { passive: true });
    window.addEventListener(`resize`, update);
    update();
}

function renderBadgesError() {
    badgesContainer.innerHTML = `<p class="badges-status is-error" role="alert">Couldn't load achievements</p>`;
    badgesContainer.setAttribute(`aria-busy`, `false`);
    streakDisplay.innerHTML = ``;
}

async function loadProgress() {
    try {
        const today = new Date().toLocaleDateString(`en-CA`);
        const response = await fetch(`${API_BASE_URL}/progress?today=${today}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error(`progress ${response.status}`);
        const data = await response.json();
        renderStreak(data.display_streak || 0);
        renderBadges(data.achievements || []);
    } catch (e) {
        renderBadgesError();
    }
}

if (user) {
    loadProgress();
} else {
    renderBadgesError();
}

logoutButton.addEventListener(`click`, () => {
    logout();
    window.location.href = '/pages/login.html';
});

function addFavoriteSet(setKey, setName, setSize) {
    favoriteSetList.innerHTML += `
        <div class="favorite-set">
            <a class="set-name" href="/pages/flashcards.html?set=${encodeURIComponent(setKey)}">${setName}</a>
            <span class="word-count">${setSize}</span>
        </div>
            `;

}

function addContinueSet(setKey, minFrequency, setName, currIndex, setSize) {
    continueSetList.innerHTML += `
        <div class="continue-container">
            <img src="/assets/icons/flashcard-icon.svg" alt="">
            <div class="continue-info">
                <h3>${setName}</h3>
                <p>${currIndex} of ${setSize} cards complete</p>
                <div class="progress-bar-container"><div class="progress-bar" style="width: ${currIndex/setSize * 100}%"></div></div>
            </div>
            <a class="continue-button" href="/pages/flashcards.html?set=${encodeURIComponent(setKey)}&minFreq=${minFrequency}&currIndex=${currIndex}">Resume</a>
        </div>
            `;

}

// RUNS ON SITE LOAD

// Loads continue and favorite sets (skipped if the server can't be reached)
async function loadSets() {
    const response_continue = await authFetch(`${API_BASE_URL}/continue-sets`);
    const data_continue = await response_continue.json();
    data_continue.continue_sets.forEach(continueSet => {
        addContinueSet(continueSet.set_key, continueSet.min_frequency, continueSet.set_name_haw, continueSet.last_studied, continueSet.set_size);
    });

    const response_favorite = await authFetch(`${API_BASE_URL}/favorites`);
    const data_favorite = await response_favorite.json();
    data_favorite.favorites.forEach(favoriteSet => {
        addFavoriteSet(favoriteSet.set_key, favoriteSet.set_name_haw, favoriteSet.set_size);
    });
}

if (user) {
    try { await loadSets(); } catch(e) { /* backend not running */ }
}

// Reloads when coming back with the back button so data isn't stale
window.addEventListener(`pageshow`, (event) => {
    if (event.persisted) window.location.reload();
});
