class MainHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <button id="main-nav-button">
                <img src="/assets/icons/hamburger-menu.svg" alt="Menu">
            </button>
            <a id="page-title" href="/index.html" lang="haw">ʻŌlelo Hawaiʻi</a>
            <div id="login-container">
            login container
            </div>
        `;

        const menuButton = document.getElementById('main-nav-button');
        const sideNavBar = document.querySelector('side-nav');

        function toggleNavExpand() {
            sideNavBar.classList.toggle('expanded');
        }

        menuButton.addEventListener('click', toggleNavExpand);
    }
}

customElements.define("main-header", MainHeader)