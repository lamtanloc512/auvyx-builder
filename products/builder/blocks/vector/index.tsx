import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { PanelBody, TextareaControl, TextControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { pencil } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { path: string; viewBox: string; auvyx?: AuvyxAttribute };

/** Same filter as render.php: path commands and numbers only. */
export const safePath = (d: string) => (/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/.test(d) ? d : "");

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { path, viewBox, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Vector", "auvyx-builder"),
    initialOpen: ["size"],
  });
  return (
    <>
      {controls}
      <InspectorControls>
        <PanelBody title={__("Vector", "auvyx-builder")} initialOpen={false}>
          <TextareaControl __nextHasNoMarginBottom label={__("Path data", "auvyx-builder")} value={path} onChange={(value) => setAttributes({ path: safePath(value) })} />
          <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="viewBox" value={viewBox} onChange={(value) => setAttributes({ viewBox: value })} />
        </PanelBody>
      </InspectorControls>
      <span {...useBlockProps({ className, ref })} aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} preserveAspectRatio="none">
          <path d={safePath(path)} vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
    </>
  );
}

export const vectorBlock = { metadata, settings: { edit: Edit, save: () => null, icon: pencil } };
