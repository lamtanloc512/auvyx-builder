/* Auvyx load more / infinite scroll (Modules/LoopMore). The page prints its page numbers; this hides them and appends
   the next page's items, fetched as plain HTML (cacheable pages, no endpoint). On any failure it goes to that page.
   No dependencies. */
(function () {
  "use strict";

  function nextLink(nav) {
    return nav ? nav.querySelector("a.next, a[rel='next'], a.wp-block-query-pagination-next") : null;
  }
  function navOf(el) {
    var sel = el.getAttribute("data-auvyx-more-nav");
    if (sel) return el.querySelector(sel);
    var sib = el.nextElementSibling;
    return sib && sib.classList.contains("auvyx-loop__pages") ? sib : null;
  }
  function listOf(el) {
    var sel = el.getAttribute("data-auvyx-more-list");
    return sel ? el.querySelector(sel) : el;
  }
  function find(doc, key) {
    var all = doc.querySelectorAll("[data-auvyx-more-key]");
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute("data-auvyx-more-key") === key) return all[i];
    return null;
  }

  function setup(el) {
    if (el.getAttribute("data-auvyx-more-ready")) return;
    var nav = navOf(el);
    var next = nextLink(nav);
    var list = listOf(el);
    if (!next || !list) return;
    el.setAttribute("data-auvyx-more-ready", "1");
    var mode = el.getAttribute("data-auvyx-more");
    var box = document.createElement("div");
    box.className = "auvyx-more auvyx-more--" + mode;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "auvyx-more__button";
    button.textContent = el.getAttribute("data-auvyx-more-label") || "Load more";
    var status = document.createElement("p");
    status.className = "auvyx-more__status";
    status.setAttribute("role", "status");
    box.appendChild(button);
    box.appendChild(status);
    nav.hidden = true;
    nav.parentNode.insertBefore(box, nav.nextSibling);
    var busy = false;
    var observer = null;

    function done() {
      if (observer) observer.disconnect();
      box.removeChild(button);
    }

    function load() {
      if (busy || !next) return;
      busy = true;
      button.disabled = true;
      box.classList.add("is-loading");
      list.setAttribute("aria-busy", "true");
      status.textContent = el.getAttribute("data-auvyx-more-loading") || "Loading…";
      var url = next.href;
      fetch(url, { credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, "text/html");
          var other = find(doc, el.getAttribute("data-auvyx-more-key"));
          var items = other ? listOf(other) : null;
          if (!items) throw new Error("list");
          var added = [];
          Array.prototype.slice.call(items.children).forEach(function (child) {
            var node = document.importNode(child, true);
            list.appendChild(node);
            added.push(node);
          });
          var fresh = navOf(other);
          next = nextLink(fresh);
          if (fresh) nav.innerHTML = fresh.innerHTML;
          status.textContent = (el.getAttribute("data-auvyx-more-done") || "%d").replace("%d", String(added.length));
          if (!next) {
            var hadFocus = document.activeElement === button;
            done();
            var link = added[0] && added[0].querySelector("a[href]");
            if (hadFocus && link) link.focus();
          }
          document.dispatchEvent(new CustomEvent("auvyx:more", { detail: { list: list, items: added } }));
        })
        .catch(function () {
          window.location.assign(url);
        })
        .then(function () {
          busy = false;
          button.disabled = false;
          box.classList.remove("is-loading");
          list.removeAttribute("aria-busy");
        });
    }

    button.addEventListener("click", load);
    if (mode === "scroll" && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(function (entries) {
        if (entries[0] && entries[0].isIntersecting) load();
      }, { rootMargin: "600px 0px" });
      observer.observe(box);
    }
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-auvyx-more]"), setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // Lists replaced in place (filters applied without a reload) start again.
  document.addEventListener("auvyx-woo:navigated", init);
})();
