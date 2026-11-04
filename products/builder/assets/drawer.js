/* Auvyx menu drawers (NavDrawer): what <details> alone cannot do. Closes the drawer on the backdrop, Escape, a link, and
   when the screen grows past the menu button; keeps the page still behind it; lets go of an ancestor that would keep it
   inside its box; folds submenus behind a button (auvyx-drawer-fold); opens a department menu (NavDept) on the home page. Loaded only on pages
   with a drawer or a department menu. */
(function () {
  "use strict";
  // Loaded once per page; a second copy (an editor drawing a part again) runs the first one's setup instead, so page-wide listeners
  // and the shared dialog are never added twice. `auvyxIslands.drawer()` sets up what is new and skips what it set up already.
  if (window.auvyxIslands && window.auvyxIslands.drawer) { window.auvyxIslands.drawer(); return; }
  var hosts = [];
  // Every drawer menu on the page, for the two page-wide listeners below (one each, however many menus; a menu no longer on the page
  // is let go of).
  var menus = [];
  function live() { menus = menus.filter(function (m) { return m.menu.isConnected; }); return menus; }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    live().forEach(function (m) {
      if (m.menu.open && !m.menu.hasAttribute("data-auvyx-pinned")) {
        close(m.menu);
        if (m.toggle) m.toggle.focus();
      }
    });
  });
  window.addEventListener("resize", function () {
    live().forEach(function (m) { if (m.menu.open && getComputedStyle(m.menu).display === "none") close(m.menu); });
  });

  function release() {
    document.documentElement.classList.remove("auvyx-drawer-lock");
    hosts.forEach(function (el) { el.classList.remove("auvyx-drawer-host", "auvyx-drawer-lift"); });
    hosts = [];
  }

  function hold(menu) {
    for (var el = menu.parentElement; el && el !== document.body; el = el.parentElement) {
      var cs = getComputedStyle(el);
      var parent = el.parentElement ? getComputedStyle(el.parentElement).display : "";
      // A blurred, filtered or transformed ancestor is the box a fixed drawer is placed in: free it while open.
      if ((cs.backdropFilter && cs.backdropFilter !== "none") || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none") ||
          cs.transform !== "none" || cs.filter !== "none" || /paint|layout|strict|content/.test(cs.contain || "")) {
        el.classList.add("auvyx-drawer-host");
        hosts.push(el);
      }
      // An ancestor that is its own layer (sticky, positioned, a flex or grid item) would let later parts of the page
      // (the footer) paint over the drawer: lift it above them while open.
      if (cs.position !== "static" || /flex|grid/.test(parent)) {
        el.classList.add("auvyx-drawer-lift");
        hosts.push(el);
      }
    }
    document.documentElement.classList.add("auvyx-drawer-lock");
  }

  function close(menu) {
    if (menu.open) menu.open = false;
  }

  function setup(nav) {
    var menu = nav.querySelector(":scope > .auvyx-nav__menu");
    if (!menu || menu.dataset.auvyxDrawer) return;
    menu.dataset.auvyxDrawer = "1";
    var panel = menu.querySelector(".auvyx-nav__panel");
    var toggle = menu.querySelector(".auvyx-nav__toggle");

    menu.addEventListener("toggle", function () {
      if (menu.open) {
        hold(menu);
        // The panel takes focus (Tab reaches its links next) without drawing a ring on the first link.
        if (panel) {
          panel.setAttribute("tabindex", "-1");
          panel.focus({ preventScroll: true });
        }
      } else {
        release();
      }
    });
    // The backdrop is the menu's own ::before: a click on the menu itself, outside the panel and the button.
    menu.addEventListener("click", function (e) {
      if (e.target === menu) close(menu);
      if (e.target.closest && e.target.closest(".auvyx-nav__panel a")) close(menu);
    });
    menus.push({ menu: menu, toggle: toggle });

    if (nav.classList.contains("auvyx-drawer-fold") && panel) {
      panel.querySelectorAll(".auvyx-nav__parent").forEach(function (item) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "auvyx-drawer__more";
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", (item.firstElementChild ? item.firstElementChild.textContent : "") + " +");
        button.addEventListener("click", function () {
          var open = item.classList.toggle("is-open");
          button.setAttribute("aria-expanded", open ? "true" : "false");
        });
        item.insertBefore(button, item.children[1] || null);
      });
    }
  }

  // Department menus (NavDept): open on the home page on a wide screen when asked (auvyx-nav-dept-home), and then stay open; otherwise
  // closed by Escape (above, with the drawers) and by a click anywhere else.
  function isHome() {
    return location.pathname === "/" || document.body.classList.contains("home") || document.documentElement.hasAttribute("data-auvyx-home");
  }
  // A pinned panel reaches the bottom of the hero beside it (the home's .auvyx-sf-showcase-main): no empty tail under the list, and rows that
  // spread to fill it. Measured again when the page, a font or the window changes the hero's size.
  function fit(menu) {
    var panel = menu.querySelector(":scope > .auvyx-nav__panel");
    var hero = document.querySelector(".auvyx-sf-showcase-main");
    if (!panel || !hero) return;
    function measure() {
      if (!menu.hasAttribute("data-auvyx-pinned") || !window.matchMedia("(min-width: 1024px)").matches) { panel.style.minHeight = ""; return; }
      panel.style.minHeight = "";
      var h = hero.getBoundingClientRect().bottom - panel.getBoundingClientRect().top;
      if (h > 0) panel.style.minHeight = Math.round(h) + "px";
    }
    measure();
    window.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(hero);
  }
  function dept(nav) {
    if (nav.dataset.auvyxDept) return;
    nav.dataset.auvyxDept = "1";
    var menu = nav.querySelector(":scope > .auvyx-nav__menu");
    if (!menu) return;
    if (nav.classList.contains("auvyx-nav-dept-home") && isHome() && window.matchMedia("(min-width: 1024px)").matches) {
      menu.open = true;
      menu.setAttribute("data-auvyx-pinned", "");
      fit(menu);
    }
    menus.push({ menu: menu, toggle: menu.querySelector(".auvyx-nav__toggle"), dept: true });
  }
  document.addEventListener("click", function (e) {
    live().forEach(function (m) {
      if (m.dept && m.menu.open && !m.menu.hasAttribute("data-auvyx-pinned") && !m.menu.contains(e.target)) m.menu.open = false;
    });
  });

  // A help page's question search (EzyBlocks.FaqSearch): types narrow the page's questions (.auvyx-faq-item, in .auvyx-faq-group sections) to
  // those whose question or answer holds every word; a group with none left hides; a match opens. Without script the list stays whole.
  function faq(form) {
    if (form.dataset.auvyxFaq) return;
    form.dataset.auvyxFaq = "1";
    var input = form.querySelector("[data-auvyx-faq-search]");
    var none = document.querySelector("[data-auvyx-faq-none]");
    var items = [].slice.call(document.querySelectorAll(".auvyx-faq-item"));
    if (!input || !items.length) return;
    function apply() {
      var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      var shown = 0;
      items.forEach(function (item) {
        var text = (item.textContent || "").toLowerCase();
        var hit = words.every(function (w) { return text.indexOf(w) >= 0; });
        item.hidden = !hit;
        if (hit) shown++;
        if (words.length) item.open = hit; else item.open = false;
      });
      document.querySelectorAll(".auvyx-faq-group").forEach(function (g) { g.hidden = !g.querySelector(".auvyx-faq-item:not([hidden])"); });
      if (none) none.hidden = shown > 0;
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });
    input.addEventListener("input", apply);
    var q = new URLSearchParams(location.search).get("q");
    if (q) { input.value = q; apply(); }
  }

  // A topic's questions get the address their card links to (the class auvyx-faq-topic-<id> says which): the page's tree has no ids of its own.
  function topics() {
    var jump = null;
    document.querySelectorAll(".auvyx-faq-group").forEach(function (g) {
      var m = /(?:^|\s)auvyx-faq-topic-([a-z0-9-]+)(?:\s|$)/.exec(g.className);
      if (m && !g.id) g.id = m[1];
      if (m && location.hash === "#" + m[1]) jump = g;
    });
    if (jump) jump.scrollIntoView();
  }

  function run() {
    topics();
    document.querySelectorAll('.wp-block-auvyx-nav[class*="auvyx-drawer-"]').forEach(setup);
    document.querySelectorAll(".wp-block-auvyx-nav.auvyx-nav-dept").forEach(dept);
    document.querySelectorAll(".auvyx-ezy-faq-search").forEach(faq);
  }
  window.auvyxDrawer = { run: run };
  (window.auvyxIslands = window.auvyxIslands || {}).drawer = run;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
