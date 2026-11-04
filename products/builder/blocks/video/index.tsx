import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { PanelBody, Placeholder, TextControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { video } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";
import { embedUrl } from "./embed";

type Attributes = { url: string; auvyx?: AuvyxAttribute };

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { url, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Video", "auvyx-builder"),
    initialOpen: ["size", "border"],
  });
  const embed = embedUrl(url);
  const input = (
    <TextControl
      __next40pxDefaultSize
      __nextHasNoMarginBottom
      label={__("YouTube or Vimeo URL", "auvyx-builder")}
      value={url}
      placeholder="https://www.youtube.com/watch?v=…"
      onChange={(value) => setAttributes({ url: value })}
    />
  );
  return (
    <>
      {controls}
      <InspectorControls>
        <PanelBody title={__("Video", "auvyx-builder")}>{input}</PanelBody>
      </InspectorControls>
      <div {...useBlockProps({ className, ref })}>
        {embed ? (
          <iframe src={embed} title={__("Video", "auvyx-builder")} style={{ pointerEvents: "none" }} />
        ) : (
          <Placeholder icon={video} label={__("Video", "auvyx-builder")}>
            {input}
          </Placeholder>
        )}
      </div>
    </>
  );
}

export const videoBlock = { metadata, settings: { edit: Edit, save: () => null, icon: video } };
