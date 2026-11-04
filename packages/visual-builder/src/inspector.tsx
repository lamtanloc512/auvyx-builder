import { getBlockType } from "@wordpress/blocks";
import { Button, PanelBody, SelectControl, TextControl, ToggleControl } from "@wordpress/components";
import { useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { StyleEditor, mergePalette } from "@auvyx/block-kit";
import { CreateComponentButton } from "./create-component";
import { LocationsEditor } from "./locations";
import { blockLabel } from "./labels";
import { useBuilder } from "./store";
import { getBlock, type BuilderBlock } from "./tree";

type Tab = "style" | "settings";

export function Inspector() {
  const { state, blocks } = useBuilder();
  const [tab, setTab] = useState<Tab>("style");
  const selected = state.selectedId ? getBlock(blocks, state.selectedId) : undefined;

  if (!selected) return <DocumentSettings />;
  if (selected.name === "core/block") return <InstanceSettings block={selected} />;

  const supportsYb = Boolean(getBlockType(selected.name)?.attributes?.auvyx);
  return (
    <div className="auvyx-vb-inspector">
      <div className="auvyx-vb-inspector__title">{blockLabel(selected, state.components)}</div>
      <div className="auvyx-vb-tabs" role="tablist">
        {(["style", "settings"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
            {id === "style" ? __("Style", "auvyx-builder") : __("Settings", "auvyx-builder")}
          </button>
        ))}
      </div>
      {tab === "style" && supportsYb && <BlockStyle block={selected} />}
      {tab === "style" && !supportsYb && (
        <p className="auvyx-vb-hint auvyx-vb-pad">
          {__("This is a WordPress core block. Its styles are edited in the block editor.", "auvyx-builder")}
        </p>
      )}
      {tab === "settings" && <BlockSettings block={selected} />}
    </div>
  );
}

function BlockStyle({ block }: { block: BuilderBlock }) {
  const { state, config, dispatch, actions } = useBuilder();
  return (
    <StyleEditor
      value={block.attributes.auvyx as AuvyxAttribute | undefined}
      onChange={(next) => actions.setYb(block.clientId, next)}
      breakpoint={state.breakpoint}
      onBreakpointChange={(id) => dispatch({ type: "breakpoint", id })}
      palette={mergePalette(config.palette)}
    />
  );
}

function BlockSettings({ block }: { block: BuilderBlock }) {
  const { actions } = useBuilder();
  const set = (patch: Record<string, unknown>) => actions.updateAttributes(block.clientId, patch, `settings:${block.clientId}`);
  const a = block.attributes;
  const tags = (getBlockType("auvyx/section")?.attributes?.tagName as { enum?: string[] } | undefined)?.enum ?? ["section", "div"];
  return (
    <div className="auvyx-vb-pad auvyx-vb-stack">
      {block.name === "auvyx/section" && (
        <SelectControl
          __next40pxDefaultSize
          __nextHasNoMarginBottom
          label={__("HTML element", "auvyx-builder")}
          value={String(a.tagName ?? "section")}
          options={tags.map((tag) => ({ label: `<${tag}>`, value: tag }))}
          onChange={(value: string) => set({ tagName: value })}
        />
      )}
      {block.name === "auvyx/heading" && (
        <SelectControl
          __next40pxDefaultSize
          __nextHasNoMarginBottom
          label={__("Level", "auvyx-builder")}
          value={String(a.level ?? 2)}
          options={[1, 2, 3, 4, 5, 6].map((level) => ({ label: `H${level}`, value: String(level) }))}
          onChange={(value: string) => set({ level: Number(value) })}
        />
      )}
      {block.name === "auvyx/button" && (
        <>
          <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label={__("Link", "auvyx-builder")} value={String(a.url ?? "")} placeholder="https://" onChange={(value) => set({ url: value || undefined })} />
          <ToggleControl
            __nextHasNoMarginBottom
            label={__("Open in new tab", "auvyx-builder")}
            checked={a.linkTarget === "_blank"}
            onChange={(checked) => set({ linkTarget: checked ? "_blank" : undefined, rel: checked ? "noreferrer noopener" : undefined })}
          />
        </>
      )}
      {getBlockType(block.name)?.supports?.anchor && (
        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label={__("HTML anchor (id)", "auvyx-builder")} value={String(a.anchor ?? "")} onChange={(value) => set({ anchor: value || undefined })} />
      )}
      <p className="auvyx-vb-hint">{__("Double-click text on the canvas to edit it.", "auvyx-builder")}</p>
      <CreateComponentButton />
    </div>
  );
}

function InstanceSettings({ block }: { block: BuilderBlock }) {
  const { state, config, actions, dirty } = useBuilder();
  const component = state.components.find((c) => c.id === Number(block.attributes.ref));
  return (
    <div className="auvyx-vb-inspector">
      <div className="auvyx-vb-inspector__title is-component">{component?.title ?? __("Missing component", "auvyx-builder")}</div>
      <div className="auvyx-vb-pad auvyx-vb-stack">
        <p className="auvyx-vb-hint">
          {__("This is an instance of a component. Changes to the component update every page that uses it.", "auvyx-builder")}
        </p>
        <Button
          variant="primary"
          disabled={!component}
          onClick={() => {
            if (dirty && !window.confirm(__("You have unsaved changes. Leave without saving?", "auvyx-builder"))) return;
            window.location.href = `${config.builderUrl}${component?.id}`;
          }}
        >
          {__("Edit component", "auvyx-builder")}
        </Button>
        <Button variant="secondary" disabled={!component} onClick={() => actions.detach(block.clientId)}>
          {__("Detach (make editable here)", "auvyx-builder")}
        </Button>
      </div>
    </div>
  );
}

function DocumentSettings() {
  const { state, config, dispatch } = useBuilder();
  return (
    <div className="auvyx-vb-inspector">
      <div className="auvyx-vb-inspector__title">{config.isComponent ? __("Component", "auvyx-builder") : __("Page", "auvyx-builder")}</div>
      <div className="auvyx-vb-pad auvyx-vb-stack">
        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label={__("Title", "auvyx-builder")} value={state.title} onChange={(title) => dispatch({ type: "title", title })} />
        <p className="auvyx-vb-hint">{__("Select an element on the canvas or in Layers to style it.", "auvyx-builder")}</p>
      </div>
      {config.isComponent && (
        <PanelBody title={__("Display on site", "auvyx-builder")} initialOpen>
          {config.canEditLocations ? (
            <LocationsEditor />
          ) : (
            <p className="auvyx-vb-hint">{__("Only administrators can place components on the site.", "auvyx-builder")}</p>
          )}
          <p className="auvyx-vb-hint">
            {__("Or use the shortcode", "auvyx-builder")} <code>[auvyx_component id="{config.postId}"]</code>
          </p>
        </PanelBody>
      )}
    </div>
  );
}
