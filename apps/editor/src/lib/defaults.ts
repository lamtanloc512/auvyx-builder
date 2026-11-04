/** Click-to-insert defaults: the Studio's (U/Store.scala object Defaults), value for value. */
import { el, setStyle, type El, type Kind } from "@auvyx/editor-core";
import type { Styles } from "@auvyx/style-engine";
import { config } from "./config";
import { nextId } from "./ids";

export interface Built { root: El; nodes: Record<string, El> }

const headingFont = "var(--wp--preset--font-family--auvyx-heading, inherit)";
const bodyFont = "var(--wp--preset--font-family--auvyx-body, inherit)";
const ink = "var(--wp--preset--color--auvyx-text)";
const base = (decls: Record<string, string>): Styles => ({ base: { default: decls } });
/** A little air under a new primitive, so stacked text and buttons are not flush. */
const breath = () => base({ "margin-block-end": "12px" });
const withBreath = (decls: [string, string][]) => decls.reduce((s, [p, v]) => setStyle(s, "base", "default", p, v), breath());

export function node(kind: Kind): El {
  const id = nextId();
  switch (kind) {
    case "Section":
      return el(id, "Section", { styles: base({ display: "flex", "flex-direction": "column", gap: "16px", "padding-block-start": "32px", "padding-block-end": "32px", "padding-inline-start": "32px", "padding-inline-end": "32px" }) });
    case "Heading": return el(id, "Heading", { text: "Heading", styles: withBreath([["color", ink], ["font-family", headingFont]]) });
    case "Text": return el(id, "Text", { text: "Write something here.", styles: withBreath([["color", ink], ["font-family", bodyFont]]) });
    case "Button": return el(id, "Button", { text: "Button", href: "#", styles: withBreath([["font-family", bodyFont], ["border-radius", "var(--wp--custom--radius--md, 0)"]]) });
    case "Image": return el(id, "Image", { src: `${config.assetsUrl ?? ""}/landscape.svg`, alt: "", styles: withBreath([["background-color", "var(--wp--preset--color--auvyx-surface)"], ["border-radius", "var(--wp--custom--radius--md, 0)"]]) });
    case "Icon": return el(id, "Icon", { icon: "star", styles: base({ color: "var(--wp--preset--color--auvyx-primary)" }) });
    case "Divider": return el(id, "Divider", { styles: base({ "border-top-color": "var(--wp--preset--color--auvyx-border)" }) });
    case "Video": return el(id, "Video", { src: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", styles: base({ "border-radius": "var(--wp--custom--radius--lg, 0)" }) });
    case "Path": return el(id, "Path", { src: "M50 0L100 100H0Z", alt: "0 0 100 100" });
    case "Accordion": return el(id, "Accordion", { text: "Question or title", styles: base({ color: ink, "border-color": "var(--wp--preset--color--auvyx-border)", "font-family": headingFont }) });
    case "Nav": return el(id, "Nav", { src: "pages", alt: "mobile", styles: base({ color: ink, "font-family": bodyFont }) });
    default: return el(id, kind);
  }
}

/** Element plus any children it starts with (an accordion starts with an answer). */
export function built(kind: Kind): Built {
  if (kind === "Accordion") {
    const answer = el(nextId(), "Text", { text: "Answer goes here.", styles: base({ color: "var(--wp--preset--color--auvyx-muted)", "font-family": "var(--wp--preset--font-family--auvyx-body, inherit)" }) });
    const root = el(nextId(), "Accordion", { text: "Question or title", children: [answer.id], styles: base({ color: "var(--wp--preset--color--auvyx-text)", "border-color": "var(--wp--preset--color--auvyx-border)", "font-family": "var(--wp--preset--font-family--auvyx-heading, inherit)" }) });
    return { root, nodes: { [answer.id]: answer } };
  }
  return { root: node(kind), nodes: {} };
}

/** Page-level inserts stay in normal flow; a top-level section spans the page (align full). */
export const pageLevel = (n: El): El => (n.align || (n.kind !== "Section" && n.kind !== "Carousel") ? n : { ...n, align: "full" });
