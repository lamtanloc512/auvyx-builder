/**
 * editor-core's header and footer builders, for the app. Once packages/editor-core/src/index.ts exports them
 * (`export * as HeaderBuilder from "./headerBuilder"` …), this file can import from "@auvyx/editor-core" instead.
 */
export * as HeaderBuilder from "../../../../packages/editor-core/src/headerBuilder";
export * as FooterBuilder from "../../../../packages/editor-core/src/footerBuilder";
export * as BuilderParts from "../../../../packages/editor-core/src/builderParts";
export { callBuilder, builderRoot, type BuilderContext, type Called } from "../../../../packages/editor-core/src/builderActions";
