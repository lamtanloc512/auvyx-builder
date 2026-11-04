/* Auvyx scroll entrances: elements with a auvyx-animate-<name> class play their entrance once when they come into view.
   No dependencies. Without IntersectionObserver or with reduced motion, everything just shows. */
(function () {
  "use strict";
  // Loaded once per page; a second copy (an editor drawing a part again) runs the first one's setup instead (`auvyxIslands.animate()`).
  if (window.auvyxIslands && window.auvyxIslands.animate) { window.auvyxIslands.animate(); return; }
  window.auvyxAnimate = 1;
  var root = document.documentElement;
  var seen = null;
  function init() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[class*="auvyx-animate-"]'));
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      root.classList.remove("auvyx-anim");
      return;
    }
    // Not marked from the head (a classic theme): what is already on screen stays as it is.
    if (!root.classList.contains("auvyx-anim")) {
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          el.style.animation = "none";
          el.classList.add("is-in");
        }
      });
      root.classList.add("auvyx-anim");
    }
    if (!seen) seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          seen.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { if (!el.classList.contains("is-in")) seen.observe(el); });
  }
  (window.auvyxIslands = window.auvyxIslands || {}).animate = init;
  init();
})();
