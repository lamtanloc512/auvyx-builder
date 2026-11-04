/**
 * What the site offers the Settings panel (U/Session.scala, the WordPress host's ConfigDecoder): content types with
 * their taxonomies, plugin fields and loop lists (`data`), menus, block types and their attributes, the data sources
 * (REST `auvyx/v1/data-sources`, loaded once and refreshed by the Data sources dialog), the right to add scripts and
 * the edition. Plus ProLock.ask: the one dialog that says what Auvyx Builder Pro adds.
 */
import { DataSources, Settings } from "@auvyx/editor-core";
import editions from "../../../../shared/editions.json";
import { config } from "./config";
import { connected, rest } from "./host";

type DataField = Settings.DataField;
export interface Term { slug: string; name: string }
export interface Taxonomy { slug: string; label: string; terms: Term[] }
export interface ContentType { slug: string; label: string; taxonomies: Taxonomy[] }
export interface ListSource { key: string; label: string; contentType: string }
export interface BlockAttr { name: string; kind: "string" | "boolean" | "integer" | "number"; options: string[]; default?: unknown; pick: string }
export interface BlockType { name: string; title: string; attrs: BlockAttr[]; design: boolean }

const c = config as unknown as Record<string, unknown>;
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
const s = (o: Record<string, unknown>, k: string) => (o[k] == null ? "" : String(o[k]));
const data = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;

/** ConfigDecoder.contentTypes */
export const contentTypes: ContentType[] = list(data.postTypes).map((t) => ({
  slug: s(t, "slug"), label: s(t, "label"),
  taxonomies: list(t.taxonomies).map((x) => ({ slug: s(x, "slug"), label: s(x, "label"), terms: list(x.terms).map((term) => ({ slug: s(term, "slug"), name: s(term, "name") })) })),
}));
/** ConfigDecoder.fields: plugin fields, valid keys and shapes only. */
const pluginFields: DataField[] = list(data.fields).flatMap((f) => {
  const shape = ({ url: "Url", image: "Image", text: "Text" } as Record<string, Settings.Shape>)[s(f, "shape")];
  return shape && Settings.extensionKey(s(f, "key")) ? [{ key: s(f, "key"), label: s(f, "label"), group: s(f, "group"), shape }] : [];
});
/** ConfigDecoder.sources */
const pluginSources: ListSource[] = list(data.sources).map((x) => ({ key: s(x, "key"), label: s(x, "label"), contentType: s(x, "postType") })).filter((x) => Settings.extensionKey(x.key));
/** Session.content is there (the host printed `data`). */
export const hasContent = c.data != null;
/** ConfigDecoder.menus: id and label. */
export const menus: { id: string; label: string }[] = list(c.menus).map((m) => ({ id: s(m, "id"), label: s(m, "label") }));
/** Session.canScript: a host that does not say allows it. */
export const canScript = c.canScript === undefined ? true : !!c.canScript;
/** ConfigDecoder.blockTypes (attributes of a kind with a control; `design`: the block takes Studio styles, ADR 0036). */
export const blockTypes: BlockType[] = list(c.blockTypes).map((t) => ({
  name: s(t, "name"), title: s(t, "title"), design: Array.isArray(t.design),
  attrs: list(t.attributes).flatMap((a) => {
    const kind = ({ string: "string", boolean: "boolean", integer: "integer", number: "number" } as Record<string, BlockAttr["kind"]>)[s(a, "type")];
    return kind ? [{ name: s(a, "name"), kind, options: Array.isArray(a.enum) ? a.enum.map(String) : [], default: a.default, pick: s(a, "pick") }] : [];
  }),
}));
export const blockType = (name: string) => blockTypes.find((b) => b.name === name);
/** ConfigDecoder.convertible: blocks the site can turn into Auvyx elements. */
export const convertible = new Set(Array.isArray(c.convertible) ? c.convertible.map(String) : []);
/** BlockCatalog notes. */
export const SETTINGS_NOTE = "Rendered by WordPress. Styles and other options: block editor.";
export const STATIC_NOTE = "This WordPress block keeps its content in the page. Move, duplicate or delete it here; edit its content in the block editor.";
/** ContentSource.picks or a taxonomy's terms: what a block attribute's picker lists. */
export const pickTerms = (slug: string): Term[] => {
  const picks = (data.picks && typeof data.picks === "object" ? (data.picks as Record<string, unknown>)[slug] : undefined);
  const own = list(picks).map((t) => ({ slug: s(t, "slug"), name: s(t, "name") }));
  return own.length ? own : contentTypes.flatMap((t) => t.taxonomies).find((t) => t.slug === slug)?.terms ?? [];
};
/** The edited post (WpContent.previewItem), when a loop's query asks about the current one. */
export const previewItem = (() => { const p = c.preview as Record<string, unknown> | undefined; return p && p.current != null ? String(p.current) : undefined; })();

// ---- edition (Edition.State, ProLock) ----

const e = c.edition as { pro?: boolean; licensed?: boolean; upgradeUrl?: string; manageUrl?: string } | null | undefined;
export const edition = { pro: e ? !!e.pro : true, licensed: e ? !!e.licensed : true, upgradeUrl: e?.upgradeUrl || editions.upgradeUrl, manageUrl: e?.manageUrl ?? "" };
/** Pro's settings are shown only while Auvyx Builder Pro is installed (docs/editions.md: no locked features in the free plugin). */
export const proShown = edition.pro;
/** ProLock.locked: Pro is installed but its licence is not active, so its settings show and cannot change. */
export const proLocked = edition.pro && !edition.licensed;
export type Feature = keyof typeof editions.features;

class Session {
  /** The site's data sources (Session.dataSourceList). */
  dataSourceList = $state.raw<DataSources.Spec[]>([]);
  /** ProLock.ask: the feature the Pro dialog explains, while it is open. */
  proFeature = $state<Feature | null>(null);
  #loaded = false;

  /** WpHost: the data sources admin is there on every WordPress site with the REST nonce. */
  get dataSources() { return connected; }
  get canEditDataSources() { return !!c.dataSourcesAdmin; }
  /** Session.extraFields: plugins' fields and the data sources'. */
  get extraFields(): DataField[] {
    const seen = new Set<string>();
    return [...pluginFields, ...DataSources.fields(this.dataSourceList)].filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  }
  /** Session.sources: plugins' loop lists and the data sources. */
  get sources(): ListSource[] {
    const seen = new Set<string>();
    return [...pluginSources, ...this.dataSourceList.map((x) => ({ key: DataSources.sourceKey(x.name), label: x.label, contentType: "data" }))].filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  }
  /** Loads the list once (Session.refreshDataSources at start). */
  ensure() { if (!this.#loaded) { this.#loaded = true; this.refresh(); } }
  refresh() {
    if (!connected) return;
    rest<{ items?: unknown[] }>("auvyx/v1/data-sources").then(
      (r) => { this.dataSourceList = (r.data.items ?? []).flatMap((x) => { const sp = DataSources.fromJson(x); return sp ? [sp] : []; }); },
      () => {},
    );
  }
  ask(f: Feature) { this.proFeature = f; }
}
export const session = new Session();
export const feature = (id: Feature) => editions.features[id];
