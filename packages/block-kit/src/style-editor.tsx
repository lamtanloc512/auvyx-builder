import { Button, PanelBody, TextControl } from "@wordpress/components";
import { useState } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";
import {
  arrowDown,
  arrowRight,
  blockDefault,
  desktop,
  grid,
  justifySpaceBetween,
  mobile,
  tablet,
  unseen,
} from "@wordpress/icons";
import { countStyles, getStyle, setStyle, setStyles, type AuvyxAttribute } from "@auvyx/block-ops";
import {
  AlignmentMatrix,
  BoxModel,
  ColorField,
  ScrubField,
  Segmented,
  SelectField,
  ValueField,
  type ColorOption,
  type FieldState,
} from "@auvyx/controls";
import {
  STATES,
  isAllowedProperty,
  isSafeValue,
  resolveValue,
  type StateId,
} from "@auvyx/style-engine";
import {
  columnCount,
  columnTemplate,
  layoutMode,
  matrixPatch,
  matrixValue,
  modePatch,
  type LayoutMode,
} from "./auto-layout-model";
import { getDesignSystem } from "./design-system";
import { setEditorUi, useEditorUi } from "./editor-ui";
import { GROUPED_PROPERTIES, STYLE_GROUPS, type StyleField } from "./style-groups";
import { getPanelBreakpoints } from "./use-active-breakpoint";

const DEVICE_ICONS = [desktop, tablet, mobile];

export const STATE_LABELS: Record<StateId, string> = {
  default: __("Default", "auvyx-builder"),
  hover: __("Hover", "auvyx-builder"),
  focus: __("Focus", "auvyx-builder"),
  active: __("Active", "auvyx-builder"),
};

const LAYOUT_OPTIONS = [
  { value: "block", label: __("Block", "auvyx-builder"), icon: blockDefault },
  { value: "row", label: __("Horizontal (flex row)", "auvyx-builder"), icon: arrowRight },
  { value: "column", label: __("Vertical (flex column)", "auvyx-builder"), icon: arrowDown },
  { value: "grid", label: __("Grid", "auvyx-builder"), icon: grid },
  { value: "none", label: __("Hidden", "auvyx-builder"), icon: unseen },
];

type PresetLike = { slug?: string; name?: string; color?: string };

/** Theme palette (list or origin map, depending on WP version) + Auvyx tokens, deduplicated by slug. */
export const mergePalette = (raw: unknown): ColorOption[] => {
  const list: PresetLike[] = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === "object"
      ? Object.values(raw as Record<string, PresetLike[]>).flat()
      : [];
  const options = new Map<string, ColorOption>();
  for (const preset of [...list, ...getDesignSystem().tokens.color]) {
    if (preset.slug && preset.color && !options.has(preset.slug)) {
      options.set(preset.slug, { slug: preset.slug, name: preset.name ?? preset.slug, color: preset.color });
    }
  }
  return [...options.values()];
};

export type StyleEditorProps = {
  value: AuvyxAttribute | undefined;
  onChange: (next: AuvyxAttribute | undefined) => void;
  /** Breakpoint being edited, and how to switch it (editor device preview, builder canvas width…). */
  breakpoint: string;
  onBreakpointChange: (id: string) => void;
  palette: readonly ColorOption[];
  /** Group ids opened by default. */
  initialOpen?: readonly string[];
};

/** Host-agnostic style editor: used in the block editor inspector and in the visual builder. */
export function StyleEditor({
  value,
  onChange,
  breakpoint,
  onBreakpointChange: setBreakpoint,
  palette,
  initialOpen = ["layout", "spacing"],
}: StyleEditorProps) {
  const breakpoints = getPanelBreakpoints();
  const allBreakpoints = getDesignSystem().breakpoints;
  const { styleState: state } = useEditorUi();
  const styles = value?.styles ?? {};
  const target = { breakpoint, state };

  const placeholderFor = (property: string) =>
    resolveValue(styles, allBreakpoints, breakpoint, state, property)?.value ??
    (state === "default"
      ? undefined
      : resolveValue(styles, allBreakpoints, breakpoint, "default", property)?.value);

  const own = (property: string) => getStyle(value, target, property);
  const resolve = (property: string) => own(property) ?? placeholderFor(property);
  const field = (property: string): FieldState => ({
    value: own(property),
    placeholder: placeholderFor(property),
    onChange: (next) => onChange(setStyle(value, target, property, next)),
  });
  const patch = (values: Record<string, string | undefined>) => onChange(setStyles(value, target, values));

  const renderField = (definition: StyleField) => {
    const props = { label: definition.label, help: definition.help, ...field(definition.property) };
    if (definition.type === "select") {
      return <SelectField {...props} options={definition.options ?? []} />;
    }
    if (definition.type === "color") {
      return <ColorField {...props} palette={palette} />;
    }
    if (definition.scrub) {
      return <ScrubField {...props} scrub={definition.scrub} />;
    }
    return <ValueField {...props} />;
  };

  const currentDeclarations = styles[breakpoint]?.[state] ?? {};
  const otherProperties = Object.keys(currentDeclarations).filter((p) => !GROUPED_PROPERTIES.has(p));
  const activeLabel = breakpoints.find((bp) => bp.id === breakpoint)?.label ?? breakpoint;

  const renderAutoLayout = () => {
    const ownMode = own("display") === undefined ? undefined : layoutMode(own);
    const mode = layoutMode(resolve);
    const isFlex = mode === "row" || mode === "column";
    const axisMode = isFlex || mode === "grid" ? mode : undefined;
    const columns = field("grid-template-columns");
    return (
      <div className="auvyx-style-panel__stack">
        <Segmented
          label={__("Layout", "auvyx-builder")}
          options={LAYOUT_OPTIONS}
          value={ownMode}
          inherited={mode}
          onChange={(next) => patch(modePatch(next as LayoutMode | undefined))}
        />
        {axisMode && (
          <div className="auvyx-auto-layout">
            <AlignmentMatrix
              value={matrixValue(axisMode, resolve)}
              onChange={(x, y) => patch(matrixPatch(axisMode, x, y))}
            />
            <div className="auvyx-auto-layout__side">
              <ScrubField label={__("Gap", "auvyx-builder")} scrub={{ unit: "px", min: 0 }} {...field("gap")} />
              {mode === "grid" && (
                <ScrubField
                  label={__("Columns", "auvyx-builder")}
                  scrub={{ unit: "", min: 1 }}
                  value={columnCount(columns.value)}
                  placeholder={columnCount(columns.placeholder)}
                  onChange={(next) => columns.onChange(columnTemplate(next))}
                />
              )}
              {isFlex && (
                <div className="auvyx-segmented">
                  <Button
                    size="compact"
                    icon={justifySpaceBetween}
                    label={__("Space between", "auvyx-builder")}
                    showTooltip
                    isPressed={resolve("justify-content") === "space-between"}
                    onClick={() =>
                      patch({
                        "justify-content":
                          resolve("justify-content") === "space-between" ? "flex-start" : "space-between",
                      })
                    }
                  />
                  <Button
                    size="compact"
                    isPressed={resolve("flex-wrap") === "wrap"}
                    onClick={() => patch({ "flex-wrap": resolve("flex-wrap") === "wrap" ? undefined : "wrap" })}
                  >
                    {__("Wrap", "auvyx-builder")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBoxModel = () => (
    <BoxModel
      margin={{
        top: field("margin-block-start"),
        right: field("margin-inline-end"),
        bottom: field("margin-block-end"),
        left: field("margin-inline-start"),
      }}
      padding={{
        top: field("padding-block-start"),
        right: field("padding-inline-end"),
        bottom: field("padding-block-end"),
        left: field("padding-inline-start"),
      }}
      center={activeLabel}
    />
  );

  return (
    <div className="auvyx-style-editor">
      <div className="auvyx-style-panel__bar">
        <div className="auvyx-segmented" role="group" aria-label={__("Breakpoint", "auvyx-builder")}>
          {breakpoints.map((bp, index) => (
            <Button
              key={bp.id}
              size="compact"
              icon={DEVICE_ICONS[index]}
              label={bp.maxWidth ? `${bp.label} (≤ ${bp.maxWidth}px)` : bp.label}
              isPressed={bp.id === breakpoint}
              className={styles[bp.id] ? "has-styles" : undefined}
              onClick={() => setBreakpoint(bp.id)}
            />
          ))}
        </div>
        <div className="auvyx-segmented" role="group" aria-label={__("State", "auvyx-builder")}>
          {STATES.map((id) => (
            <Button
              key={id}
              size="compact"
              isPressed={id === state}
              className={styles[breakpoint]?.[id] ? "has-styles" : undefined}
              onClick={() => setEditorUi({ styleState: id })}
            >
              {STATE_LABELS[id]}
            </Button>
          ))}
        </div>
        <div className="auvyx-style-panel__target">
          <span>
            {/* translators: 1: breakpoint label, 2: state label */}
            {sprintf(__("Editing %1$s · %2$s", "auvyx-builder"), activeLabel, STATE_LABELS[state])}
          </span>
          {Object.keys(currentDeclarations).length > 0 && (
            <Button
              variant="link"
              isDestructive
              onClick={() =>
                patch(Object.fromEntries(Object.keys(currentDeclarations).map((p) => [p, undefined])))
              }
            >
              {__("Reset", "auvyx-builder")}
            </Button>
          )}
        </div>
      </div>

      {STYLE_GROUPS.map((group) => {
        const count = countStyles(
          value,
          target,
          group.fields.map((f) => f.property)
        );
        return (
          <PanelBody
            key={group.id}
            title={count > 0 ? `${group.title} (${count})` : group.title}
            initialOpen={initialOpen.includes(group.id)}
          >
            {group.custom === "auto-layout" && renderAutoLayout()}
            {group.custom === "box-model" && renderBoxModel()}
            {group.custom === undefined && (
              <div className="auvyx-style-panel__fields">
                {group.fields
                  .filter((definition) => definition.when?.(resolve) ?? true)
                  .map((definition) => (
                    <div key={definition.property} className={definition.half ? "is-half" : "is-full"}>
                      {renderField(definition)}
                    </div>
                  ))}
              </div>
            )}
          </PanelBody>
        );
      })}

      <PanelBody
        title={
          otherProperties.length > 0
            ? `${__("Other CSS", "auvyx-builder")} (${otherProperties.length})`
            : __("Other CSS", "auvyx-builder")
        }
        initialOpen={false}
      >
        <div className="auvyx-style-panel__fields">
          {otherProperties.map((property) => (
            <div key={property} className="is-full">
              <ValueField label={property} {...field(property)} />
            </div>
          ))}
          <AddProperty onAdd={(property, next) => onChange(setStyle(value, target, property, next))} />
        </div>
      </PanelBody>
    </div>
  );
}

function AddProperty({ onAdd }: { onAdd: (property: string, value: string) => void }) {
  const [property, setProperty] = useState("");
  const [value, setValue] = useState("");
  const name = property.trim();
  const error =
    name === "" || value.trim() === ""
      ? undefined
      : !isAllowedProperty(name)
        ? __("Property not allowed.", "auvyx-builder")
        : !isSafeValue(value.trim())
          ? __("Value not allowed.", "auvyx-builder")
          : undefined;
  return (
    <div className="is-full auvyx-style-panel__add">
      <TextControl
        __next40pxDefaultSize
        __nextHasNoMarginBottom
        label={__("Property", "auvyx-builder")}
        value={property}
        placeholder="aspect-ratio"
        onChange={setProperty}
      />
      <TextControl
        __next40pxDefaultSize
        __nextHasNoMarginBottom
        label={__("Value", "auvyx-builder")}
        value={value}
        placeholder="16 / 9"
        onChange={setValue}
      />
      {error && <p className="auvyx-style-panel__error">{error}</p>}
      <Button
        variant="secondary"
        disabled={name === "" || value.trim() === "" || error !== undefined}
        onClick={() => {
          onAdd(name, value.trim());
          setProperty("");
          setValue("");
        }}
      >
        {__("Add", "auvyx-builder")}
      </Button>
    </div>
  );
}
