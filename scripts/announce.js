// One shared polite live region so screen-reader users hear card changes, grades and answers.
// Announcements stay silent until the person has interacted, so loading a page never starts talking.

let region = null;
let enabled = false;

function getRegion() {
    if (region && region.isConnected) return region;
    region = document.createElement(`div`);
    region.id = `sr-announcer`;
    region.className = `visually-hidden`;
    region.setAttribute(`role`, `status`);
    region.setAttribute(`aria-live`, `polite`);
    region.setAttribute(`aria-atomic`, `true`);
    document.body.appendChild(region);
    return region;
}

for (const type of [`keydown`, `pointerdown`]) {
    window.addEventListener(type, () => { enabled = true; }, { once: true, capture: true });
}

export function announce(message) {
    if (!enabled || !message) return;
    const node = getRegion();
    node.textContent = ``;
    // clear first so a repeated message is read again
    setTimeout(() => { node.textContent = message; }, 30);
}
