import { Button } from "@wordpress/components";
import { useEffect } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { arrowLeft, desktop, external, mobile, redo as redoIcon, tablet, undo as undoIcon } from "@wordpress/icons";
import { getDesignSystem } from "@auvyx/block-kit";
import { sortBreakpoints } from "@auvyx/style-engine";
import { useBuilder } from "./store";

const DEVICE_ICONS = [desktop, tablet, mobile];

export function TopBar() {
  const { state, config, dispatch, actions, dirty } = useBuilder();
  const breakpoints = sortBreakpoints(getDesignSystem().breakpoints).slice(0, DEVICE_ICONS.length);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (state.notice?.kind !== "success") return;
    const timer = window.setTimeout(() => dispatch({ type: "notice", notice: undefined }), 2500);
    return () => window.clearTimeout(timer);
  }, [state.notice, dispatch]);

  return (
    <header className="auvyx-vb-topbar">
      <div className="auvyx-vb-topbar__group">
        <Button icon={arrowLeft} label={__("Exit builder", "auvyx-builder")} href={config.exitUrl} className="auvyx-vb-topbar__exit" />
        <span className="auvyx-vb-brand">Auvyx</span>
        <span className="auvyx-vb-topbar__title">
          {config.isComponent && <span className="auvyx-vb-badge is-component">{__("Component", "auvyx-builder")}</span>}
          {state.title || __("(no title)", "auvyx-builder")}
          {dirty && <span className="auvyx-vb-dot" title={__("Unsaved changes", "auvyx-builder")} />}
        </span>
      </div>
      <div className="auvyx-vb-topbar__group auvyx-vb-segmented-dark" role="group" aria-label={__("Breakpoint", "auvyx-builder")}>
        {breakpoints.map((bp, index) => (
          <Button
            key={bp.id}
            icon={DEVICE_ICONS[index]}
            label={bp.maxWidth ? `${bp.label} (≤ ${bp.maxWidth}px)` : bp.label}
            isPressed={state.breakpoint === bp.id}
            onClick={() => dispatch({ type: "breakpoint", id: bp.id })}
          />
        ))}
      </div>
      <div className="auvyx-vb-topbar__group">
        {state.notice && <span className={`auvyx-vb-notice is-${state.notice.kind}`}>{state.notice.text}</span>}
        <Button icon={undoIcon} label={__("Undo (⌘Z)", "auvyx-builder")} disabled={state.history.past.length === 0} onClick={actions.undo} />
        <Button icon={redoIcon} label={__("Redo (⇧⌘Z)", "auvyx-builder")} disabled={state.history.future.length === 0} onClick={actions.redo} />
        <Button variant="tertiary" href={config.blockEditorUrl}>
          {__("Block editor", "auvyx-builder")}
        </Button>
        {config.viewUrl && (
          <Button icon={external} label={__("View page", "auvyx-builder")} href={config.viewUrl} target="_blank" />
        )}
        <Button variant="primary" isBusy={state.saving} disabled={!dirty || state.saving} onClick={() => void actions.save()}>
          {state.saving ? __("Saving…", "auvyx-builder") : __("Save", "auvyx-builder")}
        </Button>
      </div>
    </header>
  );
}
