/**
 * The Studio's own JSON document (the Scala `DocJson`): what Auvyx Studio imports and exports, and what an HTML import
 * produces. Decoding checks what the Scala decoder checks: known fields, sizes, one parent per node, no cycles.
 */
import { type Doc, type El, type Kind, KINDS, SECTION_TAGS, el } from "./model";
import { blockJson, presetJson } from "./runtime";

export const MAX_DEPTH = 64;
export const MAX_NODES = 5000;
const MAX_JSON = 8 * 1024 * 1024;
const ALLOWED = new Set(["id", "kind", "text", "tag", "level", "href", "styles", "children", "src", "alt", "icon", "mediaId", "align", "className", "anchor", "blockName", "raw", "html", "bind", "query", "locked", "label", "target", "css", "markup", "script", "libs", "uses", "game", "runtime", "fields", "block", "props"]);

class Invalid extends Error {}
const need = (ok: boolean, why: string) => { if (!ok) throw new Invalid(why); };

export function decode(json: string): { doc: Doc } | { error: string } {
  try {
    need(json.length <= MAX_JSON, "Document JSON is too large");
    let nesting = 0, quoted = false, escaped = false;
    for (const c of json) {
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === "\"") quoted = false; }
      else if (c === "\"") quoted = true;
      else if (c === "{" || c === "[") { nesting++; need(nesting <= 128, "JSON nesting is too deep"); }
      else if (c === "}" || c === "]") nesting--;
    }
    const root = JSON.parse(json) as Record<string, unknown>;
    need(Object.keys(root).every((k) => ["version", "roots", "nodes", "defs", "presets"].includes(k)), "Unknown document field");
    need(root.version === undefined || root.version === 1, "Unsupported document version");
    const raw = root.nodes as Record<string, Record<string, unknown>>;
    need(!!raw && Object.keys(raw).length <= MAX_NODES, `Document exceeds ${MAX_NODES} nodes`);
    const nodes: Record<string, El> = {};
    for (const [id, f] of Object.entries(raw)) {
      need(Object.keys(f).every((k) => ALLOWED.has(k)), `Unknown field on '${id}'`);
      const str = (k: string, d = "") => (f[k] === undefined ? d : String(f[k]));
      const int = (k: string, d: number) => { if (f[k] === undefined) return d; const n = Number(f[k]); need(Number.isInteger(n), `Invalid integer '${k}'`); return n; };
      const kindName = String(f.kind);
      const kind = (kindName === "Tabs" || kindName === "Dialog" ? "Section" : kindName) as Kind;
      need(kind in KINDS, `Unknown kind '${kindName}'`);
      nodes[id] = el(str("id", id), kind, {
        text: str("text"), tag: str("tag", "section"), level: int("level", 2), href: str("href"), styles: (f.styles ?? {}) as El["styles"],
        children: ((f.children as unknown[]) ?? []).map(String), src: str("src"), alt: str("alt"), icon: str("icon"), mediaId: int("mediaId", 0),
        align: str("align"), className: str("className"), anchor: str("anchor"), blockName: str("blockName"), raw: str("raw"), html: str("html"),
        bind: (f.bind ?? {}) as Record<string, string>, query: (f.query ?? {}) as Record<string, string>, locked: f.locked === true,
        label: str("label"), target: str("target"), css: str("css"), markup: str("markup"), script: str("script"),
        libs: ((f.libs as unknown[]) ?? []).map(String).slice(0, 50), uses: ((f.uses as unknown[]) ?? []).map(String).slice(0, 50), game: str("game"),
        runtime: str("runtime"), fields: (f.fields ?? {}) as Record<string, string>,
      });
    }
    const doc: Doc = { roots: ((root.roots as unknown[]) ?? []).map(String), nodes };
    const why = validate(doc);
    return why ? { error: why } : { doc };
  } catch (e) {
    return { error: (e as Error).message || "Invalid document JSON" };
  }
}

export function validate(doc: Doc): string | null {
  const seen = new Set<string>();
  const visit = (id: string, depth: number): string | null => {
    if (depth > MAX_DEPTH) return `Document exceeds depth ${MAX_DEPTH}`;
    if (seen.has(id)) return `Cycle or multiple parents for '${id}'`;
    const n = doc.nodes[id];
    if (!n) return `Missing node '${id}'`;
    if (n.id !== id || !id) return `Invalid node id '${id}'`;
    if (!KINDS[n.kind].container && n.children.length) return `Leaf '${id}' has children`;
    if (!(SECTION_TAGS as readonly string[]).includes(n.tag)) return `Invalid section tag '${n.tag}'`;
    if (n.level < 1 || n.level > 6) return "Heading level must be 1 through 6";
    seen.add(id);
    for (const c of n.children) { const w = visit(c, depth + 1); if (w) return w; }
    return null;
  };
  for (const r of doc.roots) { const w = visit(r, 1); if (w) return w; }
  return seen.size === Object.keys(doc.nodes).length ? null : "Unreachable nodes or rootless cycle";
}

/** The document as the Studio writes it (nodes sorted by id). */
export function encode(doc: Doc): string {
  const nodes: Record<string, unknown> = {};
  for (const id of Object.keys(doc.nodes).sort()) nodes[id] = doc.nodes[id];
  // DocJson.encode: the document's runtime blocks and presets (RuntimeBlocks.encodeDefs / encodePresets) when it has any
  return JSON.stringify({
    version: 1, roots: doc.roots, nodes,
    ...(doc.defs?.length ? { defs: doc.defs.map((b) => JSON.parse(blockJson(b))) } : {}),
    ...(doc.presets?.length ? { presets: doc.presets.map((p) => JSON.parse(presetJson(p))) } : {}),
  });
}
