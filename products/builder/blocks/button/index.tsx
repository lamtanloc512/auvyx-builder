import { InspectorControls, RichText, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { PanelBody, TextControl, ToggleControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { button } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = {
  text?: string;
  url?: string;
  linkTarget?: string;
  rel?: string;
  auvyx?: AuvyxAttribute;
};

const NEW_TAB_REL = "noreferrer noopener";

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { text, url, linkTarget, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Button", "auvyx-builder"),
    initialOpen: ["typography", "background", "spacing"],
  });

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Link", "auvyx-builder")}>
          <TextControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label={__("URL", "auvyx-builder")}
            type="url"
            value={url ?? ""}
            placeholder="https://"
            onChange={(value) => setAttributes({ url: value === "" ? undefined : value })}
          />
          <ToggleControl
            __nextHasNoMarginBottom
            label={__("Open in new tab", "auvyx-builder")}
            checked={linkTarget === "_blank"}
            onChange={(checked) =>
              setAttributes({
                linkTarget: checked ? "_blank" : undefined,
                rel: checked ? NEW_TAB_REL : undefined,
              })
            }
          />
        </PanelBody>
      </InspectorControls>
      {controls}
      <RichText
        {...useBlockProps({ className, ref })}
        identifier="text"
        tagName="a"
        value={text}
        onChange={(value) => setAttributes({ text: value })}
        placeholder={__("Button text", "auvyx-builder")}
        allowedFormats={["core/bold", "core/italic"]}
        withoutInteractiveFormatting
      />
    </>
  );
}

function save({ attributes }: { attributes: Attributes }) {
  return (
    <RichText.Content
      {...useBlockProps.save()}
      tagName="a"
      href={attributes.url}
      target={attributes.linkTarget}
      rel={attributes.rel}
      value={attributes.text}
    />
  );
}

export const buttonBlock = { metadata, settings: { edit: Edit, save, icon: button } };
