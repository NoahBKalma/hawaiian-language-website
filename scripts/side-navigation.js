const menuButton = document.getElementById('main-nav-button');
const sideNavBar = document.getElementById('side-nav-bar');

function toggleNavExpand() {
    sideNavBar.classList.toggle('expanded');
}

menuButton.addEventListener('click', toggleNavExpand);