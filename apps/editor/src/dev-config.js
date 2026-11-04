window.auvyxEditor = {
  postId: 0, restRoot: "", restBase: "pages", nonce: "", title: "Sample page", status: "draft", viewUrl: "", exitUrl: "",
  blockEditor: "", themeCss: "body{font-family:system-ui,sans-serif;margin:0;color:#111}", blocksCss: "",
  breakpoints: [{ id: "base", label: "Desktop" }, { id: "tablet", label: "Tablet", maxWidth: 1024 }, { id: "mobile", label: "Mobile", maxWidth: 767 }],
  blocks: [
    { block: "auvyx/section", tag: "header", styles: { base: { default: { padding: "96px 24px", display: "flex", "flex-direction": "column", gap: "20px", "align-items": "center", "text-align": "center" } }, mobile: { default: { padding: "56px 16px" } } }, children: [
      { block: "auvyx/heading", level: 1, text: "Fall ’26", styles: { base: { default: { "font-size": "64px", margin: "0" } }, mobile: { default: { "font-size": "40px" } } } },
      { block: "auvyx/text", text: "Quiet clothes, made to last.", styles: { base: { default: { "font-size": "18px", margin: "0", color: "#555" } } } },
      { block: "auvyx/button", text: "Shop the collection", href: "#", styles: { base: { default: { padding: "14px 28px", "background-color": "#111", color: "#fff", "border-radius": "999px" } } } },
    ] },
    { block: "core/paragraph", raw: "<!-- wp:paragraph -->\n<p>A WordPress paragraph, kept as it is.</p>\n<!-- /wp:paragraph -->", html: "<p style=\"padding:0 24px\">A WordPress paragraph, kept as it is.</p>" },
  ],
};
