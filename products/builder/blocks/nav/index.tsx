import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { PanelBody, SelectControl, TextControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { navigation } from "@wordpress/icons";
import ServerSideRender from "@wordpress/server-side-render";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { source: string; toggleAt: string; auvyx?: AuvyxAttribute };

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { source, toggleAt, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Navigation", "auvyx-builder"),
  });
  return (
    <>
      {controls}
      <InspectorControls>
        <PanelBody title={__("Menu", "auvyx-builder")}>
          <TextControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label={__("Source (pages, nav:ID, menu:ID)", "auvyx-builder")}
            value={source}
            onChange={(value) => setAttributes({ source: value })}
          />
          <SelectControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label={__("Menu button on", "auvyx-builder")}
            value={toggleAt as "mobile"}
            options={[
              { label: __("Mobile", "auvyx-builder"), value: "mobile" },
              { label: __("Tablet and mobile", "auvyx-builder"), value: "tablet" },
              { label: __("Never", "auvyx-builder"), value: "never" },
            ]}
            onChange={(value: string) => setAttributes({ toggleAt: value })}
          />
        </PanelBody>
      </InspectorControls>
      <div {...useBlockProps({ className, ref })}>
        <ServerSideRender block="auvyx/nav" attributes={{ source, toggleAt }} />
      </div>
    </>
  );
}

export const navBlock = { metadata, settings: { edit: Edit, save: () => null, icon: navigation } };
