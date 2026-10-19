import { logout, authFetch } from '/scripts/auth.js';
import { API_BASE_URL } from '/scripts/config.js';
import { getLoggedInUser } from '/scripts/global.js';
import { achievementIcon } from '/scripts/achievement-icons.js';
import { achievementTitle } from '/scripts/achievement-text.js';
import { t, onLangChange } from '/scripts/i18n.js';
import { escapeHtml } from '/scripts/vocab-shared.js';
import { prefersReducedMotion } from '/scripts/word-utils.js';

const usernameDisplay = document.getElementById(`username`);
const userIcon = document.getElementById(`profile-icon-container`)
const logoutButton = document.getElementById(`logout-button`);

const favoriteSetList = document.getElementById(`favorite-set-list`);
const continueSetList = document.getElementById(`continue-section`);

let user = null;
let usernameDown = false;
try {
    user = await getLoggedInUser();
    if (!user) { logout(); window.location.replace(`/pages/login.html`); } // not signed in
} catch(e) {
    usernameDown = true;
    usernameDisplay.innerText = t(`profile.serverDown.name`);
}
if (user) {
    usernameDisplay.innerText = user.username;
    userIcon.innerHTML = `<p>${user.username[0].toUpperCase()}</p>`
}

const streakDisplay = document.getElementById(`streak-display`);
const badgesContainer = document.getElementById(`badges`);

const LADDERS = [
    { key: `cards` },
    { key: `words` },
    { key: `sets` },
    { key: `streak` },
    { key: `setstreak` },
    { key: `quizzes` },
    { key: `quizperfect` }
];

// What each section currently shows, so it can be painted again when the site language changes
let streakDays = null;       // null: nothing shown
let achievements = null;     // array once loaded
let badgesErrorKey = null;   // key of the error shown instead of the badges
let continueSets = [];
let favoriteSets = [];
let setsError = false;

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function renderStreak() {
    if (streakDays === null) { streakDisplay.innerHTML = ``; return; }
    const text = streakDays > 0 ? t(`profile.streak-html`, { days: streakDays }) : t(`profile.streak.start`);
    streakDisplay.innerHTML = `${achievementIcon(`flame`)}<span>${text}</span>`;
    streakDisplay.classList.toggle(`is-active`, streakDays > 0);
}

// One round badge in the original profile style
function renderBadge(a) {
    const title = escapeHtml(achievementTitle(a));
    if (a.unlocked) {
        return `
            <li class="round-badge is-unlocked">
                <div class="round-badge-icon">${achievementIcon(a.icon)}<span class="badge-check">${CHECK_SVG}</span></div>
                <span class="round-badge-title">${title}</span>
                <span class="round-badge-sub">${t(`profile.badge.unlocked`)}</span>
            </li>`;
    }
    return `
        <li class="round-badge is-locked">
            <div class="round-badge-icon">${achievementIcon(a.icon)}</div>
            <span class="round-badge-title">${title}</span>
            <span class="round-badge-sub" role="progressbar" aria-label="${escapeHtml(t(`profile.badgeProgress.aria`, { title: achievementTitle(a) }))}" aria-valuemin="0" aria-valuemax="${a.threshold}" aria-valuenow="${a.progress}">${a.progress.toLocaleString()} / ${a.threshold.toLocaleString()}</span>
        </li>`;
}

// Highest badge earned in each category first, then the next badge to earn in each category
function renderBadges() {
    if (badgesErrorKey) { renderBadgesError(); return; }
    if (!achievements) return;
    const current = [];
    const next = [];
    for (const ladder of LADDERS) {
        const items = achievements.filter(a => a.ladder === ladder.key).sort((x, y) => x.tier - y.tier);
        const earned = items.filter(a => a.unlocked);
        if (earned.length > 0) current.push(earned[earned.length - 1]);
        const upcoming = items.find(a => !a.unlocked);
        if (upcoming) next.push(upcoming);
    }
    const arrow = dir => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir === `left` ? `M15 6l-6 6 6 6` : `M9 6l6 6-6 6`}"/></svg>`;
    badgesContainer.innerHTML = `
        <div class="badge-scroller">
            <button type="button" class="badge-scroll-btn is-left" aria-label="${t(`profile.badges.scrollLeft.aria`)}" hidden>${arrow(`left`)}</button>
            <ul class="badge-row" tabindex="0" aria-label="${t(`profile.badges.row.aria`)}">${[...current, ...next].map(renderBadge).join(``)}</ul>
            <button type="button" class="badge-scroll-btn is-right" aria-label="${t(`profile.badges.scrollRight.aria`)}" hidden>${arrow(`right`)}</button>
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
    badgesContainer.innerHTML = `<p class="badges-status is-error" role="alert">${t(badgesErrorKey)}</p>`;
    badgesContainer.setAttribute(`aria-busy`, `false`);
    streakDisplay.innerHTML = ``;
}

async function loadProgress() {
    try {
        const today = new Date().toLocaleDateString(`en-CA`);
        const response = await authFetch(`${API_BASE_URL}/progress?today=${today}`);
        if (response.status === 401) return; // authFetch is already signing out and sending them to the login page
        if (!response.ok) throw new Error(`progress ${response.status}`);
        const data = await response.json();
        streakDays = data.display_streak || 0;
        achievements = data.achievements || [];
        renderStreak();
        renderBadges();
    } catch (e) {
        badgesErrorKey = `profile.badges.serverDown`;
        renderBadgesError();
    }
}

if (user) {
    loadProgress();
} else {
    badgesErrorKey = `profile.badges.serverDown`;
    renderBadgesError();
}

logoutButton.addEventListener(`click`, () => {
    logout();
    window.location.href = '/pages/login.html';
});

function addFavoriteSet(setKey, setName, setSize) {
    favoriteSets.push({ setKey, setName, setSize });
}

function addContinueSet(setKey, minFrequency, setName, currIndex, setSize) {
    continueSets.push({ setKey, minFrequency, setName, currIndex, setSize });
}

// Set names come from the server (the browser sent them when the set was saved), so they are escaped before going into HTML
function renderContinueSets() {
    if (continueSets.length === 0) {
        continueSetList.innerHTML = setsError ? `` : `<p class="sets-empty">${t(`profile.continue.empty-html`)}</p>`;
    } else {
        continueSetList.innerHTML = continueSets.map(({ setKey, minFrequency, setName, currIndex, setSize }) => `
        <div class="continue-container">
            <img src="/assets/icons/flashcard-icon.svg" alt="">
            <div class="continue-info">
                <h3>${escapeHtml(setName)}</h3>
                <p>${t(`profile.sets.cardsComplete`, { n: currIndex, total: setSize })}</p>
                <div class="progress-bar-container"><div class="progress-bar" style="width: ${currIndex/setSize * 100}%"></div></div>
            </div>
            <a class="continue-button" href="/pages/flashcards.html?set=${encodeURIComponent(setKey)}&minFreq=${minFrequency}&currIndex=${currIndex}">${t(`profile.sets.resume`)}</a>
        </div>`).join(``);
    }
    if (setsError) renderSetsError();
}

function renderFavoriteSets() {
    if (favoriteSets.length === 0) {
        favoriteSetList.innerHTML = setsError ? `` : `<p class="sets-empty">${t(`profile.favorites.empty-html`)}</p>`;
        return;
    }
    favoriteSetList.innerHTML = favoriteSets.map(({ setKey, setName, setSize }, index) => `
        <div class="favorite-set">
            <a class="set-name" href="/pages/flashcards.html?set=${encodeURIComponent(setKey)}">${escapeHtml(setName)}</a>
            <span class="word-count">${setSize}</span>
            <button type="button" class="favorite-remove" data-index="${index}" aria-label="${escapeHtml(t(`profile.favorites.remove.aria`, { name: setName }))}" title="${escapeHtml(t(`profile.favorites.remove`))}"><img src="/assets/icons/favorited-icon.svg" alt=""></button>
        </div>`).join(``);
}

// Unfavorite from here: /favorites toggles, so posting a set that is saved removes it
const favoriteMessage = document.getElementById(`favorite-message`);
favoriteSetList.addEventListener(`click`, async (event) => {
    const button = event.target.closest(`.favorite-remove`);
    if (!button) return;
    const set = favoriteSets[+button.dataset.index];
    if (!set) return;
    favoriteMessage.hidden = true;
    button.disabled = true;
    try {
        const response = await authFetch(`${API_BASE_URL}/favorites`, {
            method: `POST`,
            headers: { 'Content-Type': `application/json` },
            body: JSON.stringify({ set_key: set.setKey, set_name_haw: set.setName, set_name_eng: set.setName, set_size: set.setSize })
        });
        if (response.status === 401) return;
        const data = response.ok ? await response.json() : null;
        if (data?.favorited !== `unfavorited`) throw new Error(`not removed`);
        favoriteSets = favoriteSets.filter(s => s !== set);
        renderFavoriteSets();
        (favoriteSetList.querySelector(`.favorite-remove`) ?? favoriteSetList).focus?.();
    } catch {
        button.disabled = false;
        favoriteMessage.textContent = t(`profile.favorites.removeFailed`);
        favoriteMessage.hidden = false;
    }
});

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
    try { await loadSets(); } catch(e) {
        // backend not running
        setsError = true;
        continueSets = []; favoriteSets = [];
    }
    renderContinueSets();
    renderFavoriteSets();
}

function renderSetsError() {
    continueSetList.insertAdjacentHTML(`beforeend`, `<p class="badges-status is-error" role="alert">${t(`profile.sets.serverDown`)}</p>`);
}

// Site language changed: repaint everything this file wrote (set names are data and stay as loaded)
onLangChange(() => {
    if (usernameDown) usernameDisplay.innerText = t(`profile.serverDown.name`);
    renderStreak();
    renderBadges();
    if (user) { renderContinueSets(); renderFavoriteSets(); }
});

// Reloads when coming back with the back button so data isn't stale
window.addEventListener(`pageshow`, (event) => {
    if (event.persisted) window.location.reload();
});
