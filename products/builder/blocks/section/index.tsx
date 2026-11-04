import {
  InnerBlocks,
  InspectorControls,
  useBlockProps,
  useInnerBlocksProps,
} from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { SelectControl } from "@wordpress/components";
import { useSelect } from "@wordpress/data";
import { __ } from "@wordpress/i18n";
import { group } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { tagName: string; auvyx?: AuvyxAttribute };

const TAGS = metadata.attributes.tagName.enum;

function Edit({ attributes, setAttributes, clientId, isSelected }: BlockEditProps<Attributes>) {
  const { tagName: TagName = "section", auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Section", "auvyx-builder"),
  });
  const hasChildren = useSelect(
    (select) =>
      (select("core/block-editor") as { getBlockCount: (id: string) => number }).getBlockCount(
        clientId
      ) > 0,
    [clientId]
  );
  const innerBlocksProps = useInnerBlocksProps(useBlockProps({ className, ref }), {
    renderAppender: hasChildren ? undefined : InnerBlocks.ButtonBlockAppender,
  });
  const Tag = TagName as "section";

  return (
    <>
      {controls}
      <InspectorControls group="advanced">
        <SelectControl
          __next40pxDefaultSize
          __nextHasNoMarginBottom
          label={__("HTML element", "auvyx-builder")}
          value={TagName}
          options={TAGS.map((tag) => ({ label: `<${tag}>`, value: tag }))}
          onChange={(value: string) => setAttributes({ tagName: value })}
        />
      </InspectorControls>
      <Tag {...innerBlocksProps} />
    </>
  );
}

function save({ attributes }: { attributes: Attributes }) {
  const Tag = (attributes.tagName || "section") as "section";
  return <Tag {...useInnerBlocksProps.save(useBlockProps.save())} />;
}

export const section = { metadata, settings: { edit: Edit, save, icon: group } };
