import { useMergeRefs, useRefEffect } from "@wordpress/compose";
import { useMemo, useState } from "@wordpress/element";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { attachCss } from "@auvyx/canvas-tools";
import { compileBlockStyles, compileScopedCss, type StateId } from "@auvyx/style-engine";
import { getDesignSystem } from "./design-system";
import { useActiveBreakpoint } from "./use-active-breakpoint";

/**
 * Editor preview of a block's auvyx styles. Returns the class, a ref to pass to
 * useBlockProps({ className, ref }) and the rendered element (for the canvas
 * overlay). The frontend class/CSS come from PHP (same engine, same fixtures),
 * so nothing here is saved into post content.
 */
export function useBlockStyles(auvyx: AuvyxAttribute | undefined, { forceState }: { forceState?: StateId } = {}) {
  const [breakpoint] = useActiveBreakpoint();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const compiled = useMemo(
    () =>
      compileBlockStyles(auvyx?.styles, getDesignSystem().breakpoints, {
        simulateBreakpoint: breakpoint,
        forceState,
      }),
    [auvyx, breakpoint, forceState]
  );
  // A forced state changes the CSS but not the class, so key the <style> by both.
  const key = compiled === null ? "" : `${compiled.className}${forceState ? `:${forceState}` : ""}`;
  const ref = useRefEffect<HTMLElement>(
    (node) => {
      setElement(node);
      return compiled === null ? undefined : attachCss(node.ownerDocument, key, compiled.css);
    },
    [key, compiled?.css]
  );
  // The element's own CSS (Studio's Custom CSS), beside the style engine's rules.
  const scoped = useMemo(() => compileScopedCss(auvyx?.css), [auvyx?.css]);
  const scopedRef = useRefEffect<HTMLElement>(
    (node) => (scoped === null ? undefined : attachCss(node.ownerDocument, scoped.className, scoped.css)),
    [scoped?.className]
  );
  const merged = useMergeRefs([ref, scopedRef]);
  const className = [compiled?.className, scoped?.className].filter(Boolean).join(" ") || undefined;
  return { className, ref: merged, element };
}
