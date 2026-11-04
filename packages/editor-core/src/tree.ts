/**
 * The block tree Auvyx Builder's PHP prepares from a page (`Studio::tree()`, parse_blocks() underneath) → a document.
 * The same input the Scala `TreeDecoder` reads, read the same tolerant way: a missing or null key is "nothing", any
 * other value is taken as its JavaScript text (as Scala.js's toString does). Ids are not stored in WordPress: every
 * element gets a fresh one. Blocks Auvyx does not model stay `Raw` and are written back verbatim. Runtime block and preset
 * definitions ride in the `auvyx` attribute and are collected back onto the document.
 */
import { type Doc, type El, SECTION_TAGS, el, kindOfBlock } from "./model";
import { isRecord, javaTrim, toInt } from "./json";
import { type Preset, type RuntimeBlock, parseBlock, parsePreset } from "./runtime";

export interface TreeNode {
  block: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

const nil = (v: unknown): v is null | undefined => v === undefined || v === null;
const get = (v: unknown, key: string): unknown => (isRecord(v) && Object.hasOwn(v, key) ? v[key] : undefined);
const str = (v: unknown, key: string): string => {
  const x = get(v, key);
  return nil(x) ? "" : String(x);
};
const int = (v: unknown, key: string, fallback = 0): number => {
  const x = get(v, key);
  return nil(x) ? fallback : toInt(x);
};
const list = (v: unknown, key: string): unknown[] => {
  const x = get(v, key);
  return Array.isArray(x) ? x : [];
};
/** A JSON object of scalars as strings, in the server's order. */
const strings = (v: unknown): Record<string, string> =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => !nil(x)).map(([k, x]) => [k, String(x)])) : {};
/** `{breakpoint: {state: {property: value}}}` with every value as text; StyleEngine normalizes it at save. */
const styles = (v: unknown): El["styles"] =>
  isRecord(v)
    ? Object.fromEntries(Object.entries(v).map(([bp, states]) => [bp,
      isRecord(states) ? Object.fromEntries(Object.entries(states).map(([state, decls]) => [state,
        isRecord(decls) ? Object.fromEntries(Object.entries(decls).map(([p, x]) => [p, String(x)])) : {}])) : {}]))
    : {};

const distinctById = <T extends { id: string }>(items: T[]): T[] => items.filter((x, i) => items.findIndex((y) => y.id === x.id) === i);

const readBlock = (v: unknown): RuntimeBlock | undefined => {
  if (!isRecord(v) || str(v, "id") === "") return undefined;
  const block = parseBlock(v);
  return block.ok ? block.value : undefined;
};

export const decodeTree = (tree: TreeNode[], newId: () => string = counter()): Doc => {
  const nodes: Record<string, El> = {};
  const defs: RuntimeBlock[] = [];
  const presets: Preset[] = [];

  const takeCatalog = (n: TreeNode) => {
    for (const v of list(n, "defs")) {
      const block = readBlock(v);
      if (block) defs.push(block);
    }
    for (const v of list(n, "presets")) {
      const preset = parsePreset(v, defs);
      if (preset.ok) presets.push(preset.value);
    }
  };

  const element = (n: TreeNode): string => {
    takeCatalog(n);
    const id = newId();
    const block = str(n, "block");
    const kind = kindOfBlock(block);
    if (!kind) {
      nodes[id] = el(id, "Raw", { blockName: block, raw: str(n, "raw"), html: str(n, "html"), styles: styles(get(n, "styles")) });
      return id;
    }
    // children first: a block defined inside comes before this one's own definition, as in the Scala decoder
    const children = list(n, "children").map((c) => element(c as TreeNode));
    const runtime = readBlock(get(n, "runtime"));
    if (runtime) defs.push(runtime);
    const sandbox = get(n, "sandbox");
    const sandboxed = isRecord(sandbox);
    const rawClass = str(n, "className");
    const className = sandboxed && !rawClass.split(" ").includes("auvyx-sandbox") ? javaTrim(`${rawClass} auvyx-sandbox`) : rawClass;
    const allow = get(sandbox, "allow");
    const fields = sandboxed
      ? { html: str(sandbox, "html"), css: str(sandbox, "css"), js: str(sandbox, "js"), allow: nil(allow) ? "" : Array.isArray(allow) ? allow.map(String).join(" ") : String(allow) }
      : runtime ? strings(get(get(n, "runtime"), "fields")) : {};
    const code = get(n, "code");
    const tag = str(n, "tag");
    nodes[id] = el(id, kind, {
      text: str(n, "text"),
      tag: (SECTION_TAGS as readonly string[]).includes(tag) ? tag : "section",
      level: Math.min(6, Math.max(1, int(n, "level", 2))),
      href: str(n, "href"),
      styles: styles(get(n, "styles")),
      children,
      align: str(n, "align"),
      className,
      anchor: str(n, "anchor"),
      src: str(n, "src"),
      alt: str(n, "alt"),
      icon: str(n, "icon"),
      mediaId: int(n, "mediaId"),
      bind: strings(get(n, "bind")),
      query: strings(get(n, "query")),
      locked: get(n, "locked") === true,
      label: str(n, "label"),
      css: str(n, "css"),
      markup: str(code, "markup"),
      script: str(code, "script"),
      libs: list(code, "libs").map(String),
      uses: list(code, "uses").map(String),
      game: str(n, "game"),
      target: str(n, "target"),
      runtime: runtime?.id ?? "",
      fields,
    });
    return id;
  };

  const roots = tree.map(element);
  return { roots, nodes, defs: distinctById(defs), presets: distinctById(presets) };
};

const counter = () => {
  let i = 0;
  return () => `e${++i}`;
};
