import { RichText, useBlockProps, useInnerBlocksProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { list } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { title?: string; auvyx?: AuvyxAttribute };

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { title, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Accordion", "auvyx-builder"),
    initialOpen: ["spacing", "border"],
  });
  const { children, ...props } = useInnerBlocksProps(useBlockProps({ className, ref }), {
    template: [["auvyx/text", { content: __("Answer goes here.", "auvyx-builder") }]],
  });
  return (
    <>
      {controls}
      {/* Always open while editing; the summary does not toggle so its text can be edited. */}
      <details {...props} open>
        <RichText
          tagName="summary"
          identifier="title"
          value={title}
          onChange={(value) => setAttributes({ title: value })}
          placeholder={__("Question or title", "auvyx-builder")}
          onClick={(event: MouseEvent) => event.preventDefault()}
        />
        {children}
      </details>
    </>
  );
}

function save({ attributes }: { attributes: Attributes }) {
  const { children, ...props } = useInnerBlocksProps.save(useBlockProps.save());
  return (
    <details {...props}>
      <RichText.Content tagName="summary" value={attributes.title} />
      {children}
    </details>
  );
}

export const accordionBlock = { metadata, settings: { edit: Edit, save, icon: list } };
