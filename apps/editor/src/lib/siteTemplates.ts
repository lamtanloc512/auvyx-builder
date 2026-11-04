/**
 * Site templates through the site (WpHost.WpSiteTemplates: auvyx/v1/site-templates, Modules/SiteTemplates) and the context
 * a template's element trees are read in (AiAgent.elementContext with rawMarkup: the page's own blocks keep their markup).
 */
import type { Doc } from "@auvyx/editor-core";
import * as SiteTemplate from "../../../../packages/editor-core/src/siteTemplate";
import type { Context } from "../../../../packages/editor-core/src/elementJson";
import { config } from "./config";
import { rest } from "./host";
import { nextId } from "./ids";
import { isContentField } from "./content.svelte";

export type Summary = SiteTemplate.Summary;

/** Config fields Studio::config prints that this module reads (config.ts types only what the shell needs). */
const extra = config as unknown as { blockTypes?: { name: string }[]; data?: { fields?: { key: string }[] } };

/** SiteTemplateOps.available: the site lets this user use site templates. */
export const available = (): boolean => !!config.siteTemplates && !!config.restRoot;
/** PageTemplatesDialog.available: site templates, and this document is a page (not a component or a template part). */
export const pageTemplatesAvailable = (): boolean => available() && !config.isComponent && !config.isPart;

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));

export async function list(): Promise<Summary[]> {
  const { data } = await rest<{ items?: Record<string, unknown>[] }>("auvyx/v1/site-templates");
  return (data.items ?? []).map((o) => ({
    id: str(o.id), title: str(o.title), description: str(o.description), screenshot: str(o.screenshot),
    pages: Array.isArray(o.pages) ? o.pages.map(str) : [], builtIn: o.builtIn === true,
  }));
}

/** The template's JSON as the site keeps it. */
export const get = (id: string) => rest<{ json?: string }>(`auvyx/v1/site-templates/${id}`).then((r) => str(r.data.json));

/** Where the Studio's placeholder pictures are on this site (Session.assetsUrl). */
const assetsUrl = () => (config.assetsUrl || new URL("placeholders", location.href).href).replace(/\/$/, "");

/** What the site allows a template's element trees to make. */
export function elementContext(): Context {
  const blocks = new Set((extra.blockTypes ?? []).map((t) => t.name));
  const fields = new Set((extra.data?.fields ?? []).map((f) => f.key));
  return {
    newId: nextId,
    canScript: !!config.canScript,
    block: (name) => (blocks.has(name) ? name : undefined),
    html: true, // WordPress keeps core/html blocks
    field: (key) => fields.has(key) || isContentField(key),
    rawMarkup: true,
  };
}

/** Reads a template's text (placeholder pictures pointed at this site): the template, or why it cannot be used. */
export function read(text: string): SiteTemplate.Decoded {
  return SiteTemplate.decode(text.split(SiteTemplate.GENERATED_ASSETS).join(assetsUrl()));
}

/** A page of a template as a document for this page. */
export const pageDocument = (page: SiteTemplate.Page): Doc => SiteTemplate.document(page.elements, elementContext());
