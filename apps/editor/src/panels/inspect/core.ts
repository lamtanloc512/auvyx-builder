export { KINDS, LEVELS, SECTION_TAGS, ancestors, parentOf, setVisibility, visibilityOf, type El, type Level } from "@auvyx/editor-core";
import { resolveValue, type Breakpoint } from "@auvyx/style-engine";
import { SCREENS } from "../../lib/store.svelte";
/** The value an element shows at a screen (Normal state), walking the cascade. */
export const resolveSt = (styles: import("@auvyx/style-engine").Styles, bp: string, prop: string) => resolveValue(styles, SCREENS as Breakpoint[], bp, "default", prop)?.value;
