// Load data from path
async function loadData(dataPath) {
    try {
        const response = await fetch(dataPath);
        return await response.json();
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

const DATA_PREFIX = `/pages/word-bank/words/data/`;

for (let i = 0; i < dataPaths.length; i++) {
    if(allData[i] == null) continue;
    // Stable set id, derived from the file path (e.g. `Animals/Birds-short_phrases`)
    allData[i].id = dataPaths[i].replace(DATA_PREFIX, ``).replace(/\.json$/, ``);
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

let setsById = new Map();
let allWordEntries = [];

// Sorts jsons into word types
for(const value of pathMap.values()) {

    // populate a master list of words
    setsById.set(value.id, value);
    for (const word of value.words) {
        allWordEntries.push({
            ...word,
            setId: value.id,
            setHawaiian: value.category_hawaiian,
            setEnglish: value.category_english,
            categoryHawaiian: value.in_category_hawaiian,
            categoryEnglish: value.in_category_english,
            pos: value.part_of_speech
        });
    }

    switch (value.part_of_speech) {
        case `adjectives`:
            adjectives.set(value.id, value);
            break;
        case `adverbs`:
            adverbs.set(value.id, value);
            break;
        case `articles`:
            articles.set(value.id, value);
            break;        
        case `conjunctions`:
            conjunctions.set(value.id, value);
            break;
        case `nouns`:
            nouns.set(value.id, value);
            break;
        case `prepositions`:
            prepositions.set(value.id, value);
            break;
        case `pronouns`:
            pronouns.set(value.id, value);
            break;
        case `short_phrases`:
            short_phrases.set(value.id, value);
            break;
        case `verbs`:
            verbs.set(value.id, value);
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

export{ setsById }
export{ allWordEntries }
