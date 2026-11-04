import { BlockControls } from "@wordpress/block-editor";
import { ToolbarButton, ToolbarGroup } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { resizeCornerNE } from "@wordpress/icons";
import { setStyles, type AuvyxAttribute } from "@auvyx/block-ops";
import { CanvasOverlay } from "@auvyx/canvas-tools";
import { getDesignSystem } from "./design-system";
import { setEditorUi, useEditorUi } from "./editor-ui";
import { STATE_LABELS, AuvyxStylePanel } from "./style-panel";
import { getPanelBreakpoints, useActiveBreakpoint } from "./use-active-breakpoint";
import { useBlockStyles } from "./use-block-styles";

export type UseYbBlockOptions = {
  auvyx: AuvyxAttribute | undefined;
  setYb: (next: AuvyxAttribute | undefined) => void;
  isSelected: boolean;
  /** Shown on the canvas badge, e.g. "Section". */
  title: string;
  /** Style panel groups opened by default. */
  initialOpen?: readonly string[];
};

/**
 * Everything an Auvyx block needs in edit(): preview class + ref for
 * useBlockProps, and `controls` (style panel, toolbar toggle, canvas handles).
 */
export function useYbBlock({ auvyx, setYb, isSelected, title, initialOpen }: UseYbBlockOptions) {
  const ui = useEditorUi();
  const [breakpoint] = useActiveBreakpoint();
  const { className, ref, element } = useBlockStyles(auvyx, {
    forceState: isSelected && ui.styleState !== "default" ? ui.styleState : undefined,
  });
  const target = { breakpoint, state: ui.styleState };
  const breakpointLabel = getPanelBreakpoints().find((bp) => bp.id === breakpoint)?.label ?? breakpoint;
  const badge = [title, breakpointLabel, ui.styleState === "default" ? undefined : STATE_LABELS[ui.styleState]]
    .filter(Boolean)
    .join(" · ");

  const controls = (
    <>
      <AuvyxStylePanel value={auvyx} onChange={setYb} initialOpen={initialOpen} />
      <BlockControls group="other">
        <ToolbarGroup>
          <ToolbarButton
            icon={resizeCornerNE}
            label={
              ui.showHandles
                ? __("Hide canvas handles", "auvyx-builder")
                : __("Show canvas handles", "auvyx-builder")
            }
            isPressed={ui.showHandles}
            onClick={() => setEditorUi({ showHandles: !ui.showHandles })}
          />
        </ToolbarGroup>
      </BlockControls>
      {isSelected && ui.showHandles && element && (
        <CanvasOverlay
          element={element}
          label={badge}
          spacingTokens={getDesignSystem().tokens.spacing}
          onChange={(patch) => setYb(setStyles(auvyx, target, patch))}
        />
      )}
    </>
  );

  return { className, ref, controls };
}
