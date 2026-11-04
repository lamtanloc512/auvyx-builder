import { Button, Modal, TextControl } from "@wordpress/components";
import { useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { useBuilder } from "./store";
import { getBlock } from "./tree";

/** "Create component" from the selected block. */
export function CreateComponentButton() {
  const { state, blocks, actions } = useBuilder();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const selected = state.selectedId ? getBlock(blocks, state.selectedId) : undefined;
  const disabled = !selected || selected.name === "core/block";
  return (
    <>
      <Button variant="primary" className="auvyx-vb-full" disabled={disabled} onClick={() => setOpen(true)}>
        {__("Create component from selection", "auvyx-builder")}
      </Button>
      {open && selected && (
        <Modal title={__("New component", "auvyx-builder")} onRequestClose={() => setOpen(false)} size="small">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void actions.createComponent(selected.clientId, title.trim() || __("Untitled component", "auvyx-builder"));
              setOpen(false);
              setTitle("");
            }}
          >
            <TextControl
              __next40pxDefaultSize
              __nextHasNoMarginBottom
              label={__("Name", "auvyx-builder")}
              value={title}
              placeholder={__("e.g. Promo banner", "auvyx-builder")}
              onChange={setTitle}
            />
            <p className="auvyx-vb-hint">
              {__("The selection is saved as a synced pattern and replaced by an instance. Edit it once, every instance updates.", "auvyx-builder")}
            </p>
            <Button variant="primary" type="submit">
              {__("Create", "auvyx-builder")}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
