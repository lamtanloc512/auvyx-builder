/**
 * The agent's `edit` tool (U/AiAgent.scala applyReply): operations on the open document, applied as one change (one
 * Undo). What the typed actions do not cover: replace, update with "set"/"styles"/"attrs"/"bind"/"query", patch of a
 * code element or a game, kits, product card styles, page streams, the site's patterns and library, converting blocks,
 * forms, menus, new pages and saving a pattern, through the same endpoints as the Studio's WordPress host. Blocks to convert are converted before the change
 * lands, so its report names the new elements.
 */
import { type Doc, type El, ElementJson, PageStream, el, insert, move, remove, update, parentOf, indexIn, ancestors, childrenOf, subtreeIds } from "@auvyx/editor-core";
import { styled as normalizeStylesOf } from "./agentCore";
import { nameOf, preview } from "./labels";
import * as Templates from "./templates";
import { nextId } from "./ids";
import { config } from "./config";
import { toast } from "./toast.svelte";
import { Forms, type StoredGame, gameLibs, overLimit, withGames } from "./agentCore";
import * as Site from "./agentSite";
import * as Games from "./agentGames";
import { restyle as restyleCards } from "./products.svelte";

/** The templates a page stream inserts (Templates.byId / Templates.build), from the generated patterns. */
const streamTemplates: PageStream.StreamTemplates = {
  byId: (id) => { const t = Templates.byId(id); return t ? { title: t.title, section: t.group === "Section" } : undefined; },
  build: (id) => { const t = Templates.byId(id); return t ? Templates.build(t) : null; },
};

export interface Applied { applied: number; skipped: string[]; steps: string[]; doc: Doc; lastInserted?: string; converted: boolean }

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (o: unknown, k: string): string | undefined => (isObj(o) && o[k] !== undefined && o[k] !== null ? (typeof o[k] === "string" ? (o[k] as string) : JSON.stringify(o[k]) === undefined ? undefined : typeof o[k] === "object" ? JSON.stringify(o[k]) : String(o[k])) : undefined);
const SECTION_TAGS = ["section", "div", "header", "footer", "main", "article", "aside", "nav"];
const TOGGLES = ["mobile", "tablet", "never"];

const named = (n: El) => { const p = preview(n); return p === "" ? nameOf(n) : `${nameOf(n)} “${p}”`; };

/** TextPatch: each find occurs exactly once. */
function textPatch(text: string, edits: { find: string; replace: string }[]): { ok: true; value: string } | { ok: false; error: string } {
  let current = text;
  for (const [i, e] of edits.entries()) {
    const n = i + 1;
    if (e.find === "") return { ok: false, error: `edit ${n}: "find" is empty` };
    const at = current.indexOf(e.find);
    if (at < 0) return { ok: false, error: `edit ${n}: "find" is not in the text (copy it exactly, spaces and line breaks included)` };
    if (current.indexOf(e.find, at + 1) >= 0) return { ok: false, error: `edit ${n}: "find" occurs more than once; include more of the surrounding lines` };
    current = current.slice(0, at) + e.replace + current.slice(at + e.find.length);
  }
  return { ok: true, value: current };
}

/** The opening comment's attributes of a block's markup (`<!-- wp:name {…} /-->` or an opening tag). */
function openingAttrs(raw: string): O | undefined {
  const m = /^\s*<!--\s+wp:[a-z0-9/-]+\s+(\{[\s\S]*?\})\s+\/?-->/.exec(raw);
  if (!m) return /^\s*<!--\s+wp:[a-z0-9/-]+\s+\/?-->/.test(raw) ? {} : undefined;
  try { const o = JSON.parse(m[1]!); return isObj(o) ? o : undefined; } catch { return undefined; }
}
function withAttrs(raw: string, attrs: O): string {
  return raw.replace(/^(\s*<!--\s+wp:[a-z0-9/-]+)(\s+\{[\s\S]*?\})?(\s+\/?-->)/, (_, a: string, _b: string, c: string) =>
    `${a}${Object.keys(attrs).length ? " " + JSON.stringify(attrs).replace(/--/g, "\\u002d\\u002d") : ""}${c}`);
}
function merge(into: O, changes: O) {
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined) delete into[k];
    else if (isObj(v) && isObj(into[k])) merge(into[k] as O, v);
    else into[k] = v;
  }
}

export interface OpsContext { canScript: boolean; block: (name: string) => string | undefined; field: (k: string) => boolean; convertible: (blockName: string) => boolean; noRoot?: boolean }

/** Applies `ops` to `start`; kits wait for the template markup to load. */
export async function applyOps(start: Doc, ops: unknown[], ctx: OpsContext): Promise<Applied> {
  let doc = start;
  let applied = 0;
  const skipped: string[] = [];
  const steps: string[] = [];
  let lastInserted: string | undefined;
  const elCtx: ElementJson.Context = { newId: nextId, canScript: ctx.canScript, block: ctx.block, field: ctx.field, rawMarkup: false };
  const build = (o: unknown, pageLevel: boolean) => ElementJson.decode(Games.available() ? withGames(o, Games.create) : o, pageLevel, elCtx);
  const toConvert: string[] = [];
  let library: Site.LibraryItem[] | null = null;
  const libraryItems = async () => (library ??= await Site.library.list().catch(() => []));
  const isGame = (n: El) => n.kind === "Section" && n.game !== "";
  const anchor = (op: O): [string | null, number] | undefined => {
    const a = str(op, "after"), b = str(op, "before");
    if (a !== undefined && doc.nodes[a]) return [parentOf(doc, a), indexIn(doc, a) + 1];
    if (b !== undefined && doc.nodes[b]) return [parentOf(doc, b), indexIn(doc, b)];
    return undefined;
  };
  const parentFor = (op: O): [string | null] | undefined => {
    const a = anchor(op);
    if (a) return [a[0]];
    const p = str(op, "parent");
    if (p === undefined) return [null];
    if (doc.nodes[p]) return [p];
    skipped.push(`unknown parent ${p}`);
    return undefined;
  };
  const index = (op: O, parent: string | null) => {
    const a = anchor(op);
    if (a) return a[1];
    const i = Number(str(op, "index"));
    return Number.isFinite(i) && Math.trunc(i) >= 0 ? Math.trunc(i) : childrenOf(doc, parent).length;
  };
  // kits, page streams and card styles are built from the templates' markup
  if (ops.some((o) => isObj(o) && (o.op === "kit" || o.op === "stream" || (o.op === "update" && o.cardStyle !== undefined && o.cardStyle !== null)))) await Templates.load().catch(() => undefined);
  // a game's source is edited where the site keeps it: have it here first
  for (const o of ops) { const t = isObj(o) ? str(o, "id") : undefined; const n = t !== undefined ? start.nodes[t] : undefined; if (n && isGame(n)) await Games.load(n.game); }

  for (const raw of ops) {
    const op: O = isObj(raw) ? raw : {};
    const id = str(op, "id");
    const kind = str(op, "op") ?? "";
    // the site does not show this page's content: changes to it would be invisible
    if (ctx.noRoot && kind !== "menu" && kind !== "page") { skipped.push(`${kind}: this page's content is not shown on the site`); continue; }
    switch (kind) {
      case "insert": {
        const p = parentFor(op);
        if (!p) break;
        const built = build(op.element, p[0] === null);
        if (!built) { skipped.push("insert with an unknown kind"); break; }
        doc = insert(doc, built[0], p[0], index(op, p[0]), built[1]);
        lastInserted = built[0].id;
        applied++;
        steps.push(`Added ${named(built[0])}`);
        break;
      }
      case "replace": {
        if (id === undefined || !doc.nodes[id]) { skipped.push(`replace: unknown id ${id ?? ""}`); break; }
        const parent = parentOf(doc, id);
        const built = build(op.element, parent === null);
        if (!built) { skipped.push(`replace ${id}: unknown kind`); break; }
        const at = indexIn(doc, id);
        steps.push(`Replaced ${named(doc.nodes[id]!)} with ${named(built[0])}`);
        doc = insert(remove(doc, id), built[0], parent, at, built[1]);
        lastInserted = built[0].id;
        applied++;
        break;
      }
      case "update": {
        if (id === undefined || !doc.nodes[id]) { skipped.push(`update: unknown id ${id ?? ""}`); break; }
        steps.push(`Edited ${named(doc.nodes[id]!)}`);
        const gameNode = doc.nodes[id]!;
        const current = isGame(gameNode) ? Games.source(gameNode.game) : undefined;
        if (current) {
          const src = current.source;
          const next = { ...src, title: str(op, "title")?.trim() || src.title, html: str(op, "html") ?? src.html, css: str(op, "css") ?? src.css, js: str(op, "js") ?? src.js,
            libs: op.libs === undefined ? src.libs : gameLibs(ElementJson.strs(op, "libs")) };
          const why = overLimit(next);
          if (why) steps.push(`Skipped the game's change: ${why}`);
          else if (JSON.stringify(next) !== JSON.stringify(src)) Games.set(gameNode.game, { ...current, source: next });
        }
        doc = update(doc, id, (n) => {
          const code = n.kind === "Section" && (n.className.split(" ").includes("auvyx-code") || n.script !== "" || n.markup !== "");
          const game = n.kind === "Section" && n.game !== "";
          const level = Math.trunc(Number(str(op, "level")));
          const align = str(op, "align");
          let next: El = {
            ...n,
            text: str(op, "text") ?? n.text,
            href: str(op, "href") ?? n.href,
            src: n.kind === "Nav" ? str(op, "menu") ?? n.src : str(op, "src") ?? n.src,
            alt: n.kind === "Nav" ? (TOGGLES.includes(str(op, "toggleAt") ?? "") ? str(op, "toggleAt")! : n.alt) : str(op, "alt") ?? n.alt,
            icon: str(op, "icon") !== undefined && ElementJson.decode({ kind: "icon", icon: str(op, "icon") }, false, elCtx)?.[0].icon === str(op, "icon") ? str(op, "icon")! : n.icon,
            tag: SECTION_TAGS.includes(str(op, "tag") ?? "") ? str(op, "tag")! : n.tag,
            level: level >= 1 && level <= 6 ? level : n.level,
            align: align === undefined ? n.align : align === "full" || align === "wide" ? align : "",
            styles: op.styles === undefined ? n.styles : ElementJson.styles(op.styles),
            css: n.kind === "Raw" || game ? n.css : str(op, "css") ?? n.css,
            className: n.kind === "Nav" ? ElementJson.drawer(n.className, op.drawer)
              : n.kind === "Video" && op.autoplay !== undefined ? ElementJson.toggleClass(n.className, "auvyx-video-autoplay", str(op, "autoplay") === "true") : n.className,
            markup: code && ctx.canScript ? str(op, "html") ?? n.markup : n.markup,
            script: code && ctx.canScript ? str(op, "js") ?? n.script : n.script,
            libs: code && ctx.canScript && op.libs !== undefined ? ElementJson.strs(op, "libs") : n.libs,
            uses: code && ctx.canScript && op.data !== undefined ? ElementJson.strs(op, "data") : n.uses,
            bind: op.bind === undefined || op.bind === null ? n.bind : ElementJson.bindings(n.kind, n.bind, op.bind, elCtx),
            query: n.kind === "Loop" && op.query !== undefined && op.query !== null ? ElementJson.loopQuery(n.query, op.query) : n.query,
          };
          if (n.kind === "Video" && op.frame !== undefined && op.frame !== null) next = ElementJson.withFrame(next, String(op.frame));
          if (n.kind === "Raw" && isObj(op.attrs)) {
            const current = openingAttrs(n.raw);
            if (current) { merge(current, op.attrs); next = { ...next, raw: withAttrs(n.raw, current), html: "" }; }
          }
          if (isObj(op.set)) {
            const bpRaw = str(op.set, "breakpoint") ?? "base";
            const bp = bpRaw === "desktop" ? "base" : bpRaw;
            const st = str(op.set, "state") ?? "default";
            const values = isObj(op.set.values) ? Object.entries(op.set.values).map(([p, v]) => [p, v === null || v === undefined ? undefined : String(v)] as [string, string | undefined]) : [];
            next = { ...next, styles: normalizeStylesOf(next.styles, bp, st, values) };
          }
          return next;
        });
        const cardKey = str(op, "cardStyle");
        if (cardKey !== undefined) {
          const next = restyleCards(doc, id, cardKey);
          if (next) doc = next;
          else skipped.push(`cardStyle: unavailable ${cardKey} or ${id} is not a product loop`);
        }
        applied++;
        break;
      }
      case "move": {
        const p = parentFor(op);
        if (id === undefined || !doc.nodes[id] || !p || (p[0] !== null && (p[0] === id || ancestors(doc, p[0]).includes(id)))) { skipped.push(`move: invalid ${id ?? ""}`); break; }
        steps.push(`Moved ${named(doc.nodes[id]!)}`);
        doc = move(doc, id, p[0], index(op, p[0]));
        applied++;
        break;
      }
      case "patch": {
        const part = str(op, "part") ?? "js";
        const edits = Array.isArray(op.edits) ? op.edits.map((e) => ({ find: str(e, "find") ?? "", replace: str(e, "replace") ?? "" })) : [];
        const append = str(op, "append") || undefined;
        const n = id !== undefined ? doc.nodes[id] : undefined;
        const did = append ? "Added to" : "Patched";
        const count = append ? `${append.split("\n").length} line(s)` : `${edits.length} edit(s)`;
        if (!n) { skipped.push(`patch: unknown id ${id ?? ""}`); break; }
        if (!edits.length && !append) { skipped.push('patch: no "edits"'); break; }
        if (!["js", "html", "css"].includes(part)) { skipped.push(`patch: "part" is js, html or css, not ${part}`); break; }
        const code = n.kind === "Section" && (n.className.split(" ").includes("auvyx-code") || n.script !== "" || n.markup !== "");
        if (isGame(n)) {
          const g = Games.source(n.game);
          if (!g) { skipped.push(`patch: the game of ${n.id} is not loaded yet`); break; }
          const src = g.source;
          const before = part === "html" ? src.html : part === "css" ? src.css : src.js;
          const ch = append ? { ok: true as const, value: before === "" || before.endsWith("\n") ? before + append : `${before}\n${append}` } : textPatch(before, edits);
          if (!ch.ok) { skipped.push(`patch ${n.id} ${part}: ${ch.error}`); break; }
          const changed = part === "html" ? { ...src, html: ch.value } : part === "css" ? { ...src, css: ch.value } : { ...src, js: ch.value };
          const why = overLimit(changed);
          if (why) { skipped.push(`patch ${n.id}: ${why}`); break; }
          Games.set(n.game, { ...g, source: changed } as StoredGame);
          steps.push(`${did} the ${part} of ${named(n)} (${count})`);
          applied++;
          break;
        }
        if (!code || !ctx.canScript) { skipped.push(`patch: ${n.id} is not a game or a code element`); break; }
        const text = part === "html" ? n.markup : part === "css" ? n.css : n.script;
        const changed = append ? { ok: true as const, value: text === "" || text.endsWith("\n") ? text + append : `${text}\n${append}` } : textPatch(text, edits);
        if (!changed.ok) { skipped.push(`patch ${n.id} ${part}: ${changed.error}`); break; }
        doc = update(doc, n.id, (x) => (part === "html" ? { ...x, markup: changed.value } : part === "css" ? { ...x, css: changed.value } : { ...x, script: changed.value }));
        steps.push(`${did} the ${part} of ${named(n)} (${count})`);
        applied++;
        break;
      }
      case "remove": {
        if (id === undefined || !doc.nodes[id]) { skipped.push(`remove: unknown id ${id ?? ""}`); break; }
        steps.push(`Removed ${named(doc.nodes[id]!)}`);
        doc = remove(doc, id);
        applied++;
        break;
      }
      case "kit": {
        const t = Templates.byId(str(op, "id") ?? "");
        const p = parentFor(op);
        const built = t && Templates.available(t) ? Templates.build(t) : null;
        if (!t || !p || !built) { skipped.push(`kit: unknown ${str(op, "id") ?? ""}`); break; }
        doc = insert(doc, built.root, p[0], index(op, p[0]), built.nodes);
        lastInserted = built.root.id;
        applied++;
        steps.push(`Added “${t.title}”`);
        break;
      }
      case "pattern": {
        const slug = str(op, "slug") ?? "";
        const pat = ((config as unknown as { patterns?: { slug?: string; name?: string; title?: string }[] }).patterns ?? []).find((x) => (x.slug ?? x.name) === slug);
        const p = pat ? parentFor(op) : undefined;
        if (!pat || !p) { skipped.push(`pattern: unknown ${slug}`); break; }
        const n = el(nextId(), "Raw", { blockName: "core/pattern", raw: `<!-- wp:pattern {"slug":${JSON.stringify(slug)}} /-->`, html: "" });
        doc = insert(doc, n, p[0], index(op, p[0]));
        toConvert.push(n.id);
        applied++;
        steps.push(`Added section “${pat.title || slug}”`);
        break;
      }
      case "library": {
        const want = Math.trunc(Number(str(op, "id")));
        const item = (await libraryItems()).find((i) => i.id === want);
        const p = item ? parentFor(op) : undefined;
        if (!item || !p) { skipped.push(`library: unknown ${str(op, "id") ?? ""}`); break; }
        const n = el(nextId(), "Raw", { blockName: "core/block", raw: `<!-- wp:block {"ref":${item.id}} /-->`, html: "" });
        doc = insert(doc, n, p[0], index(op, p[0]));
        if (!item.synced) toConvert.push(n.id);
        applied++;
        steps.push(`Added “${item.title}”`);
        break;
      }
      case "convert": {
        const n = id !== undefined ? doc.nodes[id] : undefined;
        if (!n || n.kind !== "Raw" || !ctx.convertible(n.blockName)) { skipped.push(`convert: not convertible ${id ?? ""}`); break; }
        toConvert.push(n.id);
        applied++;
        steps.push(`Made ${named(n)} editable`);
        break;
      }
      case "form": {
        const fieldsIn = Array.isArray(op.fields) ? op.fields : [];
        const fields: Forms.Field[] = [];
        for (const f of fieldsIn) {
          const label = (str(f, "label") ?? "").trim().slice(0, 120) || "Field";
          const k = str(f, "kind");
          const kind = k !== undefined && Forms.KINDS.some(([x]) => x === k) ? k : "text";
          const opts = isObj(f) && Array.isArray(f.options) ? [...new Set(f.options.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x !== ""))].slice(0, Forms.MAX_OPTIONS) : [];
          fields.push(Forms.field(Forms.nameFor(label, new Set(fields.map((x) => x.name))), label, kind, str(f, "required") === "true", opts, (str(f, "placeholder") ?? "").slice(0, 120)));
        }
        const p = parentFor(op);
        if (!ctx.block(Forms.BLOCK_NAME)) { skipped.push("form: this site has no forms"); break; }
        if (!p) { skipped.push("form: where?"); break; }
        const base = Forms.starter(`f${Math.random().toString().slice(2, 12)}`);
        const form = { ...base, fields: fields.length ? fields.slice(0, Forms.MAX_FIELDS) : base.fields,
          submit: ((str(op, "submit") ?? "").trim() || base.submit).slice(0, 60), success: ((str(op, "success") ?? "").trim() || base.success).slice(0, 300) };
        const n = Forms.element(nextId(), form);
        doc = insert(doc, n, p[0], index(op, p[0]));
        lastInserted = n.id;
        applied++;
        steps.push(`Added a form with ${form.fields.length} fields (${form.fields.map((f) => f.label).join(", ")})`);
        break;
      }
      case "menu": {
        if (!Site.canEditMenus()) { skipped.push("menu: menus cannot be edited here"); break; }
        const menuId = Math.trunc(Number(str(op, "menu") ?? "0")) || 0;
        const loaded = await Site.menus.load().catch(() => ({ menus: [] as Site.EditableMenu[] }));
        const existing = loaded.menus.find((m) => m.id === menuId);
        const libIds = new Set((await libraryItems()).map((i) => i.id));
        const menuNode = (o: unknown, level: number): Site.MenuNode => {
          const kids = level >= 3 || !isObj(o) || !Array.isArray(o.children) ? [] : o.children.map((c) => menuNode(c, level + 1));
          const mega = level === 1 && str(o, "mega") === "true" && kids.length > 0;
          const panelNum = Math.trunc(Number(str(o, "panel")));
          const panel = mega && libIds.has(panelNum) ? panelNum : 0;
          return { label: str(o, "label") ?? "", url: str(o, "url") ?? "#", kind: "", type: "", id: 0, mega, description: str(o, "description") ?? "", children: kids, panel };
        };
        const items = Array.isArray(op.items) ? op.items.map((i) => menuNode(i, 1)) : [];
        if (!items.length) { skipped.push("menu: no items"); break; }
        const menu: Site.EditableMenu = { id: existing?.id ?? 0, title: str(op, "title") ?? existing?.title ?? "Menu", items };
        void Site.menus.save(menu).then((saved) => toast(`Menu “${saved.title}” saved`), (e: Error) => toast(`Menu not saved: ${e.message}`));
        const count = (ns: Site.MenuNode[]): number => ns.reduce((a, n) => a + 1 + count(n.children), 0);
        applied++;
        steps.push(`Saved the menu “${menu.title}” (${count(items)} links)`);
        break;
      }
      case "page": {
        const trees = isObj(op) && Array.isArray(op.elements) ? op.elements : [];
        const roots = trees.flatMap((t) => { const b = build(t, true); return b ? [b] : []; });
        const title = str(op, "title") ?? "New page";
        if (!roots.length) { skipped.push("page: no elements"); break; }
        const built: Doc = { roots: roots.map(([r]) => r.id), nodes: Object.fromEntries(roots.flatMap(([r, rest]) => [...Object.entries(rest), [r.id, r] as [string, El]])) };
        void Site.createPage(title, built, str(op, "template") ?? "", false, "").then((pg) => toast(`Draft page “${pg.title}” created`), (e: Error) => toast(`Page not created: ${e.message}`));
        applied++;
        steps.push(`Created the draft page “${title}”`);
        break;
      }
      case "save_pattern": {
        const n = id !== undefined ? doc.nodes[id] : undefined;
        if (!n) { skipped.push(`save_pattern: unknown ${id ?? ""}`); break; }
        const ids = subtreeIds(doc, n.id);
        const sub: Doc = { roots: [n.id], nodes: Object.fromEntries(ids.map((i) => [i, doc.nodes[i]!])) };
        const synced = str(op, "component") === "true";
        void Site.library.create(str(op, "title") ?? "Pattern", sub, synced).then((item) => toast(`Saved “${item.title}” to the library`), (e: Error) => toast(`Not saved: ${e.message}`));
        applied++;
        steps.push(`Saved ${named(n)} as a ${synced ? "component" : "pattern"}`);
        break;
      }
      case "stream": {
        // a whole page as JSONL patches (PageStream): every line applies, or none
        const lines = PageStream.streamLines(op.lines);
        if (!lines.length) { skipped.push("stream: no lines"); break; }
        const r = PageStream.applyAll(doc, lines, { newId: nextId, templates: streamTemplates, allowSandbox: ctx.canScript });
        if (!r.ok) { skipped.push(`stream: ${r.error}`); break; }
        doc = r.value.at(-1) ?? doc;
        applied += r.value.length;
        steps.push(...lines.map((l) => PageStream.summary(l, streamTemplates)));
        break;
      }
      default:
        skipped.push(`unknown op ${kind}`);
    }
  }
  // blocks to convert become Auvyx elements now (RawBlocks.convert), so the report can name them
  for (const cid of toConvert) {
    const n = doc.nodes[cid];
    if (!n) continue;
    try {
      const got = await Site.convert(n.raw);
      const parent = parentOf(doc, cid);
      const at = indexIn(doc, cid);
      const extra = Object.fromEntries(Object.entries(got.nodes).filter(([k]) => !got.roots.includes(k)));
      doc = remove(doc, cid);
      got.roots.forEach((r, i) => { doc = insert(doc, got.nodes[r]!, parent, at + i, extra); });
      if (lastInserted === cid) lastInserted = got.roots[0];
    } catch (e) { toast(`Converted 0, 1 failed: ${(e as Error).message}`); }
  }
  return { applied, skipped, steps, doc, lastInserted, converted: toConvert.length > 0 };
}
