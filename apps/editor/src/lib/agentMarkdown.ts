/**
 * The Markdown a model writes in chat (S/Markdown.scala): emphasis, code, links, headings, quotes, nested and task lists,
 * tables, rules. Parsed to a tree and nothing else, so the view builds elements from it and a reply can never inject
 * markup. Links are kept only for http(s) addresses.
 */
export type Align = "left" | "center" | "right";
export type Inline =
  | { t: "text"; value: string }
  | { t: "bold" | "italic" | "strike"; children: Inline[] }
  | { t: "code"; value: string }
  | { t: "link"; children: Inline[]; url: string };
export interface Item { done: boolean | null; blocks: Block[] }
export type Block =
  | { t: "para"; lines: Inline[][] }
  | { t: "heading"; level: number; text: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: Item[] }
  | { t: "quote"; blocks: Block[] }
  | { t: "code"; lang: string; text: string }
  | { t: "table"; head: Inline[][]; align: Align[]; rows: Inline[][][] }
  | { t: "rule" };

export const parse = (text: string): Block[] => blocks(text.split("\n"));

const ITEM = /^([ \t]*)([-*+•]|\d{1,3}[.)])[ \t]+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s{0,3}```.*$/;
const FENCE_LANG = /^\s{0,3}```\s*([\w-]*).*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;

const indentOf = (l: string) => { let n = 0; for (const c of l) { if (c === " ") n++; else if (c === "\t") n += 4; else break; } return n; };
function dedent(l: string, n: number) {
  let cols = 0, i = 0;
  while (i < l.length && cols < n && (l[i] === " " || l[i] === "\t")) { cols += l[i] === "\t" ? 4 : 1; i++; }
  return l.slice(i);
}
const isOrdered = (m: string) => /\d/.test(m[0]!);
const isTableStart = (lines: string[]) => lines.length >= 2 && lines[0]!.includes("|") && TABLE_SEP.test(lines[1]!) && cells(lines[0]!).length === cells(lines[1]!).length;

function cells(row: string): string[] {
  let t = row.trim();
  if (t.startsWith("|")) t = t.slice(1);
  const body = t.endsWith("|") && !t.endsWith("\\|") ? t.slice(0, -1) : t;
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < body.length;) {
    if (body[i] === "\\" && body[i + 1] === "|") { cur += "|"; i += 2; }
    else if (body[i] === "|") { out.push(cur.trim()); cur = ""; i++; }
    else { cur += body[i]; i++; }
  }
  out.push(cur.trim());
  return out;
}

const startsBlock = (l: string) => FENCE.test(l) || RULE.test(l) || HEADING.test(l) || QUOTE.test(l) || ITEM.test(l);

function span(lines: string[], p: (l: string) => boolean): [string[], string[]] {
  let i = 0;
  while (i < lines.length && p(lines[i]!)) i++;
  return [lines.slice(0, i), lines.slice(i)];
}

function blocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let ls = lines;
  while (ls.length) {
    const l = ls[0]!;
    const rest = ls.slice(1);
    if (l.trim() === "") { ls = rest; continue; }
    if (FENCE.test(l)) {
      const [code, after] = span(rest, (x) => !FENCE.test(x));
      out.push({ t: "code", lang: (FENCE_LANG.exec(l)?.[1] ?? "").toLowerCase(), text: code.join("\n") });
      ls = after.slice(1);
      continue;
    }
    if (RULE.test(l) && !ITEM.test(l)) { out.push({ t: "rule" }); ls = rest; continue; }
    const h = HEADING.exec(l);
    if (h) { out.push({ t: "heading", level: h[1]!.length, text: inlines(h[2]!) }); ls = rest; continue; }
    if (QUOTE.test(l)) {
      const [qs, after] = span(ls, (x) => QUOTE.test(x));
      out.push({ t: "quote", blocks: blocks(qs.map((x) => QUOTE.exec(x)?.[1] ?? x)) });
      ls = after;
      continue;
    }
    if (isTableStart(ls)) {
      const head = cells(ls[0]!);
      const align: Align[] = cells(ls[1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
      const [rows, after] = span(ls.slice(2), (x) => x.trim() !== "" && x.includes("|"));
      out.push({ t: "table", head: head.map(inlines), align, rows: rows.map((r) => { const c = cells(r); while (c.length < head.length) c.push(""); return c.slice(0, head.length).map(inlines); }) });
      ls = after;
      continue;
    }
    if (ITEM.test(l)) { const [list, after] = listAt(ls); out.push(list); ls = after; continue; }
    const [para, after] = span(ls, (x) => x.trim() !== "" && !startsBlock(x));
    if (!para.length) { out.push({ t: "para", lines: [inlines(l)] }); ls = rest; continue; }
    let cut = -1;
    for (let i = 1; i < para.length; i++) if (isTableStart([...para.slice(i), ...after])) { cut = i; break; }
    if (cut > 0) { out.push({ t: "para", lines: para.slice(0, cut).map(inlines) }); ls = [...para.slice(cut), ...after]; }
    else { out.push({ t: "para", lines: para.map(inlines) }); ls = after; }
  }
  return out;
}

function listAt(lines: string[]): [Block, string[]] {
  const [, sp, marker] = ITEM.exec(lines[0]!)!;
  const base = indentOf(sp!);
  const ordered = isOrdered(marker!);
  const start = ordered ? Number.parseInt(marker!.slice(0, -1), 10) || 1 : 1;
  const items: string[][] = [];
  let current: string[] = [];
  let content = base + marker!.length + 1;
  let rest = lines;
  let done = false;
  while (!done && rest.length) {
    const l = rest[0]!;
    const m = ITEM.exec(l);
    if (m && indentOf(m[1]!) <= base + 1 && isOrdered(m[2]!) === ordered) {
      if (current.length) items.push(current);
      current = [m[3]!];
      content = indentOf(m[1]!) + m[2]!.length + 1;
      rest = rest.slice(1);
    } else if (m && indentOf(m[1]!) <= base) done = true;
    else if (l.trim() === "") {
      const n = rest.slice(1).find((x) => x.trim() !== "");
      const nm = n !== undefined ? ITEM.exec(n) : null;
      if (n !== undefined && (indentOf(n) > base || (nm && indentOf(nm[1]!) <= base + 1 && isOrdered(nm[2]!) === ordered))) { current.push(""); rest = rest.slice(1); }
      else done = true;
    } else if (indentOf(l) > base) { current.push(dedent(l, content)); rest = rest.slice(1); }
    else if (current.length && current[current.length - 1]!.trim() !== "" && !startsBlock(l) && !isTableStart(rest)) { current.push(l.trim()); rest = rest.slice(1); }
    else done = true;
  }
  if (current.length) items.push(current);
  return [{ t: "list", ordered, start, items: items.map(listItem) }, rest];
}

function listItem(lines: string[]): Item {
  const m = TASK.exec(lines[0] ?? "");
  return m ? { done: m[1]!.trim() !== "", blocks: blocks([m[2]!, ...lines.slice(1)]) } : { done: null, blocks: blocks(lines) };
}

const TOKEN = /\*\*(.+?)\*\*(?!\*)|__(.+?)__(?!_)|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*])|(?<![\w*])\*(?!\s)([^*]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)([^_]+?)(?<!\s)_(?![\w_])|~~(.+?)~~/g;

/** Inline marks inside one line. */
export function inlines(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", value: text.slice(last, at) });
    const g = (i: number) => m[i];
    if (g(1) !== undefined || g(2) !== undefined) out.push({ t: "bold", children: inlines(g(1) ?? g(2)!) });
    else if (g(3) !== undefined) out.push({ t: "code", value: g(3)! });
    else if (g(4) !== undefined) out.push({ t: "link", children: inlines(g(4)!), url: g(5)! });
    else if (g(6) !== undefined) out.push({ t: "link", children: [{ t: "text", value: g(6)! }], url: g(6)! });
    else if (g(7) !== undefined || g(8) !== undefined) out.push({ t: "italic", children: inlines(g(7) ?? g(8)!) });
    else if (g(9) !== undefined) out.push({ t: "strike", children: inlines(g(9)!) });
    else out.push({ t: "text", value: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", value: text.slice(last) });
  return out;
}
