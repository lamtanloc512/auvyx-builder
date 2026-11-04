import { Button } from "@wordpress/components";
import { __, sprintf } from "@wordpress/i18n";
import { symbol } from "@wordpress/icons";
import { CreateComponentButton } from "./create-component";
import { useBuilder } from "./store";

/** Component library (synced patterns): insert instances, open to edit, create from selection. */
export function ComponentsPanel() {
  const { state, config, actions, dirty } = useBuilder();
  const open = (id: number) => {
    if (dirty && !window.confirm(__("You have unsaved changes. Leave without saving?", "auvyx-builder"))) return;
    window.location.href = `${config.builderUrl}${id}`;
  };
  return (
    <div className="auvyx-vb-components">
      <CreateComponentButton />
      {state.components.length === 0 && (
        <p className="auvyx-vb-empty">
          {__("No components yet. Select a section and choose “Create component” to reuse it anywhere.", "auvyx-builder")}
        </p>
      )}
      {state.components.map((component) => {
        const placed = component.locations.length > 0;
        return (
          <div key={component.id} className={`auvyx-vb-component${component.id === config.postId ? " is-current" : ""}`}>
            <span className="auvyx-vb-component__name">
              {component.title || __("(untitled)", "auvyx-builder")}
              {placed && <span className="auvyx-vb-badge">{__("on site", "auvyx-builder")}</span>}
            </span>
            <span className="auvyx-vb-component__actions">
              <Button
                size="small"
                variant="secondary"
                icon={symbol}
                disabled={component.id === config.postId}
                onClick={() => actions.insertComponent(component.id)}
                /* translators: %s: component title */
                label={sprintf(__("Insert “%s”", "auvyx-builder"), component.title)}
              />
              <Button size="small" variant="tertiary" onClick={() => open(component.id)} disabled={component.id === config.postId}>
                {__("Edit", "auvyx-builder")}
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
