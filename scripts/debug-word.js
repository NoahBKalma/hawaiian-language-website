// Temporary iOS diagnostics for the writing page. Loaded only with ?debug in the URL (see writing-practice.js).
// Shows what the page thinks the prompt is, and has buttons that switch off one suspect style at a time,
// so a blank word on a real iPhone can be bisected without a Mac. Delete this file when the bug is fixed.

const word = document.getElementById(`word`);
const container = document.getElementById(`word-container`);
const errors = [];
window.addEventListener(`error`, (e) => errors.push(`${e.message}`));
window.addEventListener(`unhandledrejection`, (e) => errors.push(`promise: ${e.reason}`));

const panel = document.createElement(`div`);
panel.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#fff;color:#000;
    font:12px/1.3 monospace;padding:8px;max-height:26vh;overflow:auto;border-top:3px solid #c00;`;
const info = document.createElement(`pre`);
info.style.cssText = `margin:0 0 6px;white-space:pre-wrap;`;
panel.append(info);

const tweaks = {
    "no text-shadow": () => { word.style.textShadow = `none`; },
    "no flex": () => { word.style.display = `block`; },
    "no backface": () => { word.style.backfaceVisibility = `visible`; container.style.backfaceVisibility = `visible`; },
    "no balance": () => { word.style.textWrap = `wrap`; },
    "system font": () => { word.style.fontFamily = `-apple-system, Helvetica, sans-serif`; },
    "plain colour": () => { word.style.color = `#fff`; word.style.opacity = `1`; },
    "no plank bg": () => { container.style.background = `#3a2418`; },
    "re-set text": () => { const t = word.textContent; word.textContent = ``; word.textContent = t; },
    "red outline": () => { word.style.outline = `3px solid red`; }
};
for (const [label, fn] of Object.entries(tweaks)) {
    const button = document.createElement(`button`);
    button.type = `button`;
    button.textContent = label;
    button.style.cssText = `margin:2px;padding:6px 8px;font:12px monospace;`;
    button.addEventListener(`click`, () => { fn(); refresh(); });
    panel.append(button);
}
document.body.append(panel);

function refresh() {
    const s = getComputedStyle(word);
    const r = word.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    info.textContent = [
        `text: "${word.textContent}"`,
        `word rect: ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        `plank rect: ${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.width)}x${Math.round(c.height)}`,
        `color ${s.color} opacity ${s.opacity} vis ${s.visibility} display ${s.display}`,
        `font ${s.fontFamily.slice(0, 40)} ${s.fontSize}`,
        `font loaded: ${document.fonts ? [...document.fonts].filter(f => f.status === `loaded`).length : `n/a`}`,
        `UA: ${navigator.userAgent.slice(0, 90)}`,
        `errors: ${errors.join(` | `) || `none`}`
    ].join(`\n`);
}
refresh();
setInterval(refresh, 1000);
