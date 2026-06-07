let currLanguage = `hawaiian`;

const nounsLink = document.getElementById(`nouns`);
const verbsLink = document.getElementById(`verbs`);
const adjectivesLink = document.getElementById(`adjectives`);
const adverbsLink = document.getElementById(`adverbs`);
const shortPhrasesLink = document.getElementById(`short-phrases`);
const pronounsLink = document.getElementById(`pronouns`);
const articlesLink = document.getElementById(`articles`);
const prepositionsLink = document.getElementById(`prepositions`);
const conjunctionsLink = document.getElementById(`conjunctions`);

const switchLanguageBtn = document.getElementById(`lang-toggle`);

switchLanguageBtn.addEventListener(`click`, switchLinkLanguages);

function switchLinkLanguages() {
    currLanguage = currLanguage === `english` ? `hawaiian` : `english`;

    if(currLanguage === `english`) {
        nounsLink.innerHTML = `Nouns`;
        verbsLink.innerHTML = `Verbs`;
        adjectivesLink.innerHTML = `Adjectives`;
        adverbsLink.innerHTML = `Adverbs`;
        shortPhrasesLink.innerHTML = `Short Phrases`;
        pronounsLink.innerHTML = `Pronouns`;
        articlesLink.innerHTML = `Articles`;
        prepositionsLink.innerHTML = `Prepositions`;
        conjunctionsLink.innerHTML = `Conjunctions`;
    } else {
        nounsLink.innerHTML = `Nā Papani`;
        verbsLink.innerHTML = `Nā Hehele / Nā Hamani`;
        adjectivesLink.innerHTML = `Nā ʻAʻano`;
        adverbsLink.innerHTML = `Nā ʻŌlelo ʻĒ Aʻe`;
        shortPhrasesLink.innerHTML = `Nā ʻŌlelo Pōkole`;
        pronounsLink.innerHTML = `Nā Kaʻi`;
        articlesLink.innerHTML = `Nā Pilimua`;
        prepositionsLink.innerHTML = `Nā ʻAmi`;
        conjunctionsLink.innerHTML = `Nā Huipū`;
    }
}

switchLinkLanguages();