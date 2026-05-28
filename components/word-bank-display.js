class WordBank extends HTMLElement {
    async connectedCallback() {
        const wordType = this.textContent;

        const exportOptions = await import('../scripts/compile-words.js');
        const wordGroups = exportOptions[wordType];
        if (!wordGroups) {
            this.innerHTML = `<p>Error: unknown word type "${wordType}"</p>`;
            return;
        }

        // Creates a new list with objects containing section name and sizes
        let lastCategory = null;
        let sectionSizes = [];
        let totalWords = 0;
        for(let [key,value] of wordGroups) {
            const isSubcategory = value.in_category_english!== ``;
            totalWords += value.words.length;
            if(!isSubcategory){
                sectionSizes.push( {name: value.category_hawaiian, length: value.words.length, subcategory: false} );
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

        if(leftIfAdded - totalWords/2 < rightIfAdded - totalWords/2) {
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
        // Translations for the page title
        const titleTranslations = {
            nouns: { english: `Nouns`, hawaiian: `Nā Papani` },
            verbs: { english: `Verbs`, hawaiian: `Nā Hehele / Nā Hamani` },
            adjectives: { english: `Adjectives`, hawaiian: `Nā ʻAʻano` },
            adverbs: { english: `Adverbs`, hawaiian: `Nā ʻŌlelo ʻĒ Aʻe` },
            short_phrases: { english: `Short Phrases`, hawaiian: `Nā ʻŌlelo Pōkole` },
            pronouns: { english: `Pronouns`, hawaiian: `Nā Kaʻi` },
            articles: { english: `Articles`, hawaiian: `Nā Pilimua` },
            prepositions: { english: `Prepositions`, hawaiian: `Nā ʻAmi` },
            conjunctions: { english: `Conjunctions`, hawaiian: `Nā Huipū` },
        };
        // Writes the beginning of the html
        function addBeginningHTML() {
            const title = titleTranslations[wordType]
                ? titleTranslations[wordType][currLanguage]
                : wordType.replaceAll(`_`, ` `);
            html = [`
                <h1 id="title" class="page-title-font"${currLanguage === `hawaiian` ? ` lang="haw"` : ``}>${title}</h1>
                <button id="lang-toggle">ʻŌlelo Hawaiʻi/English</button>

                <div id="word-display" wordType="${wordType}">
                <div class="flex-word-container">
            `, `<div class="flex-word-container">`]; // Index 0 will be left side, index 1 will be right
        }
        // Pushes a section to the html
        function addSectionHawaiian(name, side) {
                let i = -1;
                if(side == `left`) i = 0;
                else if(side ==`right`) i = 1;

                let value = wordGroups.get(name);
                const isSubcategory = value.in_category_english!== ``;
                if(!isSubcategory) {
                    // Add heading
                    html[i] += `
                        <span class="word-category-container">
                            <h2 class="word-category" lang="haw">${value.category_hawaiian}</h2>
                        </span>
                        <article class="words">
                    `;
                    lastCategory = null;
                } else {
                    if(lastCategory == null) { // Add header only if it is the first entry of a subcategory
                        html[i] += `
                            <span class="word-category-container">
                                <h2 class="word-category" lang="haw">${value.in_category_hawaiian}</h2>
                            </span>
                        `;
                        lastCategory = value.category_hawaiian;
                    }
                    html[i] += `
                        <span class="word-subcategory-container">
                            <h3 class="word-subcategory" lang="haw">${value.category_hawaiian}</h3>
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

                return lastCategory;
        }
        function addSectionEnglish(name, side) {
                let i = -1;
                if(side == `left`) i = 0;
                else if(side ==`right`) i = 1;

                let value = wordGroups.get(name);
                const isSubcategory = value.in_category_english!== ``;
                if(!isSubcategory) {
                    // Add heading
                    html[i] += `
                        <span class="word-category-container">
                            <h2 class="word-category">${value.category_english}</h2>
                        </span>
                        <article class="words">
                    `;
                    lastCategory = null;
                } else {
                    if(lastCategory == null) { // Add header only if it is the first entry of a subcategory
                        html[i] += `
                            <span class="word-category-container">
                                <h2 class="word-category">${value.in_category_english}</h2>
                            </span>
                        `;
                        lastCategory = value.category_english;
                    }
                    html[i] += `
                        <span class="word-subcategory-container">
                            <h3 class="word-subcategory">${value.category_english}</h3>
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

                return lastCategory;
        }

        
        let currLanguage = `hawaiian`;
        // Define this as self so it can be used inside switchLanguage
        const self = this;
        
        function switchLanguage() {
            currLanguage = currLanguage === `english` ? `hawaiian` : `english`;
            addBeginningHTML()
            if(currLanguage == `english`) {
                // Pushes each section from the left side and right side depending on what the language setting is on
                lastCategory = null;
                for(let sectionName of leftSection) {
                    lastCategory = addSectionEnglish(sectionName, `left`, lastCategory);
                }
                lastCategory = null;
                for(let sectionName of rightSection) {
                    lastCategory = addSectionEnglish(sectionName, `right`, lastCategory);
                }
            } else {
                // Pushes each section from the left side and right side depending on what the language setting is on
                lastCategory = null;
                for(let sectionName of leftSection) {
                    lastCategory = addSectionHawaiian(sectionName, `left`, lastCategory);
                }
                lastCategory = null;
                for(let sectionName of rightSection) {
                    lastCategory = addSectionHawaiian(sectionName, `right`, lastCategory);
                }
            }
            self.innerHTML = html[0]+`</div>`+html[1]+`</div></div>`;
            // Add listener to new button every time one is made
            const switchLangButton = document.querySelector(`#lang-toggle`);
            switchLangButton.addEventListener(`click`, switchLanguage);
        }

        switchLanguage();
    }
}

customElements.define('word-bank-display', WordBank);

