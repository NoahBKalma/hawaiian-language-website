// Word Bank "By Frequency" view: words grouped by frequency level (5 → 1),
// with toggle chips choosing which levels are shown (kept in `?levels=`).
import { allWordEntries } from "/scripts/compile-words.js";
import { FREQ_LEVELS } from "/scripts/word-utils.js";
import { escapeHtml, typeHref, setUrlParam } from "/scripts/vocab-shared.js";
import { t, getLang, hasKey, applyI18n, onLangChange } from "/scripts/i18n.js";

const LEVELS = [5, 4, 3, 2, 1];
const DEFAULT_LEVELS = [5];

const levelName = level => FREQ_LEVELS[level][getLang()];
const posTag = pos => hasKey(`vocab.posTag.${pos}`) ? t(`vocab.posTag.${pos}`) : pos;

// Words per level, sorted by Hawaiian
const wordsByLevel = new Map(LEVELS.map(level => [level, []]));
for (const entry of allWordEntries) {
    wordsByLevel.get(entry.frequency)?.push(entry);
}
for (const list of wordsByLevel.values()) {
    list.sort((a, b) => a.hawaiian.localeCompare(b.hawaiian, `haw`));
}

function readLevels() {
    const param = new URLSearchParams(window.location.search).get(`levels`);
    if (param === null) return new Set(DEFAULT_LEVELS);
    return new Set(param.split(`,`).map(Number).filter(n => LEVELS.includes(n)));
}

function levelHeading(level) {
    return t(`wordBank.freq.heading`, { n: level, name: levelName(level), count: wordsByLevel.get(level).length });
}

function renderLevel(level) {
    let html = `
        <details class="freq-level collapsible" data-level="${level}" open>
            <summary class="freq-level-title" id="freq-level-${level}"><h2 class="summary-heading">${escapeHtml(levelHeading(level))}</h2></summary>
            <ul class="word-list freq-word-list">`;
    let rowIndex = 0;
    for (const w of wordsByLevel.get(level)) {
        html += `
                <li class="word-row freq-row reveal" style="--i:${Math.min(rowIndex++, 10)}">
                    <span class="word-haw" lang="haw">${escapeHtml(w.hawaiian)}</span>
                    <span class="word-eng">${escapeHtml(w.english)}</span>
                    <span class="pos-tag">${escapeHtml(posTag(w.pos))}</span>
                    <a class="set-link" href="${typeHref(w.pos, w.setId)}">${escapeHtml(getLang() === `haw` && w.setHawaiian ? w.setHawaiian : w.setEnglish)}</a>
                </li>`;
    }
    html += `
            </ul>
        </details>`;
    return html;
}

export function initFrequencyView(container) {
    const selected = readLevels();

    container.innerHTML = `
        <div class="freq-chips" role="group" aria-label="Frequency levels to show" data-i18n-aria-label="wordBank.freq.aria">
            <span class="freq-chips-label" data-i18n="wordBank.freq.label">Levels:</span>
            ${LEVELS.map(level => `
                <button type="button" class="chip freq-chip" data-level="${level}"
                    aria-pressed="${selected.has(level)}">${level}</button>`).join(``)}
        </div>
        <p class="freq-legend" data-i18n="wordBank.freq.legend">5 = most common, 1 = rare.</p>
        <div class="freq-levels"></div>
    `;
    const levelsContainer = container.querySelector(`.freq-levels`);

    function render() {
        const levels = LEVELS.filter(level => selected.has(level));
        levelsContainer.innerHTML = levels.length === 0
            ? `<p class="freq-empty">${escapeHtml(t(`wordBank.freq.empty`))}</p>`
            : levels.map(renderLevel).join(``);
    }

    function titleChips() {
        container.querySelectorAll(`.freq-chip`).forEach(chip => {
            chip.title = t(`wordBank.freq.chipTitle`, { n: chip.dataset.level, name: levelName(Number(chip.dataset.level)) });
        });
    }
    titleChips();
    applyI18n(container);

    container.querySelectorAll(`.freq-chip`).forEach(chip => {
        chip.addEventListener(`click`, () => {
            const level = Number(chip.dataset.level);
            if (selected.has(level)) selected.delete(level);
            else selected.add(level);
            chip.setAttribute(`aria-pressed`, String(selected.has(level)));
            setUrlParam(`levels`, LEVELS.filter(l => selected.has(l)).join(`,`) || `none`);
            render();
        });
    });

    render();
    onLangChange(() => { titleChips(); render(); });
}
