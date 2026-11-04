import { BlockControls, RichText, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { ToolbarDropdownMenu, ToolbarGroup } from "@wordpress/components";
import { __, sprintf } from "@wordpress/i18n";
import {
  heading,
  headingLevel1,
  headingLevel2,
  headingLevel3,
  headingLevel4,
  headingLevel5,
  headingLevel6,
} from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { content?: string; level: number; auvyx?: AuvyxAttribute };

const LEVEL_ICONS = [headingLevel1, headingLevel2, headingLevel3, headingLevel4, headingLevel5, headingLevel6];

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { content, level, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Heading", "auvyx-builder"),
    initialOpen: ["typography", "spacing"],
  });
  const blockProps = useBlockProps({ className, ref });

  return (
    <>
      <BlockControls group="block">
        <ToolbarGroup>
          <ToolbarDropdownMenu
            icon={LEVEL_ICONS[level - 1] ?? heading}
            label={__("Change level", "auvyx-builder")}
            controls={LEVEL_ICONS.map((icon, index) => ({
              icon,
              /* translators: %d: heading level */
              title: sprintf(__("Heading %d", "auvyx-builder"), index + 1),
              isActive: level === index + 1,
              onClick: () => setAttributes({ level: index + 1 }),
            }))}
          />
        </ToolbarGroup>
      </BlockControls>
      {controls}
      <RichText
        {...blockProps}
        identifier="content"
        tagName={`h${level}`}
        value={content}
        onChange={(value) => setAttributes({ content: value })}
        placeholder={__("Heading", "auvyx-builder")}
      />
    </>
  );
}

function save({ attributes }: { attributes: Attributes }) {
  return (
    <RichText.Content
      {...useBlockProps.save()}
      tagName={`h${attributes.level}`}
      value={attributes.content}
    />
  );
}

export const headingBlock = { metadata, settings: { edit: Edit, save, icon: heading } };
