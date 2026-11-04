/**
 * Import (U/ImportButton.scala): a file people already have becomes elements at the end of the page, one undo step.
 * A Studio JSON, an Elementor export or Flatsome shortcodes go through ImportFile (editor-core's port of the Studio's
 * converters); an HTML page is laid out in a hidden frame and read back (import/htmlImport.ts).
 */
import { DocJson, type Doc } from "@auvyx/editor-core";
import { htmlToDoc } from "./import/htmlImport";
import { insertDoc } from "./library.svelte";
import { nextId } from "./ids";
import { config } from "./config";
import { toast } from "./toast.svelte";

/** Fresh ids, so an imported document never collides with the page. */
function fresh(doc: Doc): Doc {
  const map = new Map(Object.keys(doc.nodes).map((k) => [k, nextId()]));
  const nodes = Object.fromEntries(Object.values(doc.nodes).map((n) => [map.get(n.id)!, { ...n, id: map.get(n.id)!, children: n.children.map((c) => map.get(c)!).filter(Boolean) }]));
  return { roots: doc.roots.map((r) => map.get(r)!).filter((r) => nodes[r]), nodes };
}

export function pick() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.html,.htm,.txt,application/json,text/html";
  input.onchange = () => { const f = input.files?.[0]; if (f) f.text().then((t) => run(f.name, t)); };
  input.click();
}

export async function run(name: string, text: string) {
  const html = /\.html?$/i.test(name) || text.trim().startsWith("<");
  if (html) {
    toast(`Reading ${name}…`);
    const r = await htmlToDoc(text, location.href);
    const d = DocJson.decode(r.json);
    if ("error" in d) { toast(`Could not import ${name}: ${d.error}`); return; }
    insertDoc(fresh(d.doc), true);
    toast(`Imported ${name}.${r.skipped.length ? ` Left out: ${r.skipped.join(", ")}.` : ""}`);
    return;
  }
  // the converters load on first use: most sessions never import
  const ImportFile = await import("@auvyx/editor-core/import");
  const r = ImportFile.convert(name, text, config.assetsUrl ?? "", nextId);
  if (!r.ok) { toast(`Could not import ${name}: ${r.error}`); return; }
  // a Studio document keeps the ids it was saved with: give it fresh ones; converted files already have them
  insertDoc(r.value.source === "studio" ? fresh(r.value.doc) : r.value.doc, true);
  toast(`Imported ${name}.${r.value.kept.length ? ` Kept as placeholders or blocks: ${r.value.kept.join(", ")}.` : ""}`);
}
