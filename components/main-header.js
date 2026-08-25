import { isLoggedIn } from "/scripts/auth.js";
import { getLoggedInUsername } from "/scripts/global.js";

class MainHeader extends HTMLElement {
    async connectedCallback() {
        // Read the page subtitle from the element's text content
        // <main-header>Word Bank</main-header> -> "Word Bank"
        const page_title = this.textContent;

        // Makes the login button say login or username if in already
        try {
            if(!isLoggedIn()) {
                this.innerHTML = `
                    <button id="main-nav-button">
                        <img src="/assets/icons/hamburger-menu.svg" alt="Menu">
                    </button>
                    <a id="page-title" href="/index.html"><span lang="haw">ʻŌlelo Hawaiʻi</span>: ${page_title}</a>
                    <a id="page-login-button" href="/pages/login.html">Login / Register</a>
                `;
            } else {
                const username = await getLoggedInUsername();
                this.innerHTML = `
                    <button id="main-nav-button">
                        <img src="/assets/icons/hamburger-menu.svg" alt="Menu">
                    </button>
                    <a id="page-title" href="/index.html"><span lang="haw">ʻŌlelo Hawaiʻi</span>: ${page_title}</a>
                    <a id="page-login-button" href="/pages/login.html">${username}</a>
                `;
            }
        } catch (error) {
            // says server is down
            this.innerHTML = `
                <button id="main-nav-button">
                    <img src="/assets/icons/hamburger-menu.svg" alt="Menu">
                </button>
                <a id="page-title" href="/index.html"><span lang="haw">ʻŌlelo Hawaiʻi</span>: ${page_title}</a>
                <a id="page-login-button" href="/pages/login.html">Server is Down</a>
            `;
        }

        const menuButton = document.getElementById('main-nav-button');
        
        // Toggles the "expanded" class, which drives the CSS open/close transition
        function toggleNavExpand() {
            const sideNavBar = document.querySelector('side-nav');
            sideNavBar.classList.toggle('expanded');
        }

        menuButton.addEventListener('click', toggleNavExpand);
    }
}

customElements.define("main-header", MainHeader)