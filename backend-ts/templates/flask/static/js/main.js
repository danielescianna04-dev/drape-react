/* ── Mobile menu toggle ───────────────────────────────── */
(function () {
    const btn = document.getElementById("mobile-menu-btn");
    const menu = document.getElementById("mobile-menu");
    const icon = document.getElementById("menu-icon");

    if (btn && menu) {
        btn.addEventListener("click", function () {
            const open = !menu.classList.contains("hidden");
            menu.classList.toggle("hidden");
            icon.setAttribute(
                "d",
                open
                    ? "M4 6h16M4 12h16M4 18h16"
                    : "M6 18L18 6M6 6l12 12"
            );
        });
    }
})();

/* ── Scroll reveal (IntersectionObserver) ─────────────── */
(function () {
    var els = document.querySelectorAll(".scroll-animate");
    if (!els.length) return;

    var observer = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add("is-visible");
                    observer.unobserve(e.target);
                }
            });
        },
        { threshold: 0.12 }
    );

    els.forEach(function (el) {
        observer.observe(el);
    });
})();
