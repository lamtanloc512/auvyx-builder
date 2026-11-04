(function () {
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".auvyx-snippet__copy");
    if (!btn) return;
    const root = btn.closest("[data-auvyx-snippet]");
    const code = root && root.querySelector("code");
    if (!code) return;
    e.preventDefault();
    const label = btn.getAttribute("aria-label") || btn.textContent || "Copy";
    copyText(code.textContent || "").then(
      function () {
        const prev = btn.textContent;
        btn.textContent = "Copied";
        window.setTimeout(function () {
          btn.textContent = prev || label;
        }, 1400);
      },
      function () {}
    );
  });
})();
