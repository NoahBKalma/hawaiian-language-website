class MainHeader extends HTMLElement {
    connectedCallback() {
        // Read the page subtitle from the element's text content
        // e.g. <main-header>Word Bank</main-header> → "Word Bank"
        const page_title = this.textContent;

        this.innerHTML = `
            <button id="main-nav-button">
                <img src="/assets/icons/hamburger-menu.svg" alt="Menu">
            </button>
            <a id="page-title" href="/index.html"><span lang="haw">ʻŌlelo Hawaiʻi</span>: ${page_title}</a>
            <div id="login-container">
            login container
            </div>
        `;

        const menuButton = document.getElementById('main-nav-button');
        const sideNavBar = document.querySelector('side-nav');

        // Toggles the "expanded" class, which drives the CSS open/close transition
        function toggleNavExpand() {
            sideNavBar.classList.toggle('expanded');
        }

        menuButton.addEventListener('click', toggleNavExpand);
    }
}

customElements.define("main-header", MainHeader)