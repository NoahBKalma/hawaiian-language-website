import { applyI18n } from "/scripts/i18n.js";

class PracticeSets extends HTMLElement {
    async connectedCallback() {
        // Flashcards only: the card face language toggle sits right above the set chooser (flashcards.js owns it)
        const cardFrontToggle = document.getElementById("card") ? `<button id="card-front-toggle" type="button">Card front: Hawaiian</button>` : ``;
        this.innerHTML = `
            <article id="word-list">
                <h2 data-i18n="practice.wordList.title">Word List</h2>
                <div id="frequency-filter" class="hidden" role="group" aria-label="Minimum word frequency" data-i18n-aria-label="practice.freq.aria">
                    <span class="frequency-filter-label" data-i18n="practice.freq.label">Frequency</span>
                    <button type="button" data-min="5" aria-pressed="false">5</button>
                    <button type="button" data-min="4" aria-pressed="false">4+</button>
                    <button type="button" data-min="3" aria-pressed="false">3+</button>
                    <button type="button" data-min="2" aria-pressed="false">2+</button>
                    <button type="button" data-min="1" aria-pressed="true" class="active" data-i18n="practice.freq.all">All</button>
                    <span id="frequency-count" aria-live="polite"></span>
                </div>
                <button id="lang-toggle-word-list" type="button">Word list: Hawaiian</button>
                <ol id="word-list-entries" lang="haw" data-i18n-skip></ol>
            </article>
            ${cardFrontToggle}
            <details id="other-sets" open>
                <summary id="set-chooser-summary"><h2 data-i18n="practice.changeSet">Change set</h2></summary>
                <div id="same-category">
                    <h2 data-i18n="practice.sameCategory">Same Category</h2>
                    <div class="set-choice-container" data-i18n-skip></div>
                </div>
                <div id="same-word-type">
                    <h2 data-i18n="practice.sameType">Same Word Type</h2>
                    <div class="set-choice-container" data-i18n-skip></div>
                </div>
                <div id="different-word-types">
                    <h2 data-i18n="practice.diffTypes">Different Word Types</h2>
                    <div class="set-choice-container" data-i18n-skip></div>
                </div>
            </details>
        `
        applyI18n(this)
    }
}

customElements.define("practice-layout", PracticeSets)
