class SideNav extends HTMLElement {
    async connectedCallback() {
        // Runs automatically when element (sidenav) is added to page
        this.innerHTML = `
            <!-- Side navigation bar content -->
            <!-- Learning -->
            <span class="page-link is-soon" title="Learning: coming soon">
                <img class="logo" src="/assets/icons/learning-icon.svg" alt="Learning (coming soon)">
                <span class="nav-label">Learning<span class="soon-tag" aria-hidden="true">Soon</span></span>
            </span>

            <div class="section-container"></div> <!-- Break between learning and practice -->
            <a class="page-link" href="/pages/flashcards.html">
                <img class="logo" src="/assets/icons/flashcard-icon.svg" alt="Flashcards">
                <span class="nav-label">Flashcards</span>
            </a>
            <a class="page-link" href="/pages/writing-practice.html">
                <img class="logo" src="/assets/icons/writing-icon.svg" alt="Writing">
                <span class="nav-label">Writing</span>
            </a>
            <span class="page-link is-soon" title="Quizzes: coming soon">
                <img class="logo" src="/assets/icons/quiz-icon.svg" alt="Quizzes (coming soon)">
                <span class="nav-label">Quizzes<span class="soon-tag" aria-hidden="true">Soon</span></span>
            </span>

            <div class="section-container"></div> <!-- Break between practice and resources -->
            <a class="page-link" href="/pages/vocab.html">
                <img class="logo" src="/assets/icons/word-bank-icon.svg" alt="Vocab">
                <span class="nav-label">Vocab</span>
            </a>
            <span class="page-link is-soon" title="Grammar Rules: coming soon">
                <img class="logo" src="/assets/icons/grammar-rules-icon.svg" alt="Grammar Rules (coming soon)">
                <span class="nav-label">Grammar Rules<span class="soon-tag" aria-hidden="true">Soon</span></span>
            </span>
            <span class="page-link is-soon" title="Audio/Video Pronunciation: coming soon">
                <img class="logo" src="/assets/icons/pronunciation-icon.svg" alt="Audio/Video Pronunciation (coming soon)">
                <span class="nav-label">Audio/Video<br>Pronunciation<span class="soon-tag" aria-hidden="true">Soon</span></span>
            </span>
        `;

        // Marks the link for the current page (Vocab covers /pages/vocab*)
        const path = location.pathname;
        this.querySelectorAll('a.page-link[href]').forEach(link => {
            const href = new URL(link.href).pathname;
            const isVocab = href === '/pages/vocab.html' && path.startsWith('/pages/vocab');
            if (path === href || isVocab) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
            }
        });
    }
}

customElements.define('side-nav', SideNav);