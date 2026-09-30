class PracticeSets extends HTMLElement {
    async connectedCallback() {
        this.innerHTML = `
            <article id="word-list">
                <h2>Word List</h2>
                <div id="frequency-filter" class="hidden" role="group" aria-label="Minimum word frequency">
                    <span class="frequency-filter-label">Frequency</span>
                    <button type="button" data-min="5" aria-pressed="false">5</button>
                    <button type="button" data-min="4" aria-pressed="false">4+</button>
                    <button type="button" data-min="3" aria-pressed="false">3+</button>
                    <button type="button" data-min="2" aria-pressed="false">2+</button>
                    <button type="button" data-min="1" aria-pressed="true" class="active">All</button>
                    <span id="frequency-count" aria-live="polite"></span>
                </div>
                <button id="lang-toggle-word-list" type="button">Word list: Hawaiian</button>
                <ol id="word-list-entries" lang="haw"></ol>
            </article>
            <details id="other-sets" open>
                <summary id="set-chooser-summary"><h2>Change set</h2></summary>
                <button id="lang-toggle-sets" type="button">Card front: Hawaiian</button>
                <p id="card-front-lang-display" hidden></p>
                <div id="same-category">
                    <h2>Same Category</h2>
                    <div class="set-choice-container"></div>
                </div>
                <div id="same-word-type">
                    <h2>Same Word Type</h2>
                    <div class="set-choice-container"></div>
                </div>
                <div id="different-word-types">
                    <h2>Different Word Types</h2>
                    <div class="set-choice-container"></div>
                </div>
            </details>
        `
    }
}

customElements.define("practice-layout", PracticeSets)