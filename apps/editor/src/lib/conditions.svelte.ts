/**
 * Display Conditions of a Theme Builder header or footer (U/ConditionsDialog.scala, host WpThemeBuilder,
 * docs/theme-builder.md): the template being edited (`themePart` in Studio::config), the rows the dialog edits, and
 * saving them to `auvyx/v1/theme-builder/<id>`.
 */
import { config } from "./config";
import { rest } from "./host";
import { toast } from "./toast.svelte";

/** One condition: Include / Exclude one rule. `extra` is the platform's own JSON for what the dialog does not edit, kept. */
export interface PartCondition { include: boolean; rule: string; ids: string[]; postTypes: string[]; extra: string }
/** A header or footer template: its kind, conditions, the conditions in words ("" = shown nowhere), the other templates for the same pages. */
export interface ThemePart { kind: string; conditions: PartCondition[]; summary: string; conflicts: string[] }

type Raw = Record<string, unknown>;
const list = (o: Raw | undefined, k: string): Raw[] => (Array.isArray(o?.[k]) ? (o![k] as Raw[]) : []);
const s = (o: Raw | undefined, k: string) => (o?.[k] == null ? "" : String(o[k]));

const condition = (o: Raw): PartCondition => ({
  include: s(o, "type") !== "exclude", rule: s(o, "rule"), ids: list(o, "ids").map(String), postTypes: list(o, "postTypes").map(String), extra: JSON.stringify(o),
});
const toPart = (o: Raw): ThemePart => ({ kind: s(o, "type"), conditions: list(o, "conditions").map(condition), summary: s(o, "summary"), conflicts: list(o, "conflicts").map(String) });

const part = (config as unknown as { themePart?: Raw | null }).themePart ?? undefined;

/** What the dialog offers: rules (value, label, Pro), pages and kinds of post. */
export const conditionOptions = {
  rules: list(part, "rules").map((o) => ({ value: s(o, "value"), label: s(o, "label"), pro: o.pro === true })),
  pages: list(part, "pages").map((o) => [s(o, "value"), s(o, "label")] as [string, string]),
  postTypes: list(part, "postTypes").map((o) => [s(o, "value"), s(o, "label")] as [string, string]),
  builderUrl: s(part, "builderUrl"),
};

export const newCondition = (): PartCondition => ({ include: true, rule: "all", ids: [], postTypes: [], extra: "" });

class Conditions {
  /** The template being edited, kept current after a save (the top bar shows its dot and words). */
  current = $state<ThemePart | null>(part ? toPart(part) : null);
  open = $state(false);
  rows = $state<PartCondition[]>([]);
  saving = $state(false);
  error = $state("");
  /** Which row's page list is unfolded. */
  picking = $state<number | null>(null);
  query = $state("");

  get available() { return this.current !== null; }
  get kind() { return this.current?.kind ?? "header"; }
  get word() { return this.kind === "footer" ? "footer" : "header"; }

  show() {
    const p = this.current;
    if (!p) return;
    this.rows = p.conditions.length ? p.conditions.map((c) => ({ ...c })) : [newCondition()];
    this.error = "";
    this.picking = null;
    this.open = true;
  }

  /** After Publish: a template with no conditions shows nowhere, so ask where (Elementor's Publish Settings). */
  afterPublish() { if (this.current && !this.current.conditions.length) this.show(); }

  /** `?auvyx-conditions=1`: the Theme Builder's "Edit Conditions" opens the editor on this dialog. */
  fromLink() { if (this.available && new URLSearchParams(location.search).get("auvyx-conditions") === "1") this.show(); }

  update(i: number, f: (c: PartCondition) => PartCondition) { this.rows = this.rows.map((r, j) => (j === i ? f(r) : r)); }

  async save() {
    this.saving = true;
    this.error = "";
    // A Specific Pages row with no page names nothing: leave it out.
    const clean = this.rows.filter((r) => !(r.rule === "ids" && !r.ids.length));
    const rows = clean.map((c) => {
      const o = (c.extra ? JSON.parse(c.extra) : {}) as Raw;
      o.type = c.include ? "include" : "exclude";
      o.rule = c.rule;
      o.ids = c.ids.filter((x) => /^[+-]?\d{1,10}$/.test(x)).map(Number);
      o.postTypes = [...c.postTypes];
      return o;
    });
    try {
      const { data } = await rest<Raw>(`auvyx/v1/theme-builder/${config.postId}`, { method: "POST", body: JSON.stringify({ conditions: rows }) });
      const p = toPart(data);
      this.saving = false;
      this.current = p;
      this.open = false;
      toast(p.summary ? `This ${this.word} shows on: ${p.summary}` : `This ${this.word} shows nowhere for now.`);
    } catch (e) {
      this.saving = false;
      this.error = (e as Error).message;
    }
  }
}

export const conditions = new Conditions();
