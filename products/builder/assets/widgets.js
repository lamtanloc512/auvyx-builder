/* Auvyx widgets on the published page (shared/Widgets.scala). Each one is plain Auvyx elements with a marker class; this script
   only adds motion. Without it every widget still reads correctly:
   - .auvyx-counter      a number counts up from zero when it scrolls into view (the text keeps its prefix and suffix);
   - .auvyx-progress     a bar fills from zero to its width when it scrolls into view.
   Auvyx Builder Pro's widgets are in its pro-widgets.js. Reduced motion: numbers and bars show their end at once.
   No dependencies. */
(function () {
  "use strict";
  if (window.auvyxIslands && window.auvyxIslands.widgets) { window.auvyxIslands.widgets(); return; }

  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // In Auvyx Studio's canvas the elements are being edited: nothing moves.
  var editing = document.documentElement.hasAttribute("data-auvyx-editing");

  function each(sel, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
      var key = "auvyxW" + sel.replace(/[^a-z]/g, "");
      if (el.dataset[key]) return;
      el.dataset[key] = "1";
      fn(el);
    });
  }

  function whenSeen(el, fn) {
    if (still || !("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { threshold: 0.3 });
    io.observe(el);
  }

  // ---- counter -------------------------------------------------------------------------------------
  function counter(el) {
    var m = /^(\D*?)(\d[\d.,\s]*\d|\d)(\D*)$/.exec(el.textContent.trim());
    if (!m) return;
    var raw = m[2];
    var sep = /\d[.,\s]\d{3}(\D|$)/.test(raw) ? raw.replace(/\d/g, "").charAt(0) : "";
    var decimals = !sep && /[.,]\d+$/.test(raw) ? raw.split(/[.,]/).pop().length : 0;
    var target = parseFloat(sep ? raw.split(sep).join("") : raw.replace(",", "."));
    if (!isFinite(target)) return;
    function show(v) {
      var s = v.toFixed(decimals);
      if (sep) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      el.textContent = m[1] + s + m[3];
    }
    if (still) return;
    show(0);
    whenSeen(el, function () {
      var start = performance.now();
      var ms = 1600;
      (function step(now) {
        var t = Math.min(1, (now - start) / ms);
        show(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step); else el.textContent = m[0];
      })(start);
    });
  }

  // ---- progress ------------------------------------------------------------------------------------
  function progress(el) {
    if (still) return;
    var to = getComputedStyle(el).width;
    el.style.transition = "none";
    el.style.width = "0";
    whenSeen(el, function () {
      void el.offsetWidth;
      el.style.transition = "width 1.2s cubic-bezier(.2,.7,.2,1)";
      el.style.width = to;
      el.addEventListener("transitionend", function () { el.style.removeProperty("width"); el.style.removeProperty("transition"); }, { once: true });
    });
  }

  function init() {
    if (editing) return;
    each(".auvyx-counter", counter);
    each(".auvyx-progress", progress);
  }

  (window.auvyxIslands = window.auvyxIslands || {}).widgets = init;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
