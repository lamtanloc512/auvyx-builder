import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { PanelBody } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { gallery } from "@wordpress/icons";
import ServerSideRender from "@wordpress/server-side-render";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { query: Record<string, string>; auvyx?: AuvyxAttribute };

/** Slides are authored in Auvyx Studio. The block editor only previews the published strip. */
function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { query, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Carousel", "auvyx-builder"),
  });
  return (
    <>
      {controls}
      <InspectorControls>
        <PanelBody title={__("Slides", "auvyx-builder")}>
          <p>{__("Edit slides, layout and height in Auvyx Studio.", "auvyx-builder")}</p>
        </PanelBody>
      </InspectorControls>
      <div {...useBlockProps({ className, ref })}>
        <ServerSideRender block="auvyx/carousel" attributes={{ query }} />
      </div>
    </>
  );
}

export const carouselBlock = { metadata, settings: { edit: Edit, save: () => null, icon: gallery } };
