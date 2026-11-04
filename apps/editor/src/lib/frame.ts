/** The canvas frame: reloads it after a change the site renders around the document (title, template, menus). */
export function reloadCanvas() {
  const f = document.querySelector<HTMLIFrameElement>("iframe[data-auvyx-canvas]");
  f?.contentWindow?.location.reload();
}
