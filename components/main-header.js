import { getLoggedInUser } from "/scripts/global.js";

// One login lookup per page, shared with <site-footer>. Resolves to { user } (null when logged out)
// or { error } when the server is down, so consumers never need a try/catch.
export const userReady = getLoggedInUser().then(user => ({ user }), error => ({ error }));

const ICON_ARROW_DOWN = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>`;
// Aloalo hibiscus mark (matches /assets/logo/aloalo-icon.svg), inlined so the header needs no extra request
const PETAL = "M0 0C-22-14-26-40-6-52C6-56 20-44 14-30C10-18 4-8 0 0Z";
const LOGO = `<svg viewBox="0 0 128 128" aria-hidden="true"><g transform="translate(64 64) scale(1.08)"><g fill="#a5481f">${[0, 72, 144, 216, 288].map(a => `<path d="${PETAL}" transform="rotate(${a})"/>`).join("")}</g><circle r="9" fill="#8a3a15"/><path d="M0 0L22-30" stroke="#f3c9a4" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="-30" r="4" fill="#f3c9a4"/></g></svg>`;

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
                        <li><a href="/pages/flashcards.html">Flashcards</a></li>
                        <li><a href="/pages/writing-practice.html">Writing</a></li>
                        <li><a href="/pages/quiz.html">Quizzes</a></li>
                        <li><a href="/pages/vocab.html">Vocab</a></li>
                        <li>
                            <button class="nav-more-btn" type="button" aria-expanded="false" aria-controls="nav-more">More ${ICON_ARROW_DOWN}</button>
                            <ul class="nav-more-panel" id="nav-more" hidden aria-label="Coming soon">
                                <li><span class="nav-soon" aria-disabled="true">Learning <span class="badge">Soon</span></span></li>
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
