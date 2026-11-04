/* Auvyx header options: the template part (or EzyPlatform fragment) holding a sticky or overlay header gets `is-stuck` once the page has
   scrolled (shadow, shrink, solid background over the hero). No dependencies. */
(function () {
  "use strict";
  // Loaded once per page; a second copy (an editor drawing a part again) runs the first one's setup instead (`auvyxIslands.header()`).
  if (window.auvyxIslands && window.auvyxIslands.header) { window.auvyxIslands.header(); return; }
  function init() {
    var header = document.querySelector(".auvyx-header-sticky, .auvyx-header-overlay");
    var part = header && header.closest(".wp-block-template-part, .auvyx-fragment");
    if (!part) return;
    if (part.dataset.auvyxSticky) return;
    part.dataset.auvyxSticky = "1";
    var frame = 0;
    function mark() {
      frame = 0;
      part.classList.toggle("is-stuck", window.scrollY > 8);
    }
    function scroll() {
      if (!part.isConnected) { window.removeEventListener("scroll", scroll); return; }
      if (!frame) frame = requestAnimationFrame(mark);
    }
    window.addEventListener("scroll", scroll, { passive: true });
    mark();
  }
  (window.auvyxIslands = window.auvyxIslands || {}).header = init;
  init();
})();
