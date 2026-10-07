// Small signed-out note at the top of <main>: unit progress is only kept in this browser until the visitor signs in.
import { getToken } from "/scripts/auth.js";

const CSS = `
.progress-notice { margin: 0 auto; padding: .5rem 1rem; max-width: 60rem; text-align: center; font: 500 .9rem/1.4 var(--font-body); color: var(--koa-soft); background: var(--sand-soft); border-bottom: 1px solid var(--sand-deep); }
.progress-notice a { color: var(--sea-ink); font-weight: 600; text-decoration: underline; display: inline-block; padding: .65rem .25rem; }
.progress-notice a:hover { color: var(--ocean-deep); }
`;

export function mountProgressNotice() {
    let signedIn = false;
    try { signedIn = !!getToken(); } catch { /* blocked storage: treat as signed out */ }
    if (signedIn || document.querySelector(".progress-notice")) return;
    const add = () => {
        const main = document.querySelector("main");
        if (!main || document.querySelector(".progress-notice")) return;
        const style = document.createElement("style");
        style.textContent = CSS;
        const note = document.createElement("p");
        note.className = "progress-notice";
        note.setAttribute("role", "status");
        note.append("Sign in to save your progress to your account. ");
        const link = document.createElement("a");
        link.href = "/pages/login.html";
        link.textContent = "Sign in";
        note.append(link);
        main.prepend(style, note);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add, { once: true });
    else add();
}
