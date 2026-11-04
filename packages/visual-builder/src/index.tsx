import "./builder.css";
import { InnerBlocks } from "@wordpress/block-editor";
import { registerBlockType } from "@wordpress/blocks";
import { createRoot } from "@wordpress/element";
import { getDesignSystem } from "@auvyx/block-kit";
import { sortBreakpoints } from "@auvyx/style-engine";
import { App } from "./app";
import { INSTANCE_BLOCK } from "./canvas-tree";
import type { BuilderConfig } from "./config";
import { BuilderProvider, createInitialState } from "./store";

export type { BuilderConfig } from "./config";

/** Client-only block used to render component instances on the canvas; never saved. */
const registerCanvasBlocks = () =>
  registerBlockType(INSTANCE_BLOCK, {
    apiVersion: 3,
    title: "Component instance",
    category: "auvyx-builder",
    attributes: { ref: { type: "number" } },
    supports: { inserter: false, html: false },
    edit: () => null,
    save: ({ attributes }: { attributes: { ref?: number } }) => (
      <div className="auvyx-instance" data-auvyx-component={attributes.ref}>
        <InnerBlocks.Content />
      </div>
    ),
  } as never);

export function mountVisualBuilder(element: HTMLElement, config: BuilderConfig) {
  registerCanvasBlocks();
  const firstBreakpoint = sortBreakpoints(getDesignSystem().breakpoints)[0]?.id ?? "base";
  createRoot(element).render(
    <BuilderProvider config={config} initial={createInitialState(config, firstBreakpoint)}>
      <App />
    </BuilderProvider>
  );
}
