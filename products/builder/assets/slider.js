/* Auvyx banner slider controls: previous/next and dots for every `.auvyx-slider` scroll-snap track. No dependencies.
   The track keeps native swipe, trackpad and keyboard scrolling; this only adds buttons. */
(function () {
  "use strict";
  // Loaded once per page; a second copy (an editor drawing a part again) runs the first one's setup instead, so page-wide listeners
  // and the shared dialog are never added twice. `auvyxIslands.slider()` sets up what is new and skips what it set up already.
  if (window.auvyxIslands && window.auvyxIslands.slider) { window.auvyxIslands.slider(); return; }
  var ICON_LEFT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  var ICON_RIGHT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  var smooth = !window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // One page-wide resize listener for every slider (a slider no longer on the page is let go of).
  var resizers = [];
  window.addEventListener("resize", function () {
    resizers = resizers.filter(function (r) { return r.track.isConnected; });
    resizers.forEach(function (r) { r.run(); });
  }, { passive: true });

  function setup(track) {
    if (track.dataset.auvyxSlider) return;
    track.dataset.auvyxSlider = "1";
    var slides = Array.prototype.filter.call(track.children, function (el) { return el.nodeType === 1; });
    if (slides.length < 2) return;

    // The buttons live in a wrapper so they do not scroll with the slides. The server renders it (Slider.php); create
    // it only for markup from elsewhere, since moving the slides repaints them.
    var wrap = track.parentNode;
    if (!wrap.classList || !wrap.classList.contains("auvyx-slider-wrap")) {
      wrap = document.createElement("div");
      wrap.className = "auvyx-slider-wrap";
      track.parentNode.insertBefore(wrap, track);
      wrap.appendChild(track);
    }

    // Options from the slider's classes (Studio: Content → Slider).
    var has = function (c) { return (" " + track.className + " ").indexOf(" " + c + " ") >= 0; };
    var fade = has("auvyx-fade") && !has("auvyx-slider-focus"), loop = !has("auvyx-no-loop"), current = 0;
    if (fade) track.classList.add("auvyx-slider--fade");
    // Navigation look (arrow and dot styles, colour, inside/outside) is CSS on the wrapper.
    ["auvyx-arrows-simple", "auvyx-dots-dashes", "auvyx-dots-thumbs", "auvyx-nav-dark", "auvyx-nav-outside"].forEach(function (c) {
      if (has(c)) wrap.classList.add(c);
    });
    var focus = has("auvyx-slider-focus");
    // Scroll position that shows a slide: its start, or centred in Focus.
    function pos(s) { return s.offsetLeft - track.offsetLeft - (focus ? (track.clientWidth - s.offsetWidth) / 2 : 0); }
    function atEnd() { return track.scrollLeft >= track.scrollWidth - track.clientWidth - 2; }
    function index() {
      if (fade) return current;
      var left = track.scrollLeft, best = 0, gap = Infinity;
      slides.forEach(function (s, i) {
        var d = Math.abs(pos(s) - left);
        if (d < gap) { gap = d; best = i; }
      });
      return best;
    }
    function go(i) {
      if (!loop && (i < 0 || i >= slides.length)) return;
      var n = (i + slides.length) % slides.length;
      // The text comes in as the slide lands, not while it is still mostly off screen.
      wrap.style.setProperty("--auvyx-enter-delay", fade ? "0.2s" : "0.3s");
      if (fade) {
        current = n;
        mark();
        return;
      }
      activate(n);
      glide(pos(slides[n]));
    }
    // Moves by arrows, dots and autoplay glide with an ease-in-out curve (the browser's smooth scroll starts with a
    // jerk). Snapping is off during the glide, and a touch, wheel or drag hands control straight back to the user.
    var gliding = 0;
    function stopGlide() {
      if (!gliding) return;
      cancelAnimationFrame(gliding);
      gliding = 0;
      track.style.removeProperty("scroll-snap-type");
    }
    function glide(to) {
      stopGlide();
      var from = track.scrollLeft, d = to - from;
      if (!smooth || Math.abs(d) < 1) { track.scrollLeft = to; return; }
      var dur = Math.min(900, 450 + Math.abs(d) * 0.25), start = 0;
      track.style.scrollSnapType = "none";
      gliding = requestAnimationFrame(function tick(now) {
        if (!start) start = now;
        var t = Math.min(1, (now - start) / dur);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        track.scrollLeft = from + d * e;
        if (t < 1) gliding = requestAnimationFrame(tick);
        else { stopGlide(); settled(); }
      });
    }
    ["pointerdown", "wheel", "touchstart"].forEach(function (ev) { track.addEventListener(ev, stopGlide, { passive: true }); });
    // Next from the end of a strip showing several slides goes back to the first (or stops without loop).
    function step(d) {
      if (d > 0 && !fade && atEnd()) return go(slides.length); // wraps to the first with loop, else nothing
      go(index() + d);
    }
    function button(cls, label, text, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.setAttribute("aria-label", label);
      b.innerHTML = text; // static icon markup below, never user content
      b.addEventListener("click", onClick);
      return b;
    }

    var prev = null, next = null;
    if (!has("auvyx-no-arrows")) {
      prev = wrap.appendChild(button("auvyx-slider-arrow auvyx-slider-prev", "Previous slide", ICON_LEFT, function () { step(-1); }));
      next = wrap.appendChild(button("auvyx-slider-arrow auvyx-slider-next", "Next slide", ICON_RIGHT, function () { step(1); }));
    }
    // The picture of a slide for its thumbnail: its own image, else the last url() of its background (the photo
    // under the overlay gradient).
    function picture(slide) {
      // A video slide: YouTube's still for its background video, or the video file's poster.
      var frame = slide.querySelector(".auvyx-bg-video iframe"), clip = slide.querySelector(".auvyx-bg-video video");
      var tube = frame && /youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,20})/.exec(frame.src);
      if (tube) return "https://i.ytimg.com/vi/" + tube[1] + "/hqdefault.jpg";
      if (clip && clip.poster) return clip.poster;
      var img = slide.querySelector("img");
      if (img && img.currentSrc) return img.currentSrc;
      var urls = (getComputedStyle(slide).backgroundImage || "").match(/url\(("|')?(.*?)\1\)/g);
      return urls ? urls[urls.length - 1].replace(/^url\(("|')?|("|')?\)$/g, "") : "";
    }
    var marks = [];
    if (!has("auvyx-no-dots")) {
      var thumbs = has("auvyx-dots-thumbs");
      var dots = document.createElement("div");
      dots.className = thumbs ? "auvyx-slider-thumbs" : "auvyx-slider-dots";
      marks = slides.map(function (slide, i) {
        var b = dots.appendChild(button(thumbs ? "auvyx-slider-thumb" : "auvyx-slider-dot", "Go to slide " + (i + 1), "", function () { go(i); }));
        var src = thumbs && picture(slide);
        if (src) b.style.backgroundImage = "url(" + JSON.stringify(src) + ")";
        else if (thumbs) b.textContent = String(i + 1);
        return b;
      });
      wrap.appendChild(dots);
    }

    // The active slide gets `is-active`: Focus dims the others and the entrance animation (auvyx-enter-*) replays on it.
    // The active slide gets `is-active` (Focus dims the others; the entrance animation auvyx-enter-* plays on it). It
    // changes when a move starts (arrows, dots, autoplay) or when a swipe has settled, never halfway through a scroll:
    // the incoming text starts hidden while it is still off screen. The outgoing slide keeps its text (`is-leaving`)
    // until it is out of view.
    var frame = 0, shown = -1, idle = 0;
    function rest() { slides.forEach(function (s) { s.classList.remove("is-leaving"); }); }
    function activate(n) {
      if (n === shown) return;
      if (shown >= 0) slides[shown].classList.add("is-leaving");
      shown = n;
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === n); });
      if (fade) { clearTimeout(idle); idle = setTimeout(rest, 700); }
    }
    function settled() {
      if (gliding) return;
      if (index() !== shown) wrap.style.setProperty("--auvyx-enter-delay", "0s"); // a swipe: the slide is already in place
      activate(index());
      rest();
    }
    function mark() {
      frame = 0;
      var current = index();
      marks.forEach(function (m, i) {
        if (i === current) m.setAttribute("aria-current", "true");
        else m.removeAttribute("aria-current");
      });
      if (fade) activate(current);
      // Several slides in view: no single active slide to animate (auvyx-slider-multi turns the entrance off).
      wrap.classList.toggle("auvyx-slider-multi", !fade && !focus && slides[0].offsetWidth < track.clientWidth * 0.75);
      // Everything already in view (several per view): no arrows or dots.
      wrap.classList.toggle("auvyx-slider-static", !fade && track.scrollWidth <= track.clientWidth + 2);
      if (!loop && prev) {
        prev.disabled = current === 0;
        next.disabled = current === slides.length - 1 || (!fade && atEnd());
      }
    }
    track.addEventListener("scroll", function () {
      if (!frame) frame = requestAnimationFrame(mark);
      if (!fade) { clearTimeout(idle); idle = setTimeout(settled, 150); } // scrollend, where it is missing
    }, { passive: true });
    track.addEventListener("scrollend", function () { if (!fade) { clearTimeout(idle); settled(); } });
    // A track narrower than its wrapper (a Section width on the slider): the gaps on each side, for the arrows and dots (blocks.css).
    function edges() {
      var w = wrap.getBoundingClientRect(), t = track.getBoundingClientRect();
      var l = Math.max(0, Math.round(t.left - w.left)) + "px", r = Math.max(0, Math.round(w.right - t.right)) + "px";
      if (wrap.style.getPropertyValue("--auvyx-track-l") !== l) wrap.style.setProperty("--auvyx-track-l", l);
      if (wrap.style.getPropertyValue("--auvyx-track-r") !== r) wrap.style.setProperty("--auvyx-track-r", r);
    }
    edges();
    if (window.ResizeObserver) {
      var sized = new ResizeObserver(function () { edges(); });
      sized.observe(track);
      sized.observe(wrap);
    }
    resizers.push({ track: track, run: function () { edges(); if (!frame) frame = requestAnimationFrame(mark); } });
    wrap.classList.add("auvyx-slider-ready");
    // Focus starts on the second slide, so a neighbour peeks in on both sides.
    if (focus && !fade && slides.length >= 3 && track.scrollLeft < 1) track.scrollLeft = pos(slides[1]);
    activate(index());
    mark();

    // Autoplay from a `auvyx-autoplay-<seconds>` class: never with reduced motion; paused on hover, focus and hidden tabs.
    var auto = /(?:^|\s)auvyx-autoplay-(\d{1,2})(?:\s|$)/.exec(track.className);
    if (auto && smooth && !document.documentElement.hasAttribute("data-auvyx-editing")) {
      var held = false;
      var hold = function (on) { return function () { held = on; }; };
      wrap.addEventListener("mouseenter", hold(true));
      wrap.addEventListener("mouseleave", hold(false));
      wrap.addEventListener("focusin", hold(true));
      wrap.addEventListener("focusout", hold(false));
      setInterval(function () {
        if (held || document.hidden) return;
        var i = index() + 1;
        go(i >= slides.length || (!fade && atEnd()) ? 0 : i); // without loop the arrows stop at the end; autoplay rewinds
      }, Math.max(2, +auto[1]) * 1000);
    }
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll(".auvyx-slider"), setup); }
  (window.auvyxIslands = window.auvyxIslands || {}).slider = init;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
