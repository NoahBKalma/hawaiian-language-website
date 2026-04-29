class MainHeader extends HTMLElement {
    connectedCallback() {
        const title = this.textContent;

        this.innerHTML = `
            <button id="main-nav-button">
                <img src="/assets/icons/hamburger-menu.svg" alt="Menu">
            </button>
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