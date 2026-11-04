import { RichText, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { paragraph } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { content?: string; auvyx?: AuvyxAttribute };

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { content, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Text", "auvyx-builder"),
    initialOpen: ["typography", "spacing"],
  });

  return (
    <>
      {controls}
      <RichText
        {...useBlockProps({ className, ref })}
        identifier="content"
        tagName="p"
        value={content}
        onChange={(value) => setAttributes({ content: value })}
        placeholder={__("Write text…", "auvyx-builder")}
      />
    </>
  );
}

function save({ attributes }: { attributes: Attributes }) {
  return <RichText.Content {...useBlockProps.save()} tagName="p" value={attributes.content} />;
}

export const text = { metadata, settings: { edit: Edit, save, icon: paragraph } };
