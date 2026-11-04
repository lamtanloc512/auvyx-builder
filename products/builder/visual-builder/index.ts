/**
 * Entry for the full-screen visual builder page (handle: auvyx-visual-builder).
 * Registers Auvyx + core blocks (needed to parse/serialize content), then mounts the app.
 */
import { registerCoreBlocks } from "@wordpress/block-library";
import { mountVisualBuilder } from "@auvyx/visual-builder";
import "../editor/index";

registerCoreBlocks();

const root = document.getElementById("auvyx-visual-builder");
if (root && window.auvyxVisualBuilder) {
  mountVisualBuilder(root, window.auvyxVisualBuilder);
}
