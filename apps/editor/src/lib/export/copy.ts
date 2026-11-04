/**
 * The Studio's "Export section" / "Export page" (U/SettingsPanel.scala `copyExport`): the section or the page as a
 * `<auvyx-section>` web component (editor-core's WebExport, byte for byte the Studio's), copied to the clipboard.
 * Imported statically: the clipboard write must stay inside the click's user activation, and editor-core's index already
 * carries WebExport into the main bundle.
 */
import { WebExport, type Doc } from "@auvyx/editor-core";
import { toast } from "../toast.svelte";

/** `id`: the section to export; null exports the page (every root section). */
export function copyExport(doc: Doc, id: string | null): void {
  const result = id === null ? WebExport.page(doc) : WebExport.section(doc, id);
  if (!result.ok) return toast(result.error);
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard === undefined) return toast("Clipboard is unavailable");
  // as the Studio: the copy is not awaited, the toast says it is done
  void clipboard.writeText(result.value).catch(() => undefined);
  toast("Copied the web component");
}
