/* Auvyx code elements (docs/ai-full-power.md layer 3, docs/store-slots.md §7). An element's own HTML is on the page already (server-rendered,
   it works without this script); its module runs here, once, in this page's own realm, when the element comes near the screen.

   Two conventions share this loader:

   - A page module (`data-auvyx-slot-code="module"`): the source is a JSON string in `<script type="application/json" data-auvyx-module>`, the page
     context a frozen JSON snapshot in `data-auvyx-ctx`. Both are inert text until this file imports them:

         export default function init(el, ctx) { ...; return () => { ...cleanup... } }   // the cleanup is optional

     `el` is the block's own root on the page, `ctx` the frozen snapshot. Nothing here is a sandbox: the module is the site owner's code and
     it runs with the page's authority; keep your own changes inside `el` and undo them in the cleanup.
   - Legacy code (`data-auvyx-code`; the module as a JSON string in `<script type="application/json" data-auvyx-js-json>`, as WordPress prints
     it, or as text in `<script type="text/auvyx-module" data-auvyx-js>`, as the shared renderer does):

         export default ({ el, lib, data, source, reduced }) => { ...; return () => { ... } }

   Gates, checked before an import is scheduled and again before `init` runs:
     * the site's policy (`data-auvyx-policy` on this script's tag: a small no-store JSON `{enabled, revision}`). It is asked before the first
       import and again when the tab comes back; an answer that says "disabled", or no answer, starts nothing new, and a "disabled" answer
       stops what runs (each cleanup is called). A page without the attribute (WordPress today) has no policy to ask.
     * the Studio's canvas: it never starts code on open. Code starts only after `auvyxCode.setRunning(true)` (the editor's Run custom code),
       and `setRunning(false)` calls every cleanup.
   Every block says where it is in `data-auvyx-code-state` (pending, running, error, stopped, disabled, csp). A module that fails is reported
   (console and a `auvyx-code-error` event) and leaves its server-rendered template as it is. A block that was stopped, removed or replaced while
   its import was in flight is never initialised late: if the module still returns a cleanup, it is called. */
(function () {
  "use strict";
  // One loader per page. The guard is a private symbol, never `window.auvyxCode`: anything that put an object there first (a script that
  // pre-sets it, a leftover from another copy) must not be able to stop this one from running the page's code.
  var LOADED = Symbol.for("auvyx.code.loader.v2");
  if (window[LOADED]) return;
  window[LOADED] = true;
  var script = document.currentScript;
  var me = script && script.src;
  var base = me ? me.replace(/[^/]*$/, "") : "/auvyx/assets/";
  var policyUrl = (script && script.getAttribute("data-auvyx-policy")) || window.auvyxCodePolicyUrl || "";
  // The Studio's canvas frame (the editor sets auvyxCodeCanvas first; the frame address says so too): stopped until the editor presses Run.
  var canvas = !!window.auvyxCodeCanvas || /[?&]auvyx-canvas-frame=/.test(location.search);
  var running = !canvas;
  // name → [address, what of the module the code gets]
  var LIBS = {
    motion: ["lib/motion.js", "*"],
    lenis: ["lib/lenis.js", "default"],
    three: ["lib/three.js", "*"],
    lottie: ["lib/lottie.js", "default"],
    splitting: ["lib/splitting.js", "default"]
  };
  // Libraries the site adds (Auvyx Builder Pro: GSAP from GSAP's own CDN, under GSAP's licence), printed before this script
  // as name → [address, what of the module the code gets]; the shipped ones keep their own.
  var more = window.auvyxCodeLibs;
  if (more && typeof more === "object") {
    Object.keys(more).forEach(function (name) {
      var spec = more[name];
      if (!LIBS[name] && spec && typeof spec[0] === "string" && spec[0].indexOf("https://") === 0 && typeof spec[1] === "string") LIBS[name] = [spec[0], spec[1]];
    });
  }
  var loaded = {};
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function library(name) {
    var spec = LIBS[name];
    if (!spec) return Promise.reject(new Error("Unknown library " + name));
    if (!loaded[name]) {
      var url = /^https?:/.test(spec[0]) ? spec[0] : new URL(spec[0], base).href;
      loaded[name] = import(url).then(function (mod) {
        return spec[1] === "*" ? mod : (mod[spec[1]] || mod.default || mod);
      });
    }
    return loaded[name];
  }

  /** A public data source's items, again: the editor answers itself (`auvyxCodeSource`), a page asks the site. */
  function source(name) {
    if (window.auvyxCodeSource) return window.auvyxCodeSource(String(name));
    return fetch((window.auvyxCodeData || "/auvyx/data/") + encodeURIComponent(String(name)), { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("No public data source " + name); return r.json(); });
  }

  // ---- the site's policy ----------------------------------------------------------------------------------------------------

  var policy = { enabled: policyUrl ? null : true, revision: "", at: 0 };
  var asking = null;
  var FRESH = 15000;

  function answered(enabled, revision) {
    policy.enabled = enabled;
    policy.revision = revision;
    policy.at = Date.now();
    if (!enabled) stopAll("disabled");
    // the editor's Run button follows the site's switch
    try { document.dispatchEvent(new CustomEvent("auvyx-code-policy", { detail: { enabled: enabled, revision: revision } })); } catch { /* nobody listens */ }
  }

  /** Resolves true when new code may start. Without a policy address there is nothing to ask. An unreachable or unreadable answer is "no" for
      anything new (it never stops what already runs: only a "disabled" answer does). */
  function refreshPolicy(force) {
    if (!policyUrl) return Promise.resolve(true);
    if (!force && policy.enabled === true && Date.now() - policy.at < FRESH) return Promise.resolve(true);
    if (asking) return asking;
    asking = fetch(policyUrl, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("policy " + r.status); return r.json(); })
      .then(function (j) { answered(!!j && j.enabled === true, String(j && j.revision || "")); return policy.enabled === true; })
      .catch(function () { if (policy.enabled !== true) policy.enabled = false; policy.at = 0; return false; })
      .then(function (ok) { asking = null; return ok; });
    return asking;
  }

  function allowedNow() { return running && policy.enabled === true; }

  // ---- reporting and per-block state -----------------------------------------------------------------------------------------

  var byUrl = {};
  var importing = [];
  window.addEventListener("error", function (e) {
    var el = e && e.filename && byUrl[e.filename];
    if (el) report(el, e.error || e.message);
  });
  // A page whose Content-Security-Policy does not allow blob: modules says so here: the template stays, and the block says why.
  document.addEventListener("securitypolicyviolation", function (e) {
    if (!e || !/^blob:?/.test(String(e.blockedURI || ""))) return;
    importing.slice().forEach(function (el) { state(el, "csp"); report(el, new Error("Blocked by this page's Content-Security-Policy: script-src must allow blob: modules")); });
  });

  function state(el, value) { el.setAttribute("data-auvyx-code-state", value); }

  function report(el, error) {
    if (el.getAttribute("data-auvyx-code-state") !== "csp") state(el, "error");
    console.error("[Auvyx code]", el.getAttribute("data-auvyx-id") || el.id || el, error);
    el.dispatchEvent(new CustomEvent("auvyx-code-error", { bubbles: true, detail: { message: String(error && error.message || error) } }));
  }

  // ---- instances ------------------------------------------------------------------------------------------------------------

  var live = [];

  /** Ends an instance's current run: a newer generation, so a pending import will not initialise it; the cleanup is called. */
  function stop(el, why) {
    el._auvyxGen = (el._auvyxGen || 0) + 1;
    var cleanup = el._auvyxCleanup;
    el._auvyxCleanup = null;
    var at = live.indexOf(el);
    if (at >= 0) live.splice(at, 1);
    if (typeof cleanup === "function") { try { cleanup(); } catch (e) { report(el, e); } }
    if (why && el.getAttribute("data-auvyx-code-state") !== "error") state(el, why);
  }

  function stopAll(why) {
    live.slice().forEach(function (el) { stop(el, why || "stopped"); });
    // a block whose import is still in flight is stopped too: a newer generation, so the import cannot start it after a disable and a
    // re-enable (the policy answering "disabled", then "enabled", before the module arrives)
    importing.slice().forEach(function (el) { stop(el, why || "stopped"); });
    importing.length = 0;
  }

  /** Keeps what a started run returned (a cleanup, or a promise of one) unless the instance moved on meanwhile: then it is called at once. */
  function keep(el, gen, returned) {
    Promise.resolve(returned).then(function (cleanup) {
      if (typeof cleanup !== "function") return;
      if (el._auvyxGen === gen && el.isConnected && allowedNow()) el._auvyxCleanup = cleanup;
      else { try { cleanup(); } catch (e) { report(el, e); } }
    }).catch(function (e) { if (el._auvyxGen === gen) report(el, e); });
  }

  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (k) { freeze(value[k]); });
    }
    return value;
  }

  function begin(el) {
    var gen = (el._auvyxGen || 0) + 1;
    stop(el);
    el._auvyxGen = gen;
    return gen;
  }

  var modules = {};

  /** One ES module per source text on a page; the blob address is gone once it has loaded. */
  function load(el, text, id) {
    if (!modules[text]) {
      var prefix = window.auvyxCodePrint ? "const console = window.auvyxCode.console(" + JSON.stringify(id) + ");" : "";
      var url = URL.createObjectURL(new Blob([prefix + text], { type: "text/javascript" }));
      byUrl[url] = el;
      modules[text] = import(url).finally(function () { URL.revokeObjectURL(url); delete byUrl[url]; });
      modules[text].catch(function () { delete modules[text]; });
    }
    return modules[text];
  }

  // ---- a page module: init(el, ctx) -----------------------------------------------------------------------------------------

  function runModule(el) {
    var gen = begin(el);
    var holder = el.querySelector(":scope > script[data-auvyx-module]");
    if (!holder) return Promise.resolve();
    if (!running) { state(el, "stopped"); return Promise.resolve(); }
    var text;
    try { text = JSON.parse(holder.textContent || '""'); } catch { report(el, new Error("The module source is not readable")); return Promise.resolve(); }
    if (typeof text !== "string" || !text.trim()) return Promise.resolve();
    var ctxNode = el.querySelector(":scope > script[data-auvyx-ctx]");
    var ctx = {};
    try { ctx = ctxNode ? JSON.parse(ctxNode.textContent || "{}") : {}; } catch { ctx = {}; }
    freeze(ctx);
    state(el, "pending");
    return refreshPolicy(false).then(function (ok) {
      // before anything is scheduled
      if (el._auvyxGen !== gen || !el.isConnected) return;
      if (!ok || !allowedNow()) { state(el, policy.enabled === true ? "stopped" : "disabled"); return; }
      importing.push(el);
      return load(el, text, el.getAttribute("data-auvyx-id") || "").then(function (mod) {
        var at = importing.indexOf(el);
        if (at >= 0) importing.splice(at, 1);
        // the late-init guard: removed, replaced, stopped or disabled while the import was in flight
        if (el._auvyxGen !== gen || !el.isConnected || !allowedNow()) { if (el._auvyxGen === gen) state(el, policy.enabled === true ? "stopped" : "disabled"); return; }
        if (typeof mod.default !== "function") throw new Error("The module has no default export function");
        live.push(el);
        state(el, "running");
        keep(el, gen, mod.default(el, ctx));
      });
    }).catch(function (e) {
      var at = importing.indexOf(el);
      if (at >= 0) importing.splice(at, 1);
      if (el._auvyxGen === gen) report(el, e);
    });
  }

  // ---- legacy code: ({ el, lib, data, source, reduced }) --------------------------------------------------------------------

  function run(el) {
    if (el.hasAttribute("data-auvyx-slot-code")) return runModule(el);
    var gen = begin(el);
    // The module as a JSON string (data-auvyx-js-json: no < > & in the bytes, so no content filter can rewrite it) or, as
    // older pages print it, as text (data-auvyx-js).
    var holder = el.querySelector(":scope > script[data-auvyx-js-json]") || el.querySelector(":scope > script[data-auvyx-js]");
    var text = "";
    try { text = holder ? (holder.hasAttribute("data-auvyx-js-json") ? JSON.parse(holder.textContent || "\"\"") : holder.textContent) : ""; } catch { text = ""; }
    if (!text || !String(text).trim()) return Promise.resolve();
    if (!running) { state(el, "stopped"); return Promise.resolve(); }
    var dataNode = el.querySelector(":scope > script[data-auvyx-data]");
    var data = {};
    try { data = dataNode ? JSON.parse(dataNode.textContent || "{}") : {}; } catch { data = {}; }
    var names = (el.getAttribute("data-auvyx-libs") || "").split(/\s+/).filter(Boolean);
    var id = el.getAttribute("data-auvyx-id") || "";
    state(el, "pending");
    return refreshPolicy(false).then(function (ok) {
      if (el._auvyxGen !== gen || !el.isConnected) return;
      if (!ok || !allowedNow()) { state(el, policy.enabled === true ? "stopped" : "disabled"); return; }
      // The editor reads what a module prints (its own `console`, on the first line so line numbers stay).
      var prefix = window.auvyxCodePrint ? "const console = window.auvyxCode.console(" + JSON.stringify(id) + ");" : "";
      var url = URL.createObjectURL(new Blob([prefix + text], { type: "text/javascript" }));
      for (var u in byUrl) if (byUrl[u] === el) delete byUrl[u];
      byUrl[url] = el;
      importing.push(el);
      return Promise.all(names.map(library)).then(function (mods) {
        var lib = {};
        names.forEach(function (n, i) { lib[n.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = mods[i]; });
        if (el._auvyxGen !== gen || !allowedNow()) return;
        return import(url).then(function (mod) {
          var at = importing.indexOf(el);
          if (at >= 0) importing.splice(at, 1);
          if (el._auvyxGen !== gen || !el.isConnected || !allowedNow()) return;
          var start = mod.default;
          if (typeof start !== "function") throw new Error("The module has no default export function");
          live.push(el);
          state(el, "running");
          keep(el, gen, start({ el: el, lib: lib, data: data, source: source, reduced: reduced }));
        });
      }).catch(function (e) {
        var at = importing.indexOf(el);
        if (at >= 0) importing.splice(at, 1);
        if (el._auvyxGen === gen) report(el, e);
      }).finally(function () { URL.revokeObjectURL(url); delete byUrl[url]; });
    });
  }

  // ---- when blocks start -----------------------------------------------------------------------------------------------------

  function watch() {
    if (!running) return;
    var els = document.querySelectorAll("[data-auvyx-code]:not([data-auvyx-ran]), [data-auvyx-slot-code=\"module\"]:not([data-auvyx-ran])");
    if (!els.length) return;
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          io.unobserve(e.target);
          if (running) run(e.target);
        }
      });
    }, { rootMargin: "300px" }) : null;
    els.forEach(function (el) {
      el.setAttribute("data-auvyx-ran", "");
      if (io) io.observe(el); else run(el);
    });
  }

  /** The editor's canvas: puts an element's content in (parsed by this window's document, so the nodes are this window's and a library's
      `instanceof HTMLElement` holds), then runs it. Only while code may run: a stopped canvas gets nothing written (a fragment can hold a
      script, and a script in a fragment runs when it is put in). */
  function mount(el, html) {
    if (!running || (policyUrl && policy.enabled !== true)) return Promise.resolve();
    el.replaceChildren(document.createRange().createContextualFragment(html));
    return run(el);
  }

  /** The editor's console for one element's module: prints as usual and tells the editor (`auvyxCodePrint`). */
  function consoleFor(id) {
    var out = {};
    ["log", "info", "warn", "error", "debug"].forEach(function (level) {
      out[level] = function () {
        var args = Array.prototype.slice.call(arguments);
        console[level].apply(console, args);
        if (window.auvyxCodePrint) window.auvyxCodePrint(id, level, args);
      };
    });
    return out;
  }

  /** The editor's Run custom code. Off: every cleanup is called and every block is marked stopped; the editor then draws the page again. */
  function setRunning(on) {
    running = !!on;
    if (!running) {
      stopAll("stopped");
      document.querySelectorAll("[data-auvyx-ran]").forEach(function (el) { el.removeAttribute("data-auvyx-ran"); });
    } else watch();
  }

  // The tab comes back (or the editor window gains focus): ask again, so a site that was switched off stops its code at once.
  function recheck() { if (policyUrl && document.visibilityState !== "hidden") refreshPolicy(true); }
  if (policyUrl) {
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
  }

  window.auvyxCode = {
    version: 2, run: run, mount: mount, watch: watch, console: consoleFor, libraries: Object.keys(LIBS),
    setRunning: setRunning, isRunning: function () { return running; }, stopAll: stopAll, refreshPolicy: refreshPolicy,
    policy: function () { return { enabled: policy.enabled, revision: policy.revision }; }
  };
  var start = function () {
    refreshPolicy(false).then(function (ok) {
      if (ok) watch();
      // no answer, or "disabled": nothing is started and each block says so (the server-rendered template stays)
      else document.querySelectorAll("[data-auvyx-code], [data-auvyx-slot-code=\"module\"]").forEach(function (el) { state(el, "disabled"); });
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
