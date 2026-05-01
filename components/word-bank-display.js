class WordBank extends HTMLElement {
    async connectedCallback() {
        const wordType = this.textContent;

        const exportOptions = await import('../scripts/compile-words.js');
        const wordGroups = exportOptions[wordType];

        let html = [`
            <div class="search-container">Search container</div>
            <h1 id="title" class="page-title-font">${wordType.replace(`_`, ` `)}</h1>

            <div id="word-display" wordType="${wordType}">
            <div class="flex-word-container">
        `, `<div class="flex-word-container">`]; // Index 0 will be left side, index 1 will be right

        // Creates a new list with objects containing section name and sizes
        let lastCategory = null;
        let sectionSizes = [];
        let totalWords = 0;
        for(let [key,value] of wordGroups) {
            const isSubcategory = value.in_category !== ``;
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
        console.log(sectionSizes, totalWords);

        // Lists containing names of the sections in each side
        let leftSection = [];
        let rightSection = [];

        // Seperates each section into the left and right side, attempting to make it as equal as possible
        let leftSize = 0;
        for(let section of sectionSizes) {
            if(leftSize < totalWords/2) {
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
        
        console.log(leftSection);
        console.log(rightSection);

        // Pushes each section from 
        lastCategory = null;
        for(let sectionName of leftSection) {
            lastCategory = addSection(sectionName, `left`, lastCategory);
        }
        lastCategory = null;
        for(let sectionName of rightSection) {
            lastCategory = addSection(sectionName, `right`, lastCategory);
        }

        function addSection(name, side) {
            let i = -1;
            if(side == `left`) i = 0;
            else if(side ==`right`) i = 1;

            let value = wordGroups.get(name);
            const isSubcategory = value.in_category !== ``;
            if(!isSubcategory) {
                // Add heading
                html[i] += `
                    <span class="word-category-container">
                        <h2 class="word-category">${value.category_hawaiian}</h2>
                    </span>
                    <article class="words">
                `;
                lastCategory = null;
            } else {
                if(lastCategory == null) { // Add header only if it is the first entry of a subcategory
                    html[i] += `
                        <span class="word-category-container">
                            <h2 class="word-category">${value.in_category_hawaiian}</h2>
                        </span>
                    `;
                    lastCategory = value.category_hawaiian;
                }
                html[i] += `
                    <span class="word-subcategory-container">
                        <h3 class="word-subcategory">${value.category_hawaiian}</h3>
                    </span>
                    <article class="words">
                `;
            }
            
            // Add words regardless of category level
            for(let word of value.words) {
                html[i] += `
                    <p>${word.hawaiian}</p>
                    <p>${word.english}</p>`;                    
            }
            html[i] += `</article>`

            return lastCategory;
        }
    this.innerHTML = html[0]+"</div>"+html[1]+"</div></div>";
    }
}


customElements.define('word-bank-display', WordBank);


/* Example word bank display (in main-content)
                
                    <div class="flex-word-container">
                        <span class="word-category-container">
                            <h2 class="word-category">Nā Huahaku Helu</h2>
                        </span>
                        <span class="word-subcategory-container">
                            <h3 class="word-subcategory">word subcategory</h3>
                        </span>
                        <article class="words">
                            <p>ʻole</p>
                            <p>0</p>
                            <p>humuhumunukunukuapuaʻa</p>
                            <p>trigger fish</p>
                            <p>lua</p>
                            <p>2</p>
                            <p>kolu</p>
                            <p>3</p>
                            <p>hā</p>
                            <p>4</p>
                        </article>
                        <span class="word-subcategory-container">
                            <h3 class="word-subcategory">word subcategory</h3>
                        </span>
                        <article class="words">
                            <p>ʻole</p>
                            <p>0</p>
                            <p>humuhumunukunukuapuaʻa</p>
                            <p>trigger fish</p>
                            <p>lua</p>
                            <p>2</p>
                            <p>kolu</p>
                            <p>3</p>
                            <p>hā</p>
                            <p>4</p>
                        </article>
                        <span class="word-category-container">
                            <h2 class="word-category">Nā Huahaku Helu</h2>
                        </span>
                        <article class="words">
                            <p>ʻole</p>
                            <p>0</p>
                            <p>humuhumunukunukuapuaʻa</p>
                            <p>trigger fish</p>
                            <p>lua</p>
                            <p>2</p>
                            <p>kolu</p>
                            <p>3</p>
                            <p>hā</p>
                            <p>4</p>
                        </article>
                    </div>
                    <div class="flex-word-container">
                        <span class="word-category-container">
                            <h2 class="word-category">Nā Huahaku Helu</h2>
                        </span>
                        <article class="words">
                            <p>ʻole</p>
                            <p>0</p>
                            <p>humuhumunukunukuapuaʻa</p>
                            <p>trigger fish</p>
                            <p>lua</p>
                            <p>2</p>
                            <p>kolu</p>
                            <p>3</p>
                            <p>hā</p>
                            <p>4</p>
                            <p>ʻole</p>
                            <p>0</p>
                            <p>humuhumunukunukuapuaʻa</p>
                            <p>trigger fish</p>
                            <p>lua</p>
                            <p>2</p>
                            <p>kolu</p>
                            <p>3</p>
                            <p>hā</p>
                            <p>4</p>
                        </article>
                    </div>
                </div>

*/