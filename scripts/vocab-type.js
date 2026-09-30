// Vocab > type page: shows every set of one part of speech (`?type=nouns`).
import { POS_LABELS } from "/scripts/vocab-shared.js";

const main = document.getElementById(`type-main`);
const type = new URLSearchParams(window.location.search).get(`type`);

if (!Object.hasOwn(POS_LABELS, type)) {
    main.insertAdjacentHTML(`beforeend`, `<p class="vocab-message">Unknown word type. <a href="/pages/vocab/word-bank.html?mode=type">Browse all word types</a>.</p>`);
} else {
    document.title = `Vocab - ${POS_LABELS[type].en}`;
    // Type must be set before the element is connected; connectedCallback reads it
    const display = document.createElement(`word-bank-display`);
    display.textContent = type;
    main.appendChild(display);
}
