import { getLoggedInUser } from "/scripts/global.js";

// One login lookup per page, shared with <site-footer>. Resolves to { user } (null when logged out)
// or { error } when the server is down, so consumers never need a try/catch.
export const userReady = getLoggedInUser().then(user => ({ user }), error => ({ error }));

const ICON_ARROW_DOWN = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>`;
// Site logo ʻiwa (frigatebird) over the waves (matches /assets/logo/site-logo-icon.svg), inlined so the header needs no extra request
const LOGO = `<svg viewBox="0 0 128 128" aria-hidden="true"><g transform="translate(0 0) scale(1)"><circle cx="64" cy="56" r="48" fill="#f3c9a4"/><path transform="translate(14.69 7.69) scale(0.78)" fill="#08343e" d="M15 5C17.5 5 24.7 4.8 29.3 5.1C33.9 5.4 37 5.8 42.6 6.8C48.3 7.7 59.4 10.2 63.4 11C67.3 11.8 65.4 11.5 66.2 11.8C67 12.1 67.6 12.3 68.1 12.9C68.7 13.4 69.2 14.1 69.6 14.9C69.9 15.7 70.4 14.6 70 17.5C69.7 20.4 67.7 29.2 67.5 32.3C67.2 35.4 67.8 34.8 68.3 35.9C68.8 37 69.3 37.7 70.5 39C71.6 40.3 73.7 42.6 75 43.6C76.4 44.7 77.5 44.9 78.6 45.3C79.7 45.6 79.8 45.6 81.5 45.6C83.2 45.7 86.8 45.7 88.9 45.4C91 45.2 93.1 44.3 94.1 44.2C95.1 44 95 44.3 95 44.3C95 44.3 89.7 48.4 88.2 49.8C86.6 51.2 86.4 51.5 85.9 52.6C85.5 53.6 85.3 55 85.3 55.9C85.3 56.8 85.5 57.2 85.7 57.8C86 58.4 86.3 59.1 86.8 59.7C87.3 60.3 87.9 60.9 88.6 61.4C89.4 61.8 88.1 61.8 91.5 62.4C94.9 63 105.7 64.2 108.9 64.8C112.1 65.3 110.2 65.3 110.8 65.7C111.4 66.2 111.9 66.7 112.3 67.6C112.7 68.4 112.9 69 113.2 70.9C113.5 72.8 113.8 74.4 113.9 78.8C114 83.1 114.1 91.8 113.9 97.1C113.7 102.4 113.1 106.2 112.5 110.5C111.9 114.7 110.5 120.7 110 122.8C109.6 124.9 109.6 123 109.6 123C109.6 123 109.2 123.5 109.2 122.4C109.1 121.3 109.5 118.3 109.4 116.4C109.3 114.6 109.6 115.1 108.5 111.2C107.4 107.3 103.9 97.7 102.6 93.1C101.3 88.5 101.3 85.6 100.6 83.5C100 81.4 99.3 81.2 98.6 80.4C98 79.7 100 80.7 96.7 79C93.5 77.3 83.2 72.2 79.3 70.4C75.4 68.6 75.4 68.6 73.4 68.2C71.4 67.8 69.2 67.6 67.4 67.8C65.6 68 64.2 68.4 62.4 69.2C60.6 70 60.2 69.7 56.7 72.6C53.2 75.6 44.7 83.9 41.2 86.9C37.7 90 37.7 89.8 35.7 91.1C33.8 92.4 31.2 93.8 29.5 94.6C27.8 95.4 25.4 96 25.4 96C25.4 96 27.8 95 30 93.2C32.2 91.5 36.7 87.4 38.6 85.4C40.5 83.5 40.8 82.5 41.3 81.6C41.7 80.8 41.3 80.5 41.3 80.5C41.3 80.5 41.4 79.9 40.5 80C39.6 80 37.8 80.2 36 80.8C34.1 81.3 31.2 82.7 29.5 83.5C27.9 84.3 28.5 83.9 26.2 85.5C23.9 87.2 15.7 93.3 15.7 93.3C15.7 93.3 16.1 92.3 17.1 91.2C18.2 90 19.9 88.3 21.9 86.4C23.9 84.5 26.9 81.6 29.3 79.8C31.7 78 32.9 77.4 36.2 75.6C39.5 73.8 45.9 71 49.1 69.2C52.2 67.4 54 65.8 55.3 64.7C56.6 63.6 56.4 63.4 56.9 62.6C57.5 61.7 58 60.7 58.4 59.7C58.7 58.7 59 57.4 59.1 56.4C59.2 55.4 59.3 55 59.1 53.8C58.9 52.5 58.5 50.3 57.9 48.7C57.3 47.2 56 45.8 55.4 44.7C54.9 43.6 54.7 43.1 54.4 42.1C54.1 41.1 53.9 41.4 53.5 38.7C53.1 36.1 52.5 28.9 52 26.1C51.5 23.3 51.1 22.9 50.6 21.8C50.1 20.7 49.8 20.4 49.1 19.7C48.3 18.9 49.3 19.1 46 17.4C42.6 15.6 32.9 10.9 28.8 9.1C24.7 7.3 23.6 7 21.2 6.5C18.8 5.9 15.7 5.9 14.5 5.7C13.3 5.6 14.1 5.3 14.1 5.3C14.1 5.3 12.5 5 15 5Z"/><g fill="none" stroke="#2f6b6c" stroke-width="4.6" stroke-linecap="round"><path d="M12 111q6.25-6 12.5 0t12.5 0t12.5 0t12.5 0t12.5 0t12.5 0t12.5 0t12.5 0" opacity="1"/><path d="M18 122q6.25-6 12.5 0t12.5 0t12.5 0t12.5 0t12.5 0t12.5 0t12.5 0t12.5 0" opacity="0.55"/></g></g></svg>`;

const ACCOUNT_PATHS = ["/pages/login.html", "/pages/profile.html", "/pages/account-settings.html"];

class MainHeader extends HTMLElement {
    connectedCallback() {
        // Skip link targets the page's real <main> (its id differs per page)
        if (!document.querySelector(".skip-link")) {
            const skip = document.createElement("a");
            skip.className = "skip-link";
            skip.href = `#${document.querySelector("main")?.id || "main-content"}`;
            skip.textContent = "Skip to main content";
            document.body.prepend(skip);
        }

        // Static markup only (no user data), rendered synchronously so scripts that touch
        // #page-login-button (account-settings.js) always find it
        this.innerHTML = `
            <header class="site-header">
                <div class="wrap">
                    <a class="brand" href="/index.html" lang="haw" aria-label="ʻŌlelo Hawaiʻi, home">${LOGO}ʻŌlelo Hawaiʻi</a>
                    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Toggle menu">
                        <svg class="bars" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
                        <svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
                    </button>
                    <nav class="site-nav" id="site-nav" aria-label="Main"><ul>
                        <li><a href="/index.html">Home</a></li>
                        <li><a href="/pages/learning.html">Learning</a></li>
                        <li><a href="/pages/flashcards.html">Flashcards</a></li>
                        <li><a href="/pages/writing-practice.html">Writing</a></li>
                        <li><a href="/pages/quiz.html">Quizzes</a></li>
                        <li><a href="/pages/vocab.html">Vocab</a></li>
                        <li>
                            <button class="nav-more-btn" type="button" aria-expanded="false" aria-controls="nav-more">More ${ICON_ARROW_DOWN}</button>
                            <ul class="nav-more-panel" id="nav-more" hidden aria-label="Coming soon">
                                <li><span class="nav-soon" aria-disabled="true">Grammar <span class="badge">Soon</span></span></li>
                                <li><span class="nav-soon" aria-disabled="true">Pronunciation <span class="badge">Soon</span></span></li>
                            </ul>
                        </li>
                        <li><a id="page-login-button" class="nav-account" href="/pages/login.html">Login / Register</a></li>
                    </ul></nav>
                </div>
            </header>
        `;

        this.markActivePage();
        this.wireNav();
        this.fillLogin();
    }

    // Marks the link for the current page (Vocab covers /pages/vocab*; Home covers "/")
    markActivePage() {
        const path = location.pathname;
        this.querySelectorAll(".site-nav a[href]:not(.nav-account)").forEach(link => {
            const href = new URL(link.href).pathname;
            const isHome = href === "/index.html" && path === "/";
            const isVocab = href === "/pages/vocab.html" && path.startsWith("/pages/vocab");
            if (path === href || isHome || isVocab) {
                link.classList.add("active");
                link.setAttribute("aria-current", "page");
            }
        });
        if (ACCOUNT_PATHS.includes(path)) {
            this.querySelector(".nav-account").setAttribute("aria-current", "page");
        }
    }

    wireNav() {
        const toggle = this.querySelector(".nav-toggle");
        const nav = this.querySelector(".site-nav");
        const more = this.querySelector(".nav-more-btn");
        const panel = this.querySelector(".nav-more-panel");

        const closeMore = () => { more.setAttribute("aria-expanded", "false"); panel.hidden = true; };
        const closeMenu = () => { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); };

        toggle.addEventListener("click", () => {
            const open = nav.classList.toggle("open");
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });
        more.addEventListener("click", () => {
            const open = more.getAttribute("aria-expanded") !== "true";
            more.setAttribute("aria-expanded", open ? "true" : "false");
            panel.hidden = !open;
        });
        nav.addEventListener("click", e => {
            if (e.target.closest("a")) closeMenu();
        });
        document.addEventListener("keydown", e => {
            if (e.key !== "Escape") return;
            if (!panel.hidden) { closeMore(); more.focus(); }
            else if (nav.classList.contains("open")) { closeMenu(); toggle.focus(); }
        });
        document.addEventListener("click", e => {
            if (!panel.hidden && !e.target.closest(".nav-more-btn") && !e.target.closest(".nav-more-panel")) closeMore();
        });
    }

    // Makes the login button say Login / Register, the username, or Server is Down.
    // textContent only: the username is user-controlled.
    async fillLogin() {
        const btn = this.querySelector("#page-login-button");
        const { user, error } = await userReady;
        if (error) {
            btn.textContent = "Server is Down";
        } else if (user) {
            btn.textContent = user.username;
            btn.href = "/pages/profile.html";
        }
    }
}

customElements.define("main-header", MainHeader);
