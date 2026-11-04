import { useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { separator } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { auvyx?: AuvyxAttribute };

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { className, ref, controls } = useYbBlock({
    auvyx: attributes.auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Divider", "auvyx-builder"),
    initialOpen: ["border", "spacing"],
  });
  return (
    <>
      {controls}
      <hr {...useBlockProps({ className, ref })} />
    </>
  );
}

function save() {
  return <hr {...useBlockProps.save()} />;
}

export const dividerBlock = { metadata, settings: { edit: Edit, save, icon: separator } };
