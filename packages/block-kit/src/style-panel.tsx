import { InspectorControls, useSettings } from "@wordpress/block-editor";
import { mergePalette, StyleEditor, type StyleEditorProps } from "./style-editor";
import { useActiveBreakpoint } from "./use-active-breakpoint";

export { STATE_LABELS } from "./style-editor";

export type AuvyxStylePanelProps = Pick<StyleEditorProps, "value" | "onChange" | "initialOpen">;

/** Block editor host: Styles tab of the inspector, breakpoint = editor device preview. */
export function AuvyxStylePanel(props: AuvyxStylePanelProps) {
  const [breakpoint, setBreakpoint] = useActiveBreakpoint();
  const [palette] = useSettings("color.palette");
  return (
    <InspectorControls group="styles">
      <StyleEditor
        {...props}
        breakpoint={breakpoint}
        onBreakpointChange={setBreakpoint}
        palette={mergePalette(palette)}
      />
    </InspectorControls>
  );
}
