// Vocab > type page: shows every set of one part of speech (`?type=nouns`).
import { POS_LABELS } from "/scripts/vocab-shared.js";
import { t, getLang, applyI18n, onLangChange } from "/scripts/i18n.js";

const main = document.getElementById(`type-main`);
const type = new URLSearchParams(window.location.search).get(`type`);

if (!Object.hasOwn(POS_LABELS, type)) {
    document.title = t(`type.docTitle.unknown`);
    onLangChange(() => { document.title = t(`type.docTitle.unknown`); });
    main.insertAdjacentHTML(`beforeend`, `<p class="vocab-message" data-i18n-html="type.unknown-html">${t(`type.unknown-html`)}</p>`);
    applyI18n(main);
} else {
    const setTitle = () => { document.title = t(`type.docTitle`, { name: POS_LABELS[type][getLang()] }); };
    setTitle();
    onLangChange(setTitle);
    // Type must be set before the element is connected; connectedCallback reads it
    const display = document.createElement(`word-bank-display`);
    display.textContent = type;
    main.appendChild(display);
}
