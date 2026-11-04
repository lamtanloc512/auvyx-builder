import {
  InnerBlocks,
  InspectorControls,
  useBlockProps,
  useInnerBlocksProps,
} from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { PanelBody, RangeControl, SelectControl, ToggleControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { postList } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Query = {
  postType: string;
  perPage: number;
  orderBy: string;
  order: string;
  offset: number;
  inherit: boolean;
  excludeCurrent: boolean;
};
type Attributes = { query: Query; auvyx?: AuvyxAttribute };

/** In the block editor the template shows once; the site repeats it per post (render.php). */
function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { query, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Posts loop", "auvyx-builder"),
  });
  const set = (patch: Partial<Query>) => setAttributes({ query: { ...query, ...patch } });
  const innerBlocksProps = useInnerBlocksProps(useBlockProps({ className, ref }), {
    renderAppender: InnerBlocks.ButtonBlockAppender,
  });
  return (
    <>
      {controls}
      <InspectorControls>
        <PanelBody title={__("Query", "auvyx-builder")}>
          <SelectControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label={__("Order by", "auvyx-builder")}
            value={query.orderBy}
            options={["date", "modified", "title", "menu_order", "comment_count", "rand"].map((v) => ({ label: v, value: v }))}
            onChange={(orderBy: string) => set({ orderBy })}
          />
          <RangeControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label={__("Number of posts", "auvyx-builder")}
            value={query.perPage}
            min={1}
            max={50}
            onChange={(perPage) => set({ perPage: perPage ?? 3 })}
          />
          <ToggleControl
            __nextHasNoMarginBottom
            label={__("Use the page's posts on archives", "auvyx-builder")}
            checked={query.inherit}
            onChange={(inherit) => set({ inherit })}
          />
        </PanelBody>
      </InspectorControls>
      <div {...innerBlocksProps} />
    </>
  );
}

function save() {
  return <div {...useInnerBlocksProps.save(useBlockProps.save())} />;
}

export const loopBlock = { metadata, settings: { edit: Edit, save, icon: postList } };
