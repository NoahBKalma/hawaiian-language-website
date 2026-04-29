class SideNav extends HTMLElement {
    connectedCallback() {
        // Runs automatically when element (sidenav) is added to page
        this.innerHTML = `
            <!-- Side navigation bar content -->
            <!-- menu and learning -->
            <a class="page-link">
                <img class="logo" src="/assets/icons/learning-icon.svg" alt="Learning">
                <span class="nav-label">Learning</span>
            </a>

            <div class="section-container"></div> <!-- Break between learning and practice -->
            <a class="page-link">
                <img class="logo" src="/assets/icons/flashcard-icon.svg" alt="Flashcards">
                <span class="nav-label">Flashcards</span>
            </a>
            <a class="page-link">
                <img class="logo" src="/assets/icons/quiz-icon.svg" alt="Quizzes">
                <span class="nav-label">Quizzes</span>
            </a>
            <a class="page-link">
                <img class="logo" src="/assets/icons/writing-icon.svg" alt="Writing">
                <span class="nav-label">Writing</span>
            </a>

            <div class="section-container"></div> <!-- Break between practice and resources -->
            <a class="page-link" href="/pages/word-bank.html">
                <img class="logo" src="/assets/icons/word-bank-icon.svg" alt="Word Bank">
                <span class="nav-label">Word Bank</span>
            </a>
            <a class="page-link">
                <img class="logo" src="/assets/icons/conjugations-icon.svg" alt="Conjugation">
                <span class="nav-label">Conjugation</span>
            </a>
            <a class="page-link">
                <img class="logo" src="/assets/icons/grammar-rules-icon.svg" alt="Grammar Rules">
                <span class="nav-label">Grammar Rules</span>
            </a>
            <a class="page-link">
                <img class="logo" src="/assets/icons/pronunciation-icon.svg" alt="Audio/Video Pronunciation">
                <span class="nav-label">Audio/Video<br>Pronunciation</span>
            </a>
        `;
    }
}

customElements.define('side-nav', SideNav);