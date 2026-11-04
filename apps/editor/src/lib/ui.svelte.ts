/** Which dialogs and menus are open. */
export const ui = $state({
  postSettings: false,
  themePresets: false,
  menus: false,
  pageTemplates: false,
  source: false,
  shortcuts: false,
  /** The context menu: element and where (editor coordinates). */
  menu: null as null | { id: string; x: number; y: number },
  /** Media library for an element (Image / Video source). */
  media: null as null | { id: string; field: "src" | "background" },
});
