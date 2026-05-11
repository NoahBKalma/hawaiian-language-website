let words = [];

// Load data from path
async function loadData(dataPath) {
    try {
        const response = await fetch(dataPath);
        const data = await response.json();
        return data;
    } catch(e) { return null; }
}

let allData = [];
let dataPaths = [];

// Loop through each path, fetch it, and add to the array
try{
    const response = await fetch(`/pages/word-bank/words/index.json`);
    dataPaths = await response.json();

    allData = await Promise.all(
        dataPaths.map(path => loadData(path))
    );
} catch(e) { alert(`Error loading word data. Please refresh and try again.`); }

let pathMap = new Map();

for (let i = 0; i < dataPaths.length; i++) {
    if(allData[i] == null) continue;
    pathMap.set(dataPaths[i], allData[i]);
}


// used to sort word bank jsons alphabetically
function sortByHawaiian(a, b) {
    if(a[1].in_category_english == `` && b[1].in_category_english == ``) {
        return a[1].category_hawaiian.localeCompare(b[1].category_hawaiian);
    } else if(a[1].in_category_english != `` && b[1].in_category_english == ``) {
        return a[1].in_category_hawaiian.localeCompare(b[1].category_hawaiian);
    } else if(a[1].in_category_english == `` && b[1].in_category_english != ``) {
        return a[1].category_hawaiian.localeCompare(b[1].in_category_hawaiian);
    } else {
        return a[1].in_category_hawaiian.localeCompare(b[1].in_category_hawaiian);
    }
}

// Sorts map by hawaiian so the banks alphabetical
const pathEntries = pathMap.entries();
pathMap = new Map([...pathEntries].sort(sortByHawaiian));

let adjectives = new Map();
let adverbs = new Map();
let articles = new Map();
let conjunctions = new Map();
let nouns = new Map();
let prepositions = new Map();
let pronouns = new Map();
let short_phrases = new Map();
let verbs = new Map();

// Sorts jsons into word types
for(const [key, value] of pathMap) {
    switch (value.part_of_speech) {
        case `adjectives`:
            adjectives.set(value.category_hawaiian, value);
            break;
        case `adverbs`:
            adverbs.set(value.category_hawaiian, value);
            break;
        case `articles`:
            articles.set(value.category_hawaiian, value);
            break;        
        case `conjunctions`:
            conjunctions.set(value.category_hawaiian, value);
            break;
        case `nouns`:
            nouns.set(value.category_hawaiian, value);
            break;
        case `prepositions`:
            prepositions.set(value.category_hawaiian, value);
            break;
        case `pronouns`:
            pronouns.set(value.category_hawaiian, value);
            break;
        case `short_phrases`:
            short_phrases.set(value.category_hawaiian, value);
            break;
        case `verbs`:
            verbs.set(value.category_hawaiian, value);
            break;
        default:
            break;
    }
}

export{ adjectives }
export{ adverbs }
export{ articles }
export{ conjunctions }
export{ nouns }
export{ prepositions }
export{ pronouns }
export{ short_phrases }
export{ verbs }