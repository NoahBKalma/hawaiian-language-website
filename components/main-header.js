import { getLoggedInUser } from "/scripts/global.js";

class MainHeader extends HTMLElement {
    async connectedCallback() {
        // Read the page subtitle from the element's text content
        // <main-header>Word Bank</main-header> -> "Word Bank"
        const page_title = this.textContent;

        // Makes the login button say login or username if in already
        let loginLink = `<a id="page-login-button" href="/pages/login.html">Login / Register</a>`;
        try {
            const user = await getLoggedInUser(); // null if not signed in, throws if server is down
            if(user) loginLink = `<a id="page-login-button" href="/pages/profile.html">${user.username}</a>`;
        } catch (error) {
            loginLink = `<a id="page-login-button" href="/pages/login.html">Server is Down</a>`;
        }
        this.innerHTML = `
            <button id="main-nav-button">
                <img src="/assets/icons/hamburger-menu.svg" alt="Menu">
            </button>
            <a id="page-title" href="/index.html"><span lang="haw">ʻŌlelo Hawaiʻi</span>: ${page_title}</a>
            ${loginLink}
        `;

        const menuButton = document.getElementById('main-nav-button');
        menuButton.setAttribute('aria-label', 'Toggle navigation');
        menuButton.setAttribute('aria-expanded', 'false');
        
        // Toggles the "expanded" class, which drives the CSS open/close transition
        function toggleNavExpand() {
            const sideNavBar = document.querySelector('side-nav');
            const expanded = sideNavBar.classList.toggle('expanded');
            menuButton.setAttribute('aria-expanded', expanded);
        }

        menuButton.addEventListener('click', toggleNavExpand);
    }
}

customElements.define("main-header", MainHeader)