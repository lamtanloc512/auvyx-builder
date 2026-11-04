/**
 * A file people already have → a Studio document (ImportFile.scala): a Studio JSON (DocJson), an Elementor export (a
 * page, a template, a page's stored `_elementor_data`) or Flatsome shortcodes. HTML is read in the browser, from the
 * page as laid out (htmlImport). `assets` is where the placeholders are (the host's assets URL); `newId` makes the
 * element ids (inject a counter to get the Studio's own).
 */
import type { Doc, El } from "../model";
import * as DocJson from "../docjson";
import { distinct, isObj, readJson, type JVal } from "./jvm";
import * as Elementor from "./elementor";
import * as Flatsome from "./flatsome";

/** The document, what was kept as placeholders or blocks, and what the file was ("studio", "elementor", "flatsome"). */
export interface Imported { doc: Doc; kept: string[]; source: "studio" | "elementor" | "flatsome" }

export type Converted = { ok: true; value: Imported } | { ok: false; error: string };

export function convert(name: string, text: string, assets: string, newId: () => string): Converted {
  const trimmed = text.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
  const checked = (roots: string[], nodes: Record<string, El>, kept: string[], source: Imported["source"]): Converted => {
    const doc: Doc = { roots, nodes };
    const why = DocJson.validate(doc);
    return why ? { ok: false, error: why } : { ok: true, value: { doc, kept: distinct(kept), source } };
  };
  // Flatsome shortcodes start with "[" too: JSON only when it parses
  let json: JVal | undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { json = readJson(trimmed); } catch { json = undefined; }
  }
  if (json !== undefined) {
    if (isObj(json) && json.has("version") && json.has("nodes")) {
      const d = DocJson.decode(trimmed);
      return "error" in d ? { ok: false, error: d.error } : { ok: true, value: { doc: d.doc, kept: [], source: "studio" } };
    }
    if (Elementor.detect(json)) {
      const p = Elementor.piece(json, name);
      if (!p) return { ok: false, error: "No Elementor page or template in this file" };
      const r = Elementor.build(p.elements, Elementor.globals(json) ?? Elementor.emptyGlobals(), assets, newId);
      return checked(r.roots, r.nodes, r.kept, "elementor");
    }
    return { ok: false, error: "This JSON is neither a Studio document nor an Elementor export" };
  }
  if (Flatsome.detect(trimmed)) {
    const r = Flatsome.build(trimmed, new Map(), assets, newId);
    return checked(r.roots, r.nodes, r.kept, "flatsome");
  }
  if (trimmed.startsWith("{")) return { ok: false, error: "Not valid JSON" };
  return { ok: false, error: "Not a file this can import (Studio JSON, Elementor JSON, Flatsome shortcodes, or HTML)" };
}
