class PracticeSets extends HTMLElement {
    async connectedCallback() {
        this.innerHTML = `
            <article id="word-list">
                <h3>Word List</h3>
                <button id="lang-toggle-word-list">ʻŌlelo Hawaiʻi/English</button>
                <ol id="word-list-entries" lang="haw"></ol>
            </article>
            <div id="other-sets">
                <button id="lang-toggle-sets" style="margin:0 auto auto 0">ʻŌlelo Hawaiʻi/English</button>
                <h4 id="card-front-lang-display"></h4>
                <div id="same-category">
                    <h3>Same Category</h3>
                    <div class="set-choice-container"></div>
                </div>
                <div id="same-word-type">
                    <h3>Same Word Type</h3>
                    <div class="set-choice-container"></div>
                </div>
                <div id="different-word-types">
                    <h3>Different Word Types</h3>
                    <div class="set-choice-container"></div>
                </div>
            </div>
        `
    }
}

customElements.define("practice-layout", PracticeSets)