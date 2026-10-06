/* Visual-upgrades demo behaviour. Plain script, no deps. Everything is optional polish:
   if this file fails the site still works. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const safe = (fn) => { try { fn(); } catch (e) { /* demo polish only */ } };

  // 14. night theme (saved per browser)
  safe(() => { if (localStorage.getItem("demo-theme") === "night" || /[?&]theme=night/.test(location.search)) root.dataset.theme = "night"; });

  document.addEventListener("DOMContentLoaded", () => {
    // pages without a hero get the soft wash under the header
    if (!document.querySelector(".page-hero, .hero")) document.body.classList.add("has-wash");

    // circles throughout: a page-wide layer of drifting blobs behind the content (home and login have their own)
    if (!document.querySelector(".hero, .auth-blobs") && document.body.querySelector("main")) {
      const deco = document.createElement("div");
      deco.className = "page-deco"; deco.setAttribute("aria-hidden", "true");
      deco.innerHTML = ["sea","sun","leaf","sea","sun","leaf","sea"].map((k, i) => `<span class="blob blob-${k} pd${i + 1}"></span>`).join("");
      document.body.prepend(deco);
    }

    // 6. header settles on scroll
    const onScroll = () => root.classList.toggle("scrolled", scrollY > 24);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();

    // 14. theme toggle
    const btn = document.createElement("button");
    btn.className = "theme-toggle"; btn.type = "button";
    btn.innerHTML = `<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>`;
    const sync = () => { const n = root.dataset.theme === "night"; btn.setAttribute("aria-pressed", n); btn.setAttribute("aria-label", n ? "Switch to day theme" : "Switch to night theme"); };
    btn.addEventListener("click", () => {
      if (root.dataset.theme === "night") delete root.dataset.theme; else root.dataset.theme = "night";
      safe(() => localStorage.setItem("demo-theme", root.dataset.theme || "day")); sync();
    });
    sync(); document.body.appendChild(btn);

    // 3. gradient stroke for progress rings
    const rings = document.querySelectorAll(".ring svg");
    if (rings.length) {
      const NS = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(NS, "svg");
      defs.setAttribute("width", "0"); defs.setAttribute("height", "0"); defs.setAttribute("aria-hidden", "true"); defs.style.position = "absolute";
      defs.innerHTML = `<defs><linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaa974"/><stop offset="1" stop-color="#a5481f"/></linearGradient></defs>`;
      document.body.prepend(defs);
    }

    // 4. home stat strip (real numbers from the site copy)
    const features = document.querySelector(".features");
    if (features && !document.querySelector(".stat-strip")) {
      const strip = document.createElement("div");
      strip.className = "stat-strip";
      strip.innerHTML = `<div class="stat"><strong data-count="4000" data-suffix="+">4,000+</strong><span>Words &amp; phrases</span></div><div class="stat"><strong data-count="9">9</strong><span>Word types</span></div><div class="stat"><strong data-count="3">3</strong><span>Ways to practice</span></div>`;
      features.prepend(strip);
    }

    // 4. count-up when a number scrolls into view (only plain numbers)
    const nums = () => [...document.querySelectorAll("[data-count], .stat strong, #streak-display strong")].filter((el) => !el.dataset.counted);
    const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target); countUp(en.target);
      });
    }, { threshold: .6 }) : null;
    function countUp(el) {
      el.dataset.counted = "1";
      const target = el.dataset.count ? +el.dataset.count : parseInt(el.textContent.replace(/,/g, ""), 10);
      if (reduce || !Number.isFinite(target) || target < 2 || /[^\d,+]/.test(el.textContent.trim())) return;
      const suffix = el.dataset.suffix || ""; const t0 = performance.now(), dur = 900;
      const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(target * e).toLocaleString() + suffix; if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    const watch = () => nums().forEach((el) => (io ? io.observe(el) : null));
    watch(); new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });

    // 7. flashcard tilt + plumeria burst on "Got it"
    const dev = document.querySelector(".device");
    if (dev && !reduce && matchMedia("(hover: hover)").matches) {
      dev.addEventListener("pointermove", (e) => {
        const r = dev.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        dev.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
      });
      dev.addEventListener("pointerleave", () => { dev.style.transform = ""; });
    }
    document.getElementById("yes")?.addEventListener("click", (e) => {
      if (reduce) return;
      const r = e.currentTarget.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const cols = ["#f3c9a4", "#eaa974", "#a5481f", "#8fc2bd", "#fbe6d2"];
      for (let i = 0; i < 14; i++) {
        const d = document.createElement("span"), a = (Math.PI * 2 * i) / 14 + Math.random() * .4, m = 40 + Math.random() * 50;
        d.className = "burst"; d.style.left = cx - 5 + "px"; d.style.top = cy - 5 + "px"; d.style.background = cols[i % cols.length];
        d.style.setProperty("--dx", Math.cos(a) * m + "px"); d.style.setProperty("--dy", Math.sin(a) * m - 20 + "px");
        document.body.appendChild(d); setTimeout(() => d.remove(), 800);
      }
    });
  });
})();
