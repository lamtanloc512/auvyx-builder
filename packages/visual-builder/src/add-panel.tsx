import { BlockIcon } from "@wordpress/block-editor";
import { getBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { parseContent, useBuilder } from "./store";

const BLOCKS = ["auvyx/section", "auvyx/heading", "auvyx/text", "auvyx/button"];

/** Click to insert: inside the selected container, after the selected block, or at the end. */
export function AddPanel() {
  const { config, actions } = useBuilder();
  return (
    <div className="auvyx-vb-add">
      <h3 className="auvyx-vb-heading">{__("Elements", "auvyx-builder")}</h3>
      <div className="auvyx-vb-add__grid">
        {BLOCKS.map((name) => {
          const type = getBlockType(name);
          return (
            <button key={name} type="button" className="auvyx-vb-tile" onClick={() => actions.insertNew(name)}>
              <BlockIcon icon={type?.icon} />
              <span>{(type?.title ?? name).replace(/^Auvyx /, "")}</span>
            </button>
          );
        })}
      </div>
      {config.patterns.length > 0 && (
        <>
          <h3 className="auvyx-vb-heading">{__("Sections", "auvyx-builder")}</h3>
          {config.patterns.map((pattern) => (
            <button
              key={pattern.name}
              type="button"
              className="auvyx-vb-row-button"
              onClick={() => actions.insertBlocks(parseContent(pattern.content))}
            >
              {pattern.title}
            </button>
          ))}
        </>
      )}
      <p className="auvyx-vb-hint">{__("Tip: select a Section first to insert inside it.", "auvyx-builder")}</p>
    </div>
  );
}
