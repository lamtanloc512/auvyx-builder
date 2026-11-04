/**
 * Single editor bundle for all Auvyx blocks (handle: auvyx-builder-editor).
 * Server-side metadata comes from blocks/<name>/block.json via the manifest.
 */
import { registerBlockType, type BlockConfiguration } from "@wordpress/blocks";
import { accordionBlock } from "../blocks/accordion";
import { buttonBlock } from "../blocks/button";
import { dividerBlock } from "../blocks/divider";
import { iconBlock } from "../blocks/icon";
import { imageBlock } from "../blocks/image";
import { carouselBlock } from "../blocks/carousel";
import { loopBlock } from "../blocks/loop";
import { navBlock } from "../blocks/nav";
import { vectorBlock } from "../blocks/vector";
import { videoBlock } from "../blocks/video";
import { headingBlock } from "../blocks/heading";
import { section } from "../blocks/section";
import { text } from "../blocks/text";
import { snippetBlock } from "../blocks/snippet";

for (const { metadata, settings } of [
  section,
  headingBlock,
  text,
  snippetBlock,
  buttonBlock,
  imageBlock,
  iconBlock,
  dividerBlock,
  videoBlock,
  vectorBlock,
  accordionBlock,
  loopBlock,
  carouselBlock,
  navBlock,
]) {
  registerBlockType(metadata as unknown as BlockConfiguration, settings as never);
}
