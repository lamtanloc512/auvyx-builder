/* Auvyx gallery lightbox: images in a `.auvyx-gallery` open large in a <dialog> (previous/next, arrow keys, Esc, click
   outside to close). Uses the largest srcset candidate when the image has one. No dependencies. */
(function () {
  "use strict";
  // Loaded once per page; a second copy (an editor drawing a part again) runs the first one's setup instead, so page-wide listeners
  // and the shared dialog are never added twice. `auvyxIslands.gallery()` sets up what is new and skips what it set up already.
  if (window.auvyxIslands && window.auvyxIslands.gallery) { window.auvyxIslands.gallery(); return; }
  var ICON_LEFT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  var ICON_RIGHT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var dialog, view, list = [], at = 0;

  function largest(img) {
    var best = img.currentSrc || img.src, width = 0;
    (img.getAttribute("srcset") || "").split(",").forEach(function (part) {
      var bits = part.trim().split(/\s+/), w = parseInt(bits[1], 10);
      if (bits[0] && w > width) { width = w; best = bits[0]; }
    });
    return best;
  }
  function show(i) {
    at = (i + list.length) % list.length;
    view.src = largest(list[at]);
    view.alt = list[at].alt || "";
  }
  function button(cls, label, text, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.setAttribute("aria-label", label);
    b.innerHTML = text; // static icon markup above, never user content
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
    return b;
  }
  function build() {
    dialog = document.createElement("dialog");
    dialog.className = "auvyx-lightbox";
    dialog.setAttribute("aria-label", "Image");
    view = document.createElement("img");
    dialog.appendChild(view);
    dialog.appendChild(button("auvyx-lightbox__prev", "Previous image", ICON_LEFT, function () { show(at - 1); }));
    dialog.appendChild(button("auvyx-lightbox__next", "Next image", ICON_RIGHT, function () { show(at + 1); }));
    dialog.appendChild(button("auvyx-lightbox__close", "Close", ICON_X, function () { dialog.close(); }));
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(at - 1);
      if (e.key === "ArrowRight") show(at + 1);
    });
    document.body.appendChild(dialog);
  }
  function setup(gallery) {
    if (gallery.dataset.auvyxGallery) return;
    gallery.dataset.auvyxGallery = "1";
    var images = Array.prototype.slice.call(gallery.querySelectorAll("img"));
    images.forEach(function (img, i) {
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", "Open image" + (img.alt ? ": " + img.alt : ""));
      img.style.cursor = "zoom-in";
      function open() {
        if (!dialog) build();
        list = images;
        show(i);
        dialog.showModal();
      }
      img.addEventListener("click", open);
      img.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll(".auvyx-gallery"), setup); }
  (window.auvyxIslands = window.auvyxIslands || {}).gallery = init;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
