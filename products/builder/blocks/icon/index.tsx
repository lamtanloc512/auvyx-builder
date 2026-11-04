import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { Button, PanelBody, TextControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { starEmpty } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import iconSet from "@auvyx/shared/icons.json";
import metadata from "./block.json";

type Attributes = { icon: string; href?: string; auvyx?: AuvyxAttribute };

const ICONS: Record<string, string> = iconSet.icons;
const svg = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>`;

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { icon, auvyx } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Icon", "auvyx-builder"),
    initialOpen: ["typography", "size"],
  });
  return (
    <>
      {controls}
      <InspectorControls>
        <PanelBody title={__("Icon", "auvyx-builder")}>
          <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label={__("Link", "auvyx-builder")} value={attributes.href ?? ""} placeholder="https://" onChange={(value) => setAttributes({ href: value || undefined })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
            {Object.keys(ICONS).map((name) => (
              <Button key={name} label={name} isPressed={name === icon} onClick={() => setAttributes({ icon: name })}>
                <span style={{ width: 20, height: 20, display: "inline-flex" }} dangerouslySetInnerHTML={{ __html: svg(name) }} />
              </Button>
            ))}
          </div>
        </PanelBody>
      </InspectorControls>
      {/* Trusted, generated SVG (shared/icons.json); the frontend renders the same via render.php. */}
      <span {...useBlockProps({ className, ref })} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg(icon) }} />
    </>
  );
}

export const iconBlock = { metadata, settings: { edit: Edit, save: () => null, icon: starEmpty } };
