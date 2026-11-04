/* Auvyx tabs: each `.auvyx-tabs` child panel's first heading becomes a tab (WAI-ARIA tabs pattern, arrow keys and Home/End).
   Without this script the panels simply stack with their headings. No dependencies. */
(function () {
  "use strict";
  // Loaded once per page; a second copy (an editor drawing a part again) runs the first one's setup instead, so page-wide listeners
  // and the shared dialog are never added twice. `auvyxIslands.tabs()` sets up what is new and skips what it set up already.
  if (window.auvyxIslands && window.auvyxIslands.tabs) { window.auvyxIslands.tabs(); return; }
  var count = 0;

  function setup(root) {
    if (root.dataset.auvyxTabs) return;
    root.dataset.auvyxTabs = "1";
    var panels = Array.prototype.filter.call(root.children, function (c) { return c.nodeType === 1; });
    if (panels.length < 2) return;
    var list = document.createElement("div");
    list.className = "auvyx-tabs__list";
    list.setAttribute("role", "tablist");
    var id = "auvyx-tabs-" + ++count;
    var tabs = panels.map(function (panel, i) {
      var heading = panel.querySelector("h1,h2,h3,h4,h5,h6");
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "auvyx-tabs__tab";
      tab.id = id + "-tab-" + i;
      tab.setAttribute("role", "tab");
      tab.textContent = heading ? heading.textContent : "Tab " + (i + 1);
      if (heading) heading.classList.add("auvyx-tabs__heading");
      panel.id = panel.id || id + "-panel-" + i;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      tab.setAttribute("aria-controls", panel.id);
      tab.addEventListener("click", function () { select(i, true); });
      return list.appendChild(tab);
    });
    function select(n, focus) {
      tabs.forEach(function (t, i) {
        var on = i === n;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (focus) tabs[n].focus();
    }
    list.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select((next + tabs.length) % tabs.length, true);
    });
    root.insertBefore(list, root.firstChild);
    root.classList.add("auvyx-tabs--ready");
    select(0, false);
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll(".auvyx-tabs"), setup); }
  (window.auvyxIslands = window.auvyxIslands || {}).tabs = init;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
