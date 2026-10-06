// Quiet "server unreachable" notice for the study pages. Study itself needs no server (word data is static),
// so this only tells logged-in people that progress isn't being saved. Dismissing it hides it until the
// connection works again and fails again.

let notice = null;
let dismissed = false;

function ensureNotice() {
    if (notice) return notice;
    const anchor = document.querySelector(`.save-progress-note`);
    if (!anchor) return null;

    notice = document.createElement(`p`);
    notice.className = `api-notice`;
    notice.setAttribute(`role`, `status`);
    notice.hidden = true;

    const text = document.createElement(`span`);
    text.textContent = `Can't reach the server, so your progress isn't saving right now. You can keep studying.`;

    const close = document.createElement(`button`);
    close.type = `button`;
    close.className = `note-close`;
    close.setAttribute(`aria-label`, `Dismiss this message`);
    close.textContent = `×`;
    close.addEventListener(`click`, () => { dismissed = true; notice.hidden = true; });

    notice.append(text, close);
    anchor.after(notice);
    return notice;
}

export function markApiDown() {
    if (dismissed) return;
    const node = ensureNotice();
    if (node) node.hidden = false;
}

export function markApiUp() {
    dismissed = false;
    if (notice) notice.hidden = true;
}
