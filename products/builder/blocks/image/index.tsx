import { InspectorControls, MediaPlaceholder, MediaUpload, MediaUploadCheck, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { Button, PanelBody, TextControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { image } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = { url?: string; alt: string; href?: string; id?: number; auvyx?: AuvyxAttribute };
type Media = { url: string; alt?: string; id?: number };

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { url, alt, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Image", "auvyx-builder"),
    initialOpen: ["size", "border"],
  });
  const blockProps = useBlockProps({ className, ref });
  // The attachment id lets WordPress add srcset/sizes/width/height when the page renders.
  const pick = (media: Media) => setAttributes({ url: media.url, alt: media.alt ?? "", id: media.id });

  if (!url) {
    return (
      <>
        {controls}
        <div {...blockProps}>
          <MediaPlaceholder icon={image} labels={{ title: __("Image", "auvyx-builder") }} accept="image/*" allowedTypes={["image"]} onSelect={pick} />
        </div>
      </>
    );
  }
  return (
    <>
      {controls}
      <InspectorControls>
        <PanelBody title={__("Image", "auvyx-builder")}>
          <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label={__("Alternative text", "auvyx-builder")} value={alt} onChange={(value) => setAttributes({ alt: value })} />
          <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label={__("Link", "auvyx-builder")} value={attributes.href ?? ""} placeholder="https://" onChange={(value) => setAttributes({ href: value || undefined })} />
          <MediaUploadCheck>
            <MediaUpload
              allowedTypes={["image"]}
              onSelect={pick}
              render={({ open }) => (
                <Button variant="secondary" onClick={open}>
                  {__("Replace image", "auvyx-builder")}
                </Button>
              )}
            />
          </MediaUploadCheck>
        </PanelBody>
      </InspectorControls>
      <img {...blockProps} src={url} alt={alt} />
    </>
  );
}

function save({ attributes }: { attributes: Attributes }) {
  const props = useBlockProps.save();
  // Linked image: the link is the block root (classes/id), the <img> sits inside. Mirrors BlockMarkup.scala.
  return attributes.href ? (
    <a {...props} href={attributes.href}>
      <img src={attributes.url} alt={attributes.alt} />
    </a>
  ) : (
    <img {...props} src={attributes.url} alt={attributes.alt} />
  );
}

export const imageBlock = { metadata, settings: { edit: Edit, save, icon: image } };
