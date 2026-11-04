import { BlockIcon } from "@wordpress/block-editor";
import { getBlockType } from "@wordpress/blocks";
import { Button } from "@wordpress/components";
import { useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { copy, trash } from "@wordpress/icons";
import type { DragEvent } from "react";
import { blockLabel, blockPreview } from "./labels";
import { useBuilder } from "./store";
import { flatten, isContainer, type Placement } from "./tree";

type Drop = { id: string; placement: Placement } | null;

/** Layers (navigator): select, hover, drag to reorder/reparent. */
export function Layers() {
  const { state, blocks, actions } = useBuilder();
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const rows = flatten(blocks);

  const placementFor = (event: DragEvent<HTMLElement>, name: string): Placement => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    if (isContainer(name) && ratio > 0.3 && ratio < 0.7) return "inside";
    return ratio < 0.5 ? "before" : "after";
  };

  if (rows.length === 0) {
    return <p className="auvyx-vb-empty">{__("Empty page. Add blocks from the Add tab.", "auvyx-builder")}</p>;
  }

  return (
    <div className="auvyx-vb-layers" role="tree" onMouseLeave={() => actions.hover(undefined)}>
      {rows.map(({ block, depth }) => {
        const type = getBlockType(block.name);
        const isDrop = drop?.id === block.clientId;
        return (
          <div
            key={block.clientId}
            role="treeitem"
            aria-selected={state.selectedId === block.clientId}
            tabIndex={0}
            draggable
            className={[
              "auvyx-vb-layer",
              state.selectedId === block.clientId ? "is-selected" : "",
              state.hoveredId === block.clientId ? "is-hovered" : "",
              block.name === "core/block" ? "is-component" : "",
              dragId === block.clientId ? "is-dragging" : "",
              isDrop ? `is-drop-${drop?.placement}` : "",
            ].join(" ")}
            style={{ paddingInlineStart: 8 + depth * 14 }}
            onClick={() => actions.select(block.clientId)}
            onMouseEnter={() => actions.hover(block.clientId)}
            onKeyDown={(event) => event.key === "Enter" && actions.select(block.clientId)}
            onDragStart={(event) => {
              setDragId(block.clientId);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", block.clientId);
            }}
            onDragOver={(event) => {
              if (!dragId || dragId === block.clientId) return;
              event.preventDefault();
              setDrop({ id: block.clientId, placement: placementFor(event, block.name) });
            }}
            onDragLeave={() => setDrop((current) => (current?.id === block.clientId ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragId && drop) actions.move(dragId, drop.id, drop.placement);
              setDragId(null);
              setDrop(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDrop(null);
            }}
          >
            <span className="auvyx-vb-layer__icon">
              <BlockIcon icon={type?.icon} />
            </span>
            <span className="auvyx-vb-layer__name">{blockLabel(block, state.components)}</span>
            <span className="auvyx-vb-layer__preview">{blockPreview(block)}</span>
            {state.selectedId === block.clientId && (
              <span className="auvyx-vb-layer__actions">
                <Button size="small" icon={copy} label={__("Duplicate (⌘D)", "auvyx-builder")} onClick={() => actions.duplicate(block.clientId)} />
                <Button size="small" icon={trash} label={__("Delete (⌫)", "auvyx-builder")} onClick={() => actions.remove(block.clientId)} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
