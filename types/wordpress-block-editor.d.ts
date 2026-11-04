/**
 * @wordpress/block-editor ships without complete types. Only what Auvyx uses is
 * declared here; extend as needed (keep to stable, public APIs — ADR 0008).
 */
declare module "@wordpress/block-editor" {
  import type { ComponentType, ReactNode, Ref } from "react";

  type Props = Record<string, unknown> & {
    className?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- block props spread onto any element type
    ref?: Ref<any>;
    children?: ReactNode;
  };

  export const useBlockProps: {
    (props?: Props): Props;
    save(props?: Props): Props;
  };

  export const useInnerBlocksProps: {
    (props?: Props, options?: Record<string, unknown>): Props;
    save(props?: Props): Props;
  };

  export const InnerBlocks: ComponentType<Record<string, unknown>> & {
    ButtonBlockAppender: ComponentType;
    DefaultBlockAppender: ComponentType;
    Content: ComponentType;
  };

  type RichTextProps = Props & {
    tagName: string;
    value?: unknown;
    onChange?: (value: string) => void;
    placeholder?: string;
    allowedFormats?: string[];
    withoutInteractiveFormatting?: boolean;
    identifier?: string;
  };

  export const RichText: ComponentType<RichTextProps> & {
    Content: ComponentType<Props & { tagName?: string; value?: unknown }>;
  };

  export const InspectorControls: ComponentType<{ group?: string; children?: ReactNode }>;
  export const BlockControls: ComponentType<{ group?: string; children?: ReactNode }>;

  export function useSettings(...paths: string[]): unknown[];
}

declare module "@wordpress/block-editor" {
  export const BlockIcon: import("react").ComponentType<{ icon?: unknown; showColors?: boolean }>;
}

declare module "@wordpress/block-library" {
  export function registerCoreBlocks(blocks?: unknown[]): void;
}

declare module "@wordpress/block-editor" {
  type MediaItem = { url: string; alt?: string; id?: number };
  export const MediaPlaceholder: import("react").ComponentType<{
    icon?: unknown;
    labels?: { title?: string; instructions?: string };
    accept?: string;
    allowedTypes?: string[];
    onSelect: (media: MediaItem) => void;
  }>;
  export const MediaUpload: import("react").ComponentType<{
    allowedTypes?: string[];
    onSelect: (media: MediaItem) => void;
    render: (props: { open: () => void }) => import("react").ReactNode;
  }>;
  export const MediaUploadCheck: import("react").ComponentType<{ children?: import("react").ReactNode }>;
}
