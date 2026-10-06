import { userReady } from "/components/main-header.js";

const KAPA = `<svg class="kapa-band" viewBox="0 0 220 22" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22 11 2l11 20 11-20 11 20 11-20 11 20 11-20 11 20 11-20 11 20 11-20 11 20 11-20 11 20 11-20 11 20 11-20 11 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>`;

const WAVE_PATHS = [
    "M0 70Q150 10 300 70T600 70T900 70T1200 70T1500 70T1800 70T2100 70T2400 70V160H0Z",
    "M0 90Q150 30 300 90T600 90T900 90T1200 90T1500 90T1800 90T2100 90T2400 90V160H0Z",
    "M0 100Q150 50 300 100T600 100T900 100T1200 100T1500 100T1800 100T2100 100T2400 100V160H0Z"
];

class SiteFooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <footer class="site-footer on-dark">
                <div class="wrap">
                    <img class="foot-mark" src="/assets/logo/site-logo-icon-dark.svg" alt="" width="44" height="44">
                    ${KAPA}
                    <nav aria-label="Footer"><ul>
                        <li><a href="/index.html">Home</a></li>
                        <li><a href="/pages/flashcards.html">Flashcards</a></li>
                        <li><a href="/pages/writing-practice.html">Writing</a></li>
                        <li><a href="/pages/quiz.html">Quizzes</a></li>
                        <li><a href="/pages/vocab.html">Vocab</a></li>
                        <li><a id="footer-account-link" href="/pages/login.html">Log in</a></li>
                    </ul></nav>
                    <p class="made">Made with aloha at <span>Middlebury College</span></p>
                </div>
            </footer>
        `;
        this.markActivePage();
        this.fillAccountLink();
        this.appendChild(this.buildPause());
        fillWaves();
        initReveal();
    }

    markActivePage() {
        const path = location.pathname;
        this.querySelectorAll("nav a[href]").forEach(link => {
            const href = new URL(link.href).pathname;
            const isHome = href === "/index.html" && path === "/";
            const isVocab = href === "/pages/vocab.html" && path.startsWith("/pages/vocab");
            if (path === href || isHome || isVocab) link.setAttribute("aria-current", "page");
        });
    }

    // "Log in" by default; "Profile" when signed in; unchanged if the server is down
    async fillAccountLink() {
        const link = this.querySelector("#footer-account-link");
        const { user } = await userReady;
        if (user) {
            link.textContent = "Profile";
            link.href = "/pages/profile.html";
        }
    }

    buildPause() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pause-anim";
        btn.setAttribute("aria-pressed", "false");
        const paint = on => {
            btn.innerHTML = `${on ? ICON_PLAY : ICON_PAUSE}<span>${on ? "Play animations" : "Pause animations"}</span>`;
        };
        paint(false);
        btn.addEventListener("click", () => {
            const on = document.documentElement.classList.toggle("paused");
            btn.setAttribute("aria-pressed", on ? "true" : "false");
            paint(on);
        });
        return btn;
    }
}

// Fills <div class="waves" data-waves> with the three wave layers
function fillWaves() {
    document.querySelectorAll(".waves[data-waves]").forEach(host => {
        if (host.children.length) return;
        host.innerHTML = WAVE_PATHS.map((d, i) =>
            `<svg class="w${i + 1}" viewBox="0 0 2400 160" preserveAspectRatio="none"><path d="${d}"/></svg>`
        ).join("");
    });
}

// Reveals .reveal-scroll sections once as they scroll into view. html.reveal-on is added only when the
// observer exists, so any failure or fallback path leaves the content visible (see site.css).
function initReveal() {
    const items = document.querySelectorAll(".reveal-scroll");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in window) || reduce) {
        items.forEach(el => el.classList.add("is-visible"));
        return;
    }
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    document.documentElement.classList.add("reveal-on");
    items.forEach(el => observer.observe(el));
}

customElements.define("site-footer", SiteFooter);
