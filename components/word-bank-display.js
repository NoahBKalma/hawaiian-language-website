import { setAnchor } from "/scripts/word-utils.js";
import { POS_LABELS } from "/scripts/vocab-shared.js";

class WordBank extends HTMLElement {
    async connectedCallback() {
        const wordType = this.textContent;

        const exportOptions = await import('../scripts/compile-words.js');
        const wordGroups = exportOptions[wordType];
        if (!wordGroups) {
            this.innerHTML = `<p>Error: unknown word type "${wordType}"</p>`;
            return;
        }
        if (wordGroups.size === 0) {
            this.innerHTML = `<p class="vocab-message">There are no words of this type yet.</p>`;
            return;
        }

        // Creates a new list with objects containing section name and sizes
        let lastCategory = null;
        let sectionSizes = [];
        let totalWords = 0;
        for(let [key,value] of wordGroups) {
            const isSubcategory = value.in_category_english !== ``;
            totalWords += value.words.length;
            if(!isSubcategory){
                sectionSizes.push( {name: key, length: value.words.length, subcategory: false} );
                lastCategory = null;
            } else {
                if (lastCategory == null) {
                sectionSizes.push( {name: value.in_category_hawaiian, length: value.words.length, subcategory: true, children: [key]} );
                    lastCategory = value.in_category_hawaiian;
                } else {
                    sectionSizes[sectionSizes.length - 1].length += value.words.length;
                    sectionSizes[sectionSizes.length - 1].children.push(key);
                }
            }
        }
        
        sectionSizes = sectionSizes.sort((a, b) => b.length-a.length);

        // Lists containing names of the sections in each side
        let leftSection = [];
        let rightSection = [];

        // Seperates each section into the left and right side, attempting to make it as equal as possible
        let leftSize = 0;
        for(let section of sectionSizes) {
        const leftIfAdded = leftSize + section.length;
        const rightIfAdded = (totalWords - leftSize) + section.length;

        if(leftIfAdded < rightIfAdded) {
            if(section.subcategory == false) {
                leftSection.push(section.name);
            } else {
                leftSection.push(...section.children);
            }
            leftSize += section.length;
            } else {
                if(section.subcategory == false) {
                    rightSection.push(section.name);
                } else {
                    rightSection.push(...section.children);
                }
            }
        }
        
        let html = [];
        // Writes the beginning of the html
        function addBeginningHTML() {
            const labels = POS_LABELS[wordType];
            const title = labels
                ? (currLanguage === `hawaiian` ? labels.haw : labels.en)
                : wordType.replaceAll(`_`, ` `);
            html = [`
                <h1 id="title" class="page-title-font"${currLanguage === `hawaiian` ? ` lang="haw"` : ``}>${title}</h1>
                <button id="lang-toggle">ʻŌlelo Hawaiʻi/English</button>

                <div id="word-display" wordType="${wordType}">
                <div class="flex-word-container">
            `, `<div class="flex-word-container">`]; // Index 0 will be left side, index 1 will be right
        }
        // Pushes a section to the html in the current language
        function addSection(name, side) {
                const i = side === `left` ? 0 : 1;
                const lang = currLanguage === `hawaiian` ? ` lang="haw"` : ``;

                const value = wordGroups.get(name);
                const isSubcategory = value.in_category_english !== ``;
                if(!isSubcategory) {
                    // Add heading
                    html[i] += `
                        <span class="word-category-container" id="${setAnchor(name)}">
                            <h2 class="word-category"${lang}>${value[`category_${currLanguage}`]}</h2>
                        </span>
                        <article class="words">
                    `;
                    lastCategory = null;
                } else {
                    if(lastCategory == null) { // Add header only if it is the first entry of a subcategory
                        html[i] += `
                            <span class="word-category-container">
                                <h2 class="word-category"${lang}>${value[`in_category_${currLanguage}`]}</h2>
                            </span>
                        `;
                        lastCategory = value[`category_${currLanguage}`];
                    }
                    html[i] += `
                        <span class="word-subcategory-container" id="${setAnchor(name)}">
                            <h3 class="word-subcategory"${lang}>${value[`category_${currLanguage}`]}</h3>
                        </span>
                        <article class="words">
                    `;
                }

                // Add words regardless of category level
                for(let word of value.words) {
                    html[i] += `
                        <p lang="haw">${word.hawaiian}</p>
                        <p>${word.english}</p>`;
                }
                html[i] += `</article>`
        }

        let currLanguage = `hawaiian`;

        const switchLanguage = () => {
            currLanguage = currLanguage === `english` ? `hawaiian` : `english`;
            addBeginningHTML();
            // Each side tracks its own subcategory headers
            lastCategory = null;
            for(let sectionName of leftSection) addSection(sectionName, `left`);
            lastCategory = null;
            for(let sectionName of rightSection) addSection(sectionName, `right`);
            this.innerHTML = html[0]+`</div>`+html[1]+`</div></div>`;
            // Add listener to new button every time one is made
            this.querySelector(`#lang-toggle`).addEventListener(`click`, switchLanguage);
            makeCollapsible(this);
        };

        // Category and set headers collapse the words under them.
        // A category header hides everything up to the next category header;
        // a set header hides just its own word list.
        function makeCollapsible(root) {
            const headers = root.querySelectorAll(`.word-category-container, .word-subcategory-container`);
            for (const header of headers) {
                header.classList.add(`collapsible-header`);
                header.setAttribute(`role`, `button`);
                header.setAttribute(`tabindex`, `0`);
                header.setAttribute(`aria-expanded`, `true`);
            }

            function sectionFor(header) {
                const isCategory = header.classList.contains(`word-category-container`);
                const items = [];
                let el = header.nextElementSibling;
                while (el && !el.classList.contains(`word-category-container`)) {
                    if (!isCategory && el.classList.contains(`word-subcategory-container`)) break;
                    items.push(el);
                    el = el.nextElementSibling;
                }
                return items;
            }

            function toggle(header) {
                const expand = header.getAttribute(`aria-expanded`) !== `true`;
                header.setAttribute(`aria-expanded`, String(expand));
                for (const el of sectionFor(header)) {
                    el.hidden = !expand;
                    // Re-expanding a category shows its sets as they were (all expanded)
                    if (expand && el.classList.contains(`word-subcategory-container`)) el.setAttribute(`aria-expanded`, `true`);
                }
            }

            if (root.dataset.collapsibleBound) return; // listeners survive re-renders, add them once
            root.dataset.collapsibleBound = `true`;
            root.addEventListener(`click`, (event) => {
                const header = event.target.closest(`.collapsible-header`);
                if (header && root.contains(header)) toggle(header);
            });
            root.addEventListener(`keydown`, (event) => {
                const header = event.target.closest(`.collapsible-header`);
                if (header && (event.key === `Enter` || event.key === ` `)) {
                    event.preventDefault();
                    toggle(header);
                }
            });
        }

        switchLanguage();

        // Content renders after load, so the browser can't jump to a `#set-...` anchor by itself
        if (location.hash) {
            const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
            if (target) {
                target.classList.add(`anchor-target`);
                target.scrollIntoView({ block: `start` });
            }
        }
    }
}

customElements.define('word-bank-display', WordBank);

