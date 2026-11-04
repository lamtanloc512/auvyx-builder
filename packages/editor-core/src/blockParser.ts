/**
 * WordPress block markup → parsed blocks, as `parse_blocks()` (WP_Block_Parser) answers them: the same tokenizer, the
 * same freeform blocks for HTML between top-level blocks, the same `innerHTML` / `innerContent`. Each block also carries
 * where it sits in the source (`start`/`end`), so a platform block can be kept byte for byte.
 */

export interface ParsedBlock {
  /** `namespace/name` (a bare name is `core/…`); null for freeform HTML. */
  blockName: string | null;
  attrs: Record<string, unknown>;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  /** HTML chunks, with null where an inner block sits. */
  innerContent: (string | null)[];
  /** The block's source span, its comments included. */
  start: number;
  end: number;
}

/**
 * The block comment, as WP_Block_Parser's (and @wordpress/block-serialization-default-parser's) tokenizer: the atomic
 * group of the PHP pattern written with a lookahead + backreference, which JavaScript lacks.
 */
const TOKENIZER =
  /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+({(?:(?=([^}]+|}+(?=})|(?!}\s+\/?-->)[^])*)\5|[^]*?)}\s+)?(\/)?-->/g;

type Token =
  | { type: "no-more-tokens" }
  | { type: "void-block" | "block-opener" | "block-closer"; name: string; attrs: Record<string, unknown>; start: number; length: number };

interface Frame { block: ParsedBlock; tokenStart: number; tokenLength: number; prevOffset: number; leadingHtmlStart: number | null }

const parseAttrs = (json: string | undefined): Record<string, unknown> => {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    // json_decode(…, true): only an object (or array) is attributes; anything else is none
    return v !== null && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

export function parseBlocks(document: string): ParsedBlock[] {
  let offset = 0;
  const output: ParsedBlock[] = [];
  const stack: Frame[] = [];

  const block = (blockName: string | null, attrs: Record<string, unknown>, innerHTML: string, start: number, end: number): ParsedBlock =>
    ({ blockName, attrs, innerBlocks: [], innerHTML, innerContent: innerHTML === "" && blockName !== null ? [] : [innerHTML], start, end });

  const nextToken = (): Token => {
    TOKENIZER.lastIndex = offset;
    const m = TOKENIZER.exec(document);
    if (!m) return { type: "no-more-tokens" };
    const [match, closer, namespace, name, attrsJson, , voidMark] = m;
    const full = `${namespace ?? "core/"}${name}`;
    const start = m.index;
    const attrs = parseAttrs(attrsJson);
    if (voidMark) return { type: "void-block", name: full, attrs, start, length: match.length };
    if (closer) return { type: "block-closer", name: full, attrs: {}, start, length: match.length };
    return { type: "block-opener", name: full, attrs, start, length: match.length };
  };

  const addFreeform = (length?: number) => {
    const html = length === undefined ? document.slice(offset) : document.substr(offset, length);
    if (!html) return;
    output.push({ blockName: null, attrs: {}, innerBlocks: [], innerHTML: html, innerContent: [html], start: offset, end: offset + html.length });
  };

  const addInnerBlock = (b: ParsedBlock, tokenStart: number, tokenLength: number, lastOffset?: number) => {
    const parent = stack[stack.length - 1]!;
    parent.block.innerBlocks.push(b);
    const html = document.substr(parent.prevOffset, tokenStart - parent.prevOffset);
    if (html) {
      parent.block.innerHTML += html;
      parent.block.innerContent.push(html);
    }
    parent.block.innerContent.push(null);
    parent.prevOffset = lastOffset ?? tokenStart + tokenLength;
  };

  const addBlockFromStack = (endOffset?: number) => {
    const frame = stack.pop()!;
    const { block: b, leadingHtmlStart } = frame;
    const html = endOffset !== undefined ? document.substr(frame.prevOffset, endOffset - frame.prevOffset) : document.slice(frame.prevOffset);
    if (html) {
      b.innerHTML += html;
      b.innerContent.push(html);
    }
    if (leadingHtmlStart !== null) {
      const lead = document.substr(leadingHtmlStart, frame.tokenStart - leadingHtmlStart);
      output.push({ blockName: null, attrs: {}, innerBlocks: [], innerHTML: lead, innerContent: [lead], start: leadingHtmlStart, end: frame.tokenStart });
    }
    output.push(b);
  };

  const proceed = (): boolean => {
    const t = nextToken();
    const depth = stack.length;
    const leadingHtmlStart = t.type !== "no-more-tokens" && t.start > offset ? offset : null;
    switch (t.type) {
      case "no-more-tokens":
        if (depth === 0) { addFreeform(); return false; }
        if (depth === 1) { addBlockFromStack(); return false; }
        while (stack.length > 0) addBlockFromStack();
        return false;
      case "void-block": {
        const b = block(t.name, t.attrs, "", t.start, t.start + t.length);
        if (depth === 0) {
          if (leadingHtmlStart !== null) {
            const lead = document.substr(leadingHtmlStart, t.start - leadingHtmlStart);
            output.push({ blockName: null, attrs: {}, innerBlocks: [], innerHTML: lead, innerContent: [lead], start: leadingHtmlStart, end: t.start });
          }
          output.push(b);
          offset = t.start + t.length;
          return true;
        }
        addInnerBlock(b, t.start, t.length);
        offset = t.start + t.length;
        return true;
      }
      case "block-opener":
        stack.push({ block: block(t.name, t.attrs, "", t.start, t.start + t.length), tokenStart: t.start, tokenLength: t.length, prevOffset: t.start + t.length, leadingHtmlStart });
        offset = t.start + t.length;
        return true;
      case "block-closer": {
        if (depth === 0) { addFreeform(); return false; }
        const frame = stack[depth - 1]!;
        frame.block.end = t.start + t.length;
        if (depth === 1) {
          addBlockFromStack(t.start);
          offset = t.start + t.length;
          return true;
        }
        const popped = stack.pop()!;
        const html = document.substr(popped.prevOffset, t.start - popped.prevOffset);
        if (html) {
          popped.block.innerHTML += html;
          popped.block.innerContent.push(html);
        }
        popped.prevOffset = t.start + t.length;
        addInnerBlock(popped.block, popped.tokenStart, popped.tokenLength, t.start + t.length);
        offset = t.start + t.length;
        return true;
      }
    }
  };

  while (proceed()) { /* tokens */ }
  return output;
}
